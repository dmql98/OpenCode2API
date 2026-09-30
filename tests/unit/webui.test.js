import request from 'supertest';
import { jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Config and secrets must never be the operator's real files while tests run.
// Paths are resolved per call (see src/config.js), so pointing the env vars at a
// scratch directory in beforeAll is enough — no module reload required.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'o2a-webui-'));
const configPath = path.join(tmpDir, 'config.json');
const secretsPath = path.join(tmpDir, 'secrets.json');

const savedEnv = {
    OPENCODE_CONFIG_PATH: process.env.OPENCODE_CONFIG_PATH,
    OPENCODE_SECRETS_PATH: process.env.OPENCODE_SECRETS_PATH
};

jest.unstable_mockModule('@opencode-ai/sdk', () => ({
    createOpencodeClient: jest.fn(() => ({
        config: { providers: jest.fn(async () => ({ data: { providers: [] } })) },
        session: { create: jest.fn(), prompt: jest.fn(), messages: jest.fn(async () => []), delete: jest.fn(), abort: jest.fn() },
        event: { subscribe: jest.fn() },
        tool: { ids: jest.fn() }
    }))
}));

const { createApp } = await import('../../src/proxy.js');

function baseConfig(overrides = {}) {
    return {
        PORT: 10000,
        API_KEY: 'test-key',
        OPENCODE_SERVER_URL: 'http://127.0.0.1:59999',
        OPENCODE_SERVER_PASSWORD: '',
        BIND_HOST: '127.0.0.1',
        REQUEST_TIMEOUT_MS: 2000,
        DEBUG: false,
        DISABLE_TOOLS: true,
        EXTERNAL_TOOLS_MODE: 'proxy-bridge',
        EXTERNAL_TOOLS_CONFLICT_POLICY: 'namespace',
        HEALTH_DETAILS_ENABLED: true,
        HEALTH_DETAILS_REQUIRE_AUTH: true,
        METRICS_ENABLED: true,
        METRICS_REQUIRE_AUTH: true,
        PROMPT_MODE: 'standard',
        OMIT_SYSTEM_PROMPT: false,
        ...overrides
    };
}

const auth = (key) => ({ Authorization: `Bearer ${key}` });

describe('WebUI', () => {
    let app;

    beforeAll(() => {
        process.env.OPENCODE_CONFIG_PATH = configPath;
        process.env.OPENCODE_SECRETS_PATH = secretsPath;
        fs.writeFileSync(configPath, JSON.stringify({ PORT: 10000, DEBUG: false }, null, 4), 'utf8');
        app = createApp(baseConfig()).app;
    });

    afterAll(() => {
        for (const [name, value] of Object.entries(savedEnv)) {
            if (value === undefined) delete process.env[name];
            else process.env[name] = value;
        }
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    afterEach(() => {
        if (fs.existsSync(secretsPath)) fs.rmSync(secretsPath, { force: true });
    });

    test('serves the WebUI shell without a key so the page can ask for one', async () => {
        const res = await request(app).get('/');
        expect(res.statusCode).toEqual(200);
        expect(res.text).toContain('opencode2api');

        const js = await request(app).get('/app.js');
        expect(js.statusCode).toEqual(200);
    });

    test('GET /api/status is gated by the bearer key', async () => {
        const denied = await request(app).get('/api/status');
        expect(denied.statusCode).toEqual(401);

        const ok = await request(app).get('/api/status').set(auth('test-key'));
        expect(ok.statusCode).toEqual(200);
        expect(ok.body.name).toEqual('opencode2api');
        expect(ok.body.listen.port).toEqual(10000);
        expect(ok.body.auth.configured).toBe(true);
        expect(Array.isArray(ok.body.listen.endpoints)).toBe(true);
        expect(ok.body.backend.url).toEqual('http://127.0.0.1:59999');
    });

    test('GET /api/config exposes the editable schema and stored values', async () => {
        const res = await request(app).get('/api/config').set(auth('test-key'));
        expect(res.statusCode).toEqual(200);
        expect(res.body.fields.map((f) => f.key)).toContain('BIND_HOST');
        expect(res.body.values.PORT).toEqual(10000);
        expect(res.body.fields.find((f) => f.key === 'DEBUG').hot).toBe(true);
        expect(res.body.fields.find((f) => f.key === 'BIND_HOST').hot).toBe(false);
    });

    test('POST /api/config validates and persists only known fields', async () => {
        const rejected = await request(app)
            .post('/api/config')
            .set(auth('test-key'))
            .send({ values: { PORT: 70000 } });
        expect(rejected.statusCode).toEqual(400);
        expect(rejected.body.error.message).toContain('端口');

        const accepted = await request(app)
            .post('/api/config')
            .set(auth('test-key'))
            .send({ values: { BIND_HOST: '0.0.0.0', NOT_A_REAL_FIELD: 'ignored' } });
        expect(accepted.statusCode).toEqual(200);
        expect(accepted.body.changed).toEqual(['BIND_HOST']);
        expect(accepted.body.restartRequired).toEqual(['BIND_HOST']);

        const stored = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        expect(stored.BIND_HOST).toEqual('0.0.0.0');
        expect(stored.NOT_A_REAL_FIELD).toBeUndefined();
    });

    test('keys created in the UI become usable credentials immediately', async () => {
        const created = await request(app)
            .post('/api/keys')
            .set(auth('test-key'))
            .send({ name: 'lan-laptop' });
        expect(created.statusCode).toEqual(201);
        expect(created.body.key.key).toMatch(/^oc_sk_/);
        expect(created.body.key.masked).toContain('...');

        const plain = created.body.key.plain;

        // The freshly minted key authenticates without any restart.
        const status = await request(app).get('/api/status').set(auth(plain));
        expect(status.statusCode).toEqual(200);

        const listed = await request(app).get('/api/keys').set(auth('test-key'));
        expect(listed.body.keys.map((k) => k.name)).toContain('lan-laptop');
        expect(listed.body.keys.some((k) => k.key)).toBe(false);

        // Revoking drops it from the active set right away.
        const revoked = await request(app)
            .post(`/api/keys/${created.body.key.id}/revoke`)
            .set(auth('test-key'));
        expect(revoked.statusCode).toEqual(200);
        expect((await request(app).get('/api/status').set(auth(plain))).statusCode).toEqual(401);

        const removed = await request(app)
            .delete(`/api/keys/${created.body.key.id}`)
            .set(auth('test-key'));
        expect(removed.statusCode).toEqual(200);
        const afterDelete = (await request(app).get('/api/keys').set(auth('test-key'))).body.keys;
        expect(afterDelete.map((k) => k.id)).toEqual(['config-api-key']);
    });

    test('the legacy config.json API_KEY migrates into secrets.json', async () => {
        const before = await request(app).get('/api/keys').set(auth('test-key'));
        expect(before.body.keys.some((k) => k.id === 'config-api-key')).toBe(true);

        const migrated = await request(app).post('/api/keys/migrate').set(auth('test-key'));
        expect(migrated.statusCode).toEqual(200);

        const stored = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        expect(stored.API_KEY).toBeUndefined();

        const secrets = JSON.parse(fs.readFileSync(secretsPath, 'utf8'));
        expect(secrets.keys).toHaveLength(1);
        expect(secrets.keys[0].key).toEqual('test-key');

        // The migrated key keeps working, now revocable from the UI.
        expect((await request(app).get('/api/status').set(auth('test-key'))).statusCode).toEqual(200);
        expect((await request(app).get('/api/keys').set(auth('test-key'))).body.keys).toHaveLength(1);
    });

    test('GET /api/logs reports the log inventory even when the log dir is empty', async () => {
        const res = await request(app).get('/api/logs?lines=50').set(auth('test-key'));
        expect(res.statusCode).toEqual(200);
        expect(Array.isArray(res.body.files)).toBe(true);
        expect(Array.isArray(res.body.lines)).toBe(true);
    });

    test('GET /api/stats and reset are reachable with a key', async () => {
        const res = await request(app).get('/api/stats').set(auth('test-key'));
        expect(res.statusCode).toEqual(200);
        expect(typeof res.body.requests).toBe('number');

        const reset = await request(app).post('/api/stats/reset').set(auth('test-key'));
        expect(reset.statusCode).toEqual(200);
        expect((await request(app).get('/api/stats').set(auth('test-key'))).body.requests).toBeGreaterThanOrEqual(0);
    });
});

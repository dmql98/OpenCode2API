import fs from 'fs';
import path from 'path';
import express from 'express';
import { fileURLToPath } from 'url';
import {
    getConfigFilePath,
    getSecretsFilePath,
    getConfigFile,
    PUBLIC_DIR,
    EDITABLE_CONFIG_FIELDS,
    applyConfigPatch,
    listKeys,
    createKey,
    revokeKey,
    deleteKey,
    migrateConfigKey,
    maskKey,
    keyUsage,
    lanEndpoints,
    tailLog,
    listLogFiles
} from './config.js';
import { snapshotStats, resetStats } from './stats.js';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));

// Static assets are served unauthenticated so the page can render and prompt for
// a key; every /api/* route below still goes through the normal bearer check.
export function mountWebui(app) {
    app.use(express.static(PUBLIC_DIR, { index: 'index.html', maxAge: '1h' }));
}

export function createWebuiRouter({ config, backendHealth }) {
    const router = express.Router();

    router.get('/status', async (_req, res) => {
        let backend = { reachable: false };
        try {
            backend = await backendHealth();
        } catch (error) {
            backend = { reachable: false, error: error.message };
        }

        const keys = listKeys(config.API_KEY);
        res.json({
            name: 'opencode2api',
            version: packageJson.version,
            node: process.version,
            platform: process.platform,
            uptimeMs: Math.round(process.uptime() * 1000),
            configPath: path.basename(getConfigFilePath()),
            secretsPath: path.basename(getSecretsFilePath()),
            configExists: fs.existsSync(getConfigFilePath()),
            secretsExists: fs.existsSync(getSecretsFilePath()),
            listen: {
                host: config.BIND_HOST,
                port: config.PORT,
                endpoints: lanEndpoints(config.PORT, config.BIND_HOST)
            },
            backend: {
                url: config.OPENCODE_SERVER_URL,
                managed: Boolean(config.MANAGE_BACKEND),
                ...backend
            },
            auth: {
                configured: keys.some((entry) => !entry.revoked),
                keys: keys.length,
                activeKeys: keys.filter((entry) => !entry.revoked).length
            },
            debug: Boolean(config.DEBUG),
            stats: snapshotStats()
        });
    });

    router.get('/config', (_req, res) => {
        const stored = JSON.parse(JSON.stringify(getConfigFile()));
        const values = {};
        for (const field of EDITABLE_CONFIG_FIELDS) {
            values[field.key] = stored[field.key] ?? config[field.key] ?? null;
        }
        res.json({ fields: EDITABLE_CONFIG_FIELDS, values });
    });

    router.post('/config', (req, res) => {
        try {
            const { config: saved, changed } = applyConfigPatch(req.body?.values || {});
            // Hot fields are mirrored into the running process; the rest need a restart
            // and the UI is told exactly which.
            for (const field of EDITABLE_CONFIG_FIELDS) {
                if (!field.hot || !(field.key in saved)) continue;
                config[field.key] = saved[field.key];
            }
            res.json({
                ok: true,
                changed,
                restartRequired: changed.filter((key) => !EDITABLE_CONFIG_FIELDS.find((f) => f.key === key)?.hot)
            });
        } catch (error) {
            res.status(400).json({ error: { message: error.message } });
        }
    });

    router.get('/keys', (_req, res) => {
        res.json({
            keys: listKeys(config.API_KEY).map((entry) => ({
                id: entry.id,
                name: entry.name,
                source: entry.source,
                readOnly: entry.readOnly,
                revoked: entry.revoked,
                createdAt: entry.createdAt,
                masked: maskKey(entry.key),
                lastUsedAt: keyUsage(entry.key)
            }))
        });
    });

    router.post('/keys', (req, res) => {
        const entry = createKey(req.body?.name);
        res.status(201).json({ key: { ...entry, masked: maskKey(entry.key), plain: entry.key } });
    });

    router.post('/keys/migrate', (_req, res) => {
        const result = migrateConfigKey(config.API_KEY);
        if (result.migrated) {
            config.API_KEY = '';
            return res.json({ ok: true });
        }
        res.status(400).json({ error: { message: result.reason } });
    });

    router.post('/keys/:id/revoke', (req, res) => {
        if (revokeKey(req.params.id)) return res.json({ ok: true });
        res.status(404).json({ error: { message: '密钥不存在' } });
    });

    router.delete('/keys/:id', (req, res) => {
        if (deleteKey(req.params.id)) return res.json({ ok: true });
        res.status(404).json({ error: { message: '密钥不存在' } });
    });

    router.get('/logs', (req, res) => {
        const lines = Math.min(Math.max(parseInt(req.query.lines, 10) || 200, 10), 2000);
        const file = String(req.query.file || 'proxy.log');
        res.json({ files: listLogFiles(), ...tailLog(lines, file) });
    });

    router.get('/stats', (_req, res) => res.json(snapshotStats()));

    router.post('/stats/reset', (_req, res) => {
        resetStats();
        res.json({ ok: true });
    });

    return router;
}

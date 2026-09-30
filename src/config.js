import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT_DIR = path.resolve(__dirname, '..');
export const CONFIG_PATH = path.join(ROOT_DIR, 'config.json');
export const SECRETS_PATH = path.join(ROOT_DIR, 'secrets.json');
export const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
export const LOG_DIR = path.join(ROOT_DIR, 'logs');

// Resolved per call so tests (and multi-instance runs) can point at another
// file without reloading the module.
export const getConfigFilePath = () => process.env.OPENCODE_CONFIG_PATH || CONFIG_PATH;
export const getSecretsFilePath = () => process.env.OPENCODE_SECRETS_PATH || SECRETS_PATH;


function readJson(filePath, fallback) {
    if (!fs.existsSync(filePath)) return fallback;
    try {
        // Strip a UTF-8 BOM: editors on Windows happily add one and JSON.parse chokes.
        const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
        return JSON.parse(raw);
    } catch (error) {
        console.error(`[Config] Failed to parse ${path.basename(filePath)}: ${error.message}`);
        return fallback;
    }
}

function writeJson(filePath, data) {
    const directory = path.dirname(filePath);
    if (!fs.existsSync(directory)) fs.mkdirSync(directory, { recursive: true });
    const tmpPath = `${filePath}.tmp`;
    fs.writeFileSync(tmpPath, `${JSON.stringify(data, null, 4)}\n`, 'utf8');
    fs.renameSync(tmpPath, filePath);
}

export function getConfigFile() {
    return readJson(getConfigFilePath(), {});
}

export function saveConfigFile(config) {
    writeJson(getConfigFilePath(), config);
    return config;
}

// Config fields the WebUI may edit. `hot` fields take effect without a restart;
// everything else is written to config.json and picked up on the next boot.
export const EDITABLE_CONFIG_FIELDS = [
    { key: 'PORT', type: 'number', label: '端口', group: 'network', min: 1, max: 65535, hot: false },
    { key: 'BIND_HOST', type: 'string', label: '监听地址', group: 'network', hot: false, hint: '0.0.0.0 = 局域网可访问' },
    { key: 'OPENCODE_SERVER_URL', type: 'string', label: 'OpenCode 后端地址', group: 'network', hot: false },
    { key: 'OPENCODE_SERVER_PASSWORD', type: 'password', label: 'OpenCode 后端密码', group: 'network', hot: false },
    { key: 'REQUEST_TIMEOUT_MS', type: 'number', label: '请求超时 (ms)', group: 'runtime', min: 1000, hot: false },
    { key: 'DEBUG', type: 'boolean', label: '调试日志', group: 'runtime', hot: true },
    { key: 'DISABLE_TOOLS', type: 'boolean', label: '禁用 OpenCode 内置工具', group: 'runtime', hot: false },
    { key: 'PROMPT_MODE', type: 'select', label: 'Prompt 模式', group: 'runtime', options: ['standard', 'plugin-inject'], hot: false },
    { key: 'OMIT_SYSTEM_PROMPT', type: 'boolean', label: '忽略传入的 system prompt', group: 'runtime', hot: false },
    { key: 'AUTO_CLEANUP_CONVERSATIONS', type: 'boolean', label: '自动清理会话', group: 'cleanup', hot: false },
    { key: 'CLEANUP_INTERVAL_MS', type: 'number', label: '清理间隔 (ms)', group: 'cleanup', min: 1000, hot: false },
    { key: 'CLEANUP_MAX_AGE_MS', type: 'number', label: '会话最长保留 (ms)', group: 'cleanup', min: 1000, hot: false },
    { key: 'HEALTH_DETAILS_ENABLED', type: 'boolean', label: '启用 /health/details', group: 'expose', hot: false },
    { key: 'HEALTH_DETAILS_REQUIRE_AUTH', type: 'boolean', label: '/health/details 需要鉴权', group: 'expose', hot: false },
    { key: 'METRICS_ENABLED', type: 'boolean', label: '启用 /metrics', group: 'expose', hot: false },
    { key: 'METRICS_REQUIRE_AUTH', type: 'boolean', label: '/metrics 需要鉴权', group: 'expose', hot: false }
];

const EDITABLE_FIELD_MAP = new Map(EDITABLE_CONFIG_FIELDS.map((field) => [field.key, field]));

export function coerceConfigValue(field, rawValue) {
    if (rawValue === undefined || rawValue === null) return undefined;
    if (field.type === 'number') {
        const value = Number(rawValue);
        if (!Number.isFinite(value)) throw new Error(`${field.label} 必须是数字`);
        if (field.min !== undefined && value < field.min) throw new Error(`${field.label} 不能小于 ${field.min}`);
        if (field.max !== undefined && value > field.max) throw new Error(`${field.label} 不能大于 ${field.max}`);
        return Math.floor(value);
    }
    if (field.type === 'boolean') return Boolean(rawValue);
    if (field.type === 'select') {
        if (!field.options.includes(String(rawValue))) {
            throw new Error(`${field.label} 只能是 ${field.options.join(' / ')}`);
        }
        return String(rawValue);
    }
    return String(rawValue).trim();
}

export function applyConfigPatch(patch) {
    const current = getConfigFile();
    const changed = [];
    for (const [key, rawValue] of Object.entries(patch || {})) {
        const field = EDITABLE_FIELD_MAP.get(key);
        if (!field) continue;
        const value = coerceConfigValue(field, rawValue);
        if (current[key] === value) continue;
        current[key] = value;
        changed.push(key);
    }
    if (changed.length) saveConfigFile(current);
    return { config: current, changed };
}

export function getSecrets() {
    const secrets = readJson(getSecretsFilePath(), {});
    if (!Array.isArray(secrets.keys)) secrets.keys = [];
    return secrets;
}

export function saveSecrets(secrets) {
    writeJson(getSecretsFilePath(), secrets);
    return secrets;
}

export function generateApiKey() {
    return `oc_sk_${crypto.randomBytes(18).toString('base64url')}`;
}

// `configAPIKey` is the legacy inline key from config.json. It is presented as a
// read-only entry so operators can see it next to the keys they manage in the UI.
export function listKeys(configAPIKey = '') {
    const { keys } = getSecrets();
    const entries = [];
    if (typeof configAPIKey === 'string' && configAPIKey.trim() !== '') {
        entries.push({
            id: 'config-api-key',
            name: 'config.json · API_KEY',
            key: configAPIKey.trim(),
            source: 'config.json',
            readOnly: true,
            revoked: false,
            createdAt: null
        });
    }
    for (const key of keys) {
        entries.push({
            id: key.id,
            name: key.name || '未命名',
            key: key.key,
            source: 'secrets.json',
            readOnly: false,
            revoked: Boolean(key.revoked),
            createdAt: key.createdAt || null
        });
    }
    return entries;
}

export function activeKeys(configAPIKey = '') {
    return listKeys(configAPIKey)
        .filter((entry) => !entry.revoked && entry.key)
        .map((entry) => entry.key);
}

export function createKey(name) {
    const secrets = getSecrets();
    const entry = {
        id: `k_${crypto.randomBytes(6).toString('hex')}`,
        name: String(name || '').trim() || `密钥 ${secrets.keys.length + 1}`,
        key: generateApiKey(),
        createdAt: new Date().toISOString(),
        revoked: false
    };
    secrets.keys.push(entry);
    saveSecrets(secrets);
    return { ...entry, source: 'secrets.json', readOnly: false };
}

export function revokeKey(id) {
    const secrets = getSecrets();
    const entry = secrets.keys.find((item) => item.id === id);
    if (!entry) return false;
    entry.revoked = true;
    saveSecrets(secrets);
    return true;
}

export function deleteKey(id) {
    const secrets = getSecrets();
    const next = secrets.keys.filter((item) => item.id !== id);
    if (next.length === secrets.keys.length) return false;
    secrets.keys = next;
    saveSecrets(secrets);
    return true;
}

// Move the legacy config.json key into secrets.json so it can be revoked from the UI.
export function migrateConfigKey(configAPIKey) {
    const value = typeof configAPIKey === 'string' ? configAPIKey.trim() : '';
    if (!value) return { migrated: false, reason: 'config.json 中没有 API_KEY' };
    const secrets = getSecrets();
    if (secrets.keys.some((entry) => entry.key === value)) {
        return { migrated: false, reason: '该密钥已存在于 secrets.json' };
    }
    secrets.keys.push({
        id: `k_${crypto.randomBytes(6).toString('hex')}`,
        name: 'config.json 迁移密钥',
        key: value,
        createdAt: new Date().toISOString(),
        revoked: false
    });
    saveSecrets(secrets);
    const config = getConfigFile();
    delete config.API_KEY;
    saveConfigFile(config);
    return { migrated: true };
}

export function maskKey(key) {
    const value = String(key || '');
    if (value.length <= 12) return value ? `${value.slice(0, 4)}****` : '';
    return `${value.slice(0, 9)}...${value.slice(-4)}`;
}

const lastUsedAt = new Map();

export function touchKey(key) {
    lastUsedAt.set(key, Date.now());
}

export function keyUsage(key) {
    return lastUsedAt.get(key) || null;
}

export function resetKeyUsage() {
    lastUsedAt.clear();
}

// No keys configured anywhere means the gateway runs open (same as before), so
// an empty bearer header must not be rejected just because secrets.json exists
// but holds only revoked entries.
export function isAuthorized(authorizationHeader, configAPIKey = '') {
    const keys = activeKeys(configAPIKey);
    if (keys.length === 0) return { ok: true, openMode: true };
    if (typeof authorizationHeader !== 'string' || !authorizationHeader.startsWith('Bearer ')) {
        return { ok: false, openMode: false };
    }
    const token = authorizationHeader.slice('Bearer '.length).trim();
    if (keys.includes(token)) {
        touchKey(token);
        return { ok: true, openMode: false, key: token };
    }
    return { ok: false, openMode: false };
}

export function lanEndpoints(port, bindHost = '0.0.0.0') {
    const endpoints = [];
    if (bindHost && bindHost !== '0.0.0.0' && bindHost !== '::') {
        endpoints.push({ label: '监听地址', host: bindHost, url: `http://${formatHost(bindHost)}:${port}` });
    }
    endpoints.push({ label: '本机', host: '127.0.0.1', url: `http://127.0.0.1:${port}` });

    const seen = new Set(['127.0.0.1']);
    for (const [iface, addresses] of Object.entries(os.networkInterfaces())) {
        for (const address of addresses || []) {
            if (address.internal || address.family !== 'IPv4') continue;
            if (seen.has(address.address)) continue;
            seen.add(address.address);
            endpoints.push({ label: `局域网 · ${iface}`, host: address.address, url: `http://${address.address}:${port}` });
        }
    }
    return endpoints;
}

function formatHost(host) {
    return host.includes(':') ? `[${host}]` : host;
}

export function tailLog(lines = 200, fileName = 'proxy.log') {
    const safeName = path.basename(fileName);
    const filePath = path.join(LOG_DIR, safeName);
    if (!fs.existsSync(filePath)) return { file: safeName, lines: [] };
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const all = content.split(/\r?\n/);
        return { file: safeName, lines: all.slice(Math.max(0, all.length - lines)) };
    } catch (error) {
        return { file: safeName, lines: [], error: error.message };
    }
}

export function listLogFiles() {
    if (!fs.existsSync(LOG_DIR)) return [];
    return fs.readdirSync(LOG_DIR).filter((name) => name.endsWith('.log')).sort();
}

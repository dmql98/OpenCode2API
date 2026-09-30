import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CMD = process.argv[2] || 'start';
const LOG_DIR = path.join(__dirname, 'logs');

const useColor = process.stdout.isTTY;
const c = {
  dim: s => (useColor ? `\x1b[2m${s}\x1b[0m` : s),
  green: s => (useColor ? `\x1b[32m${s}\x1b[0m` : s),
  red: s => (useColor ? `\x1b[31m${s}\x1b[0m` : s),
  yellow: s => (useColor ? `\x1b[33m${s}\x1b[0m` : s),
  bold: s => (useColor ? `\x1b[1m${s}\x1b[0m` : s),
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const say = s => console.log(s);
const ok = s => say(`  ${c.green('OK')}  ${s}`);
const bad = s => say(`  ${c.red('ERR')} ${s}`);
const warn = s => say(`  ${c.yellow('!!')}  ${s}`);

function die(msg) {
  bad(msg);
  process.exit(1);
}

function readConfig() {
  const p = path.join(__dirname, 'config.json');
  if (!fs.existsSync(p)) {
    die('config.json not found. Copy config.json.example to config.json first.');
  }
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    die(`config.json is not valid JSON: ${e.message}`);
  }
}

// A bare command like "opencode" can never be checked with fs.existsSync on
// Windows: the real file is an .exe behind an opencode.cmd shim, so existsSync
// returns false and a fresh clone dies here for no reason. Resolve explicitly.
const isWin = process.platform === 'win32';

function resolveBackendBin(bin) {
  if (!bin) return null;
  if (bin.includes('/') || bin.includes('\\')) return fs.existsSync(bin) ? bin : null;

  const exe = isWin ? `${bin}.exe` : bin;
  const roots = [
    __dirname,
    path.join(process.env.APPDATA || '', 'npm', 'node_modules'),
    path.join(process.env.npm_config_prefix || '', 'lib', 'node_modules'),
    '/usr/local/lib/node_modules',
    '/usr/lib/node_modules',
  ];
  for (const root of roots) {
    if (!root || root === 'node_modules') continue;
    const candidate = path.join(root, 'node_modules', 'opencode-ai', 'bin', exe);
    if (fs.existsSync(candidate)) return candidate;
  }

  try {
    const out = execSync(isWin ? `where ${bin}` : `command -v ${bin}`, {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    });
    const first = out.split(/\r?\n/).map(s => s.trim()).filter(Boolean)[0];
    if (first && fs.existsSync(first)) return first;
  } catch { /* not on PATH */ }
  return null;
}

const needsShell = bin => /\.(cmd|bat|ps1)$/i.test(bin);

function pidsOnPort(port) {
  try {
    const out = execSync('netstat -ano -p tcp', {
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
    });
    const pids = new Set();
    const re = new RegExp(`^\\s*TCP\\s+\\S*:${port}\\s+\\S+\\s+LISTENING\\s+(\\d+)\\s*$`, 'i');
    for (const line of out.split(/\r?\n/)) {
      const m = line.match(re);
      if (m) pids.add(m[1]);
    }
    return [...pids];
  } catch {
    return [];
  }
}

function freePort(port) {
  const pids = pidsOnPort(port);
  for (const pid of pids) {
    try {
      execSync(`taskkill /PID ${pid} /F /T`, { stdio: 'ignore', windowsHide: true });
      say(`  ${c.dim(`stopped stale process on :${port} (pid ${pid})`)}`);
    } catch { /* already gone */ }
  }
  return pids.length;
}

// A freshly started OpenCode server accepts the first TCP connection and then
// never answers it, so every probe MUST be individually bounded or the wait
// loop hangs forever. Any HTTP status (incl. 401) means "listening".
async function probe(url, { timeoutMs = 3000, headers = {} } = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ac.signal, headers });
    return { reached: true, status: res.status, ok: res.ok };
  } catch (e) {
    return { reached: false, status: 0, ok: false, error: e.name };
  } finally {
    clearTimeout(timer);
  }
}

async function waitFor(url, { attempts = 45, intervalMs = 1000, timeoutMs = 3000, headers } = {}) {
  for (let i = 1; i <= attempts; i++) {
    const r = await probe(url, { timeoutMs, headers });
    if (r.reached) return { ...r, attempt: i };
    process.stdout.write(`\r  ${c.dim(`waiting for ${url}  (${i}/${attempts})`)}`);
    await sleep(intervalMs);
  }
  process.stdout.write('\r' + ' '.repeat(70) + '\r');
  return { reached: false, status: 0, ok: false };
}

function spawnLogged(name, bin, args, extraEnv = {}) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const out = fs.openSync(path.join(LOG_DIR, `${name}.log`), 'a');
  const err = fs.openSync(path.join(LOG_DIR, `${name}.err.log`), 'a');
  // Node refuses to exec .cmd/.bat directly, so a PATH-resolved shim needs a shell.
  const useShell = needsShell(bin);
  const child = spawn(bin, useShell ? args.map(a => (/\s/.test(a) ? `"${a}"` : a)) : args, {
    cwd: __dirname,
    detached: true,
    stdio: ['ignore', out, err],
    windowsHide: true,
    shell: useShell,
    env: { ...process.env, ...extraEnv },
  });
  child.unref();
  return child;
}

function tailLog(file, lines = 20) {
  const p = path.join(LOG_DIR, file);
  if (!fs.existsSync(p)) return '(no log)';
  const content = fs.readFileSync(p, 'utf8').trimEnd().split(/\r?\n/);
  return content.slice(-lines).join('\n');
}

function showTail(name) {
  say('');
  say(c.dim(`--- last lines of logs/${name}.err.log ---`));
  say(c.dim(tailLog(`${name}.err.log`, 20)));
  say(c.dim(`--- last lines of logs/${name}.log ---`));
  say(c.dim(tailLog(`${name}.log`, 20)));
}

async function start() {
  const cfg = readConfig();

  const proxyPort = Number(cfg.PORT) || 10000;
  const serverUrl = cfg.OPENCODE_SERVER_URL || 'http://127.0.0.1:10001';
  let serverPort = 10001;
  try { serverPort = Number(new URL(serverUrl).port) || 10001; } catch { /* keep default */ }
  const backendBin = resolveBackendBin(cfg.OPENCODE_PATH || 'opencode');
  // Must use the SAME precedence as index.js (env > file): index.js builds the
  // gateway's Basic auth from `process.env.OPENCODE_SERVER_PASSWORD` first, so if
  // this launcher preferred the file the backend would enforce a different
  // password than the gateway sends, and every call would come back 401.
  const password = process.env.OPENCODE_SERVER_PASSWORD || cfg.OPENCODE_SERVER_PASSWORD || '';
  const username = process.env.OPENCODE_SERVER_USERNAME || 'opencode';
  const apiKey = cfg.API_KEY || '';

  say('');
  say(c.bold('opencode2api  ' + c.dim('- local dev launcher')));
  say('');

  if (!backendBin) {
    die(`OpenCode not found (OPENCODE_PATH: ${cfg.OPENCODE_PATH || 'opencode'}).
       Install it:   npm install -g opencode-ai
       Or set OPENCODE_PATH in config.json to the full path of opencode(.exe)`);
  }
  say(c.dim(`backend bin ${backendBin}`));
  if (!fs.existsSync(path.join(__dirname, 'node_modules', 'express'))) {
    die('node_modules is missing. Run: npm install');
  }

  say(c.dim('releasing ports'));
  freePort(serverPort);
  freePort(proxyPort);
  await sleep(1200);

  say(c.dim('starting OpenCode backend'));
  // opencode serve only runs unsecured when OPENCODE_SERVER_PASSWORD is present but
  // empty; if the variable is missing entirely it enforces an unknown password and
  // every gateway call comes back 401. So pass it explicitly, even when blank.
  spawnLogged('backend', backendBin, ['serve', '--hostname', '127.0.0.1', '--port', String(serverPort)], {
    OPENCODE_SERVER_PASSWORD: password,
  });

  const authHeaders = password
    ? { Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}` }
    : {};
  const backend = await waitFor(`http://127.0.0.1:${serverPort}/health`, { headers: authHeaders });
  if (!backend.reached) {
    bad(`OpenCode backend did not come up on :${serverPort}`);
    showTail('backend');
    process.exit(1);
  }
  ok(`backend   http://127.0.0.1:${serverPort}  ${c.dim(`(HTTP ${backend.status}, ${backend.attempt} probe(s))`)}`);

  say(c.dim('starting proxy'));
  spawnLogged('proxy', process.execPath, [path.join(__dirname, 'index.js')]);

  const proxy = await waitFor(`http://127.0.0.1:${proxyPort}/health`);
  if (!proxy.reached) {
    bad(`proxy did not come up on :${proxyPort}`);
    showTail('proxy');
    process.exit(1);
  }
  ok(`proxy     http://127.0.0.1:${proxyPort}  ${c.dim(`(HTTP ${proxy.status}, ${proxy.attempt} probe(s))`)}`);

  say('');
  say(c.bold('  endpoints'));
  say(`    health   curl http://127.0.0.1:${proxyPort}/health`);
  say(`    models   curl http://127.0.0.1:${proxyPort}/v1/models \\`);
  if (apiKey) say(`             -H "Authorization: Bearer <API_KEY>"`);
  say(`    chat     curl -X POST http://127.0.0.1:${proxyPort}/v1/chat/completions \\`);
  say(`             -H "Content-Type: application/json" \\`);
  if (apiKey) say(`             -H "Authorization: Bearer <API_KEY>" \\`);
  say(`             -d '{"model":"opencode-go/glm-5.3-flash","messages":[{"role":"user","content":"hi"}]}'`);
  say('');
  say(c.dim(`  logs: ${LOG_DIR}`));
  say(c.dim(`  stop: run stop.bat   (or stop this script's sibling)`));
  say('');
}

async function stop() {
  const cfg = fs.existsSync(path.join(__dirname, 'config.json'))
    ? readConfig()
    : { PORT: 10000 };
  const proxyPort = Number(cfg.PORT) || 10000;
  let serverPort = 10001;
  try { serverPort = Number(new URL(cfg.OPENCODE_SERVER_URL || '').port) || 10001; } catch { /* default */ }

  say('');
  say(c.bold('opencode2api  ' + c.dim('- stopping')));
  const a = freePort(serverPort);
  const b = freePort(proxyPort);
  if (!a && !b) say(c.dim('  nothing was listening'));
  say('');
}

if (CMD === 'stop') await stop();
else await start();

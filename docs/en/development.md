# Development Guide

## Setup

```bash
node --version    # Requires 18+
npm install

# Install OpenCode CLI
npm install -g opencode-ai
# Or curl -fsSL https://opencode.ai/install | bash
```

## Run Locally

```bash
cp config.json.example config.json
node start.mjs start     # background: backend + gateway
node start.mjs stop
```

Or run only the gateway in the foreground with `npm start`; it connects to `OPENCODE_SERVER_URL` (default `http://127.0.0.1:10001`) and, when `MANAGE_BACKEND=true`, starts the OpenCode backend itself on demand. Output lands in `logs/proxy.log` and `logs/proxy.err.log`.

The WebUI is plain HTML/CSS/JS in `public/` — there is no frontend build step and no npm bundler. Editing `public/index.html`, `public/app.js` or `public/style.css` takes effect on the next page reload (assets are cached for up to an hour; hard-refresh while developing).

## Tests

| Command | Description |
|:-----|:-----|
| `npm test` | All unit tests (Jest 30, `tests/unit`) |
| `npm run test:unit` | Same as `npm test` |
| `npm run test:stream` | Live-backend streaming smoke test (manual, `tests/manual/`) |

Jest needs ESM support, which the scripts supply via `NODE_OPTIONS=--experimental-vm-modules`; running `npm test` is enough. The unit suite covers `tests/unit/app.test.js` (gateway behaviour), `tests/unit/webui.test.js` (WebUI shell and `/api/*` routes) and `tests/unit/parser-foreign-formats.test.js` (response parsing).

Two test-only env overrides exist so tests never touch your real configuration: `OPENCODE_CONFIG_PATH` and `OPENCODE_SECRETS_PATH` point the process at a scratch file instead of `config.json` / `secrets.json`. They are used by `tests/unit/webui.test.js`; nothing else should set them.

## Project Layout

```
opencode2api/
├── index.js                  # Entry: env > config.json assembly, starts the proxy
├── start.mjs                 # Runner: start/stop backend + gateway, logs to logs/
├── start.bat / stop.bat      # Windows wrappers for start.mjs
├── config.json.example       # Sample config (tracked)
├── config.json               # Your config (gitignored)
├── secrets.json              # API keys, created on demand (gitignored)
├── src/
│   ├── proxy.js              # Core gateway: /v1 routes, auth middleware, backend client
│   ├── config.js             # config/secrets IO, key CRUD, auth, LAN helpers
│   ├── webui.js              # /api/* router + static asset mount
│   ├── stats.js              # In-memory request/completion counters
│   └── tool-runtime/         # Tool bridge runtime (contracts/parser/policy/registry/router/validator)
├── public/                   # WebUI (index.html, app.js, style.css) — no build step
├── tests/
│   ├── unit/                 # Jest unit tests (npm test)
│   └── manual/               # Live-backend smoke tests, not in CI
├── logs/                     # proxy.log, proxy.err.log, backend logs (gitignored)
└── docs/                     # Docs (zh/ + en/)
```

## Commit Style

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new feature
fix: fix bug
docs: update documentation
refactor: refactor code
test: add tests
chore: update build/ci
```

## Contribute

1. Fork the repo and create a feature branch: `git checkout -b feature/your-feature`
2. Commit changes, make sure `npm test` passes
3. Push the branch and open a Pull Request

See [CONTRIBUTING.md](../../CONTRIBUTING.md).

## License

MIT License · See [LICENSE](../../LICENSE.md)

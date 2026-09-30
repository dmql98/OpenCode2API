# Getting Started

opencode2api is a local / LAN gateway that exposes an OpenAI-compatible API in front of an OpenCode backend. It serves a built-in WebUI console from the same process, so there is no separate frontend to install or build.

## Requirements

- **Node.js** 18 or newer
- **OpenCode CLI**:

```bash
npm install -g opencode-ai
# Or: curl -fsSL https://opencode.ai/install | bash
```

## Install

```bash
git clone https://github.com/TiaraBasori/opencode2api.git
cd opencode2api
npm install
cp config.json.example config.json
```

`config.json` is gitignored and holds the general configuration. API keys live in a separate gitignored `secrets.json`, which is created the first time you add a key from the WebUI.

### Sign in to a model provider

The gateway holds no model credentials itself. The request path is `client → gateway → local opencode serve → model provider`, and the last hop authenticates with `~/.local/share/opencode/auth.json` (Windows: `%USERPROFILE%\.local\share\opencode\auth.json`). That file is written by the OpenCode CLI and lives outside this repository. On a fresh machine you must sign in once — otherwise the gateway starts and `/v1/models` responds, but actual messages fail for lack of a provider key:

```bash
opencode auth login     # interactive; writes auth.json
opencode auth list      # show signed-in providers
```

`auth.json` is shared by every `opencode` process on the machine, including the backend the gateway launches. When you set this up for several people, each of them signs in with their own account.

## Configure

Edit `config.json` for the basics:

```json
{
    "PORT": 10000,
    "BIND_HOST": "0.0.0.0",
    "OPENCODE_SERVER_URL": "http://127.0.0.1:10001",
    "OPENCODE_SERVER_PASSWORD": ""
}
```

- `PORT` and `BIND_HOST` decide where the gateway listens. The default `0.0.0.0` makes it reachable from other machines on your LAN.
- `OPENCODE_SERVER_URL` is the OpenCode backend (default `http://127.0.0.1:10001`). When `OPENCODE_SERVER_PASSWORD` is set, the gateway authenticates to it with `Authorization: Basic base64("opencode:" + OPENCODE_SERVER_PASSWORD)`.
- API keys are best created from the WebUI **Keys** tab after the first start. A single legacy `API_KEY` in `config.json` still works and can be migrated into `secrets.json` from the WebUI in one click.
- If no key is configured anywhere, the gateway runs in open mode and accepts unauthenticated requests.

## Start

```bash
node start.mjs start    # starts the OpenCode backend and the gateway in the background
node start.mjs stop     # stops both
```

On Windows, `start.bat` and `stop.bat` do the same. Logs are written to `logs/proxy.log` and `logs/proxy.err.log`.

To run only the gateway in the foreground (the backend must already be reachable):

```bash
npm start
```

On startup the gateway prints its local and LAN URLs:

```
[Proxy] Active at http://0.0.0.0:10000
[Proxy]   http://127.0.0.1:10000
[Proxy]   http://192.168.2.168:10000
```

## Open the WebUI

Open `http://127.0.0.1:10000/` in a browser, or the LAN URL from the startup log (for example `http://192.168.2.168:10000/`). The same list is available on the Dashboard and from `GET /api/status` as `listen.endpoints`.

Four tabs:

| Tab | What it does |
|:----|:-------------|
| Dashboard | Gateway status, listen endpoints, backend health, request stats, log tail |
| Chat debug | Streaming SSE chat against `/v1/chat/completions` |
| Config | Edits every config field, each labelled hot or restart-required |
| Keys | Creates, revokes and deletes API keys; migrates the legacy `config.json` key |

The page itself loads without a key: the static assets (`/`, `/index.html`, `/app.js`, `/style.css`) are public. Every `/api/*` data endpoint still requires `Authorization: Bearer <key>` — enter your key with the key button in the top bar. It is kept in the browser's local storage.

## First request

```bash
# Health check (no auth)
curl http://127.0.0.1:10000/health

# List models
curl http://127.0.0.1:10000/v1/models \
  -H "Authorization: Bearer $API_KEY"

# Chat completion
curl -X POST http://127.0.0.1:10000/v1/chat/completions \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "opencode/big-pickle",
    "messages": [{"role": "user", "content": "hi"}],
    "stream": false
  }'
```

Omit the `Authorization` header when no key is configured (open mode).

## Next Steps

- [Configuration](./configuration.md) — every option, hot vs restart-required
- [API Reference](./api-reference.md) — request and response shapes
- [Development](./development.md) — tests and module layout
- [Troubleshooting](./troubleshooting.md) — common problems

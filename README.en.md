# OpenCode2API

<p align="center">
  <img src="https://img.shields.io/badge/version-3.0.0-blue" alt="Version">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
  <img src="https://img.shields.io/badge/Node.js-18+-orange" alt="Node">
</p>

English | [简体中文](./README.md)

Turns a local [OpenCode](https://opencode.ai) runtime into an OpenAI-compatible API gateway for this machine and the rest of your LAN, so any client can use unlimited free OpenCode Zen models.

## ✨ Features

- **Built-in WebUI** — dashboard, chat debug console, config editor and key management; plain HTML/JS, zero build step
- **LAN routing** — binds `0.0.0.0` by default and prints local + LAN URLs on startup, so phones, tablets and other machines connect directly
- **OpenAI compatible** — `/v1/models`, `/v1/chat/completions`, `/v1/responses` with full SSE streaming
- **Key management** — several active keys at once, stored in a git-ignored `secrets.json`; the legacy `API_KEY` migrates in with one click
- **Reasoning control** — supports `reasoning_effort` and `reasoning: {"effort": "high"}`
- **Session chaining** — Responses API supports `previous_response_id`, 30-minute TTL, upstream sessions cleaned up on expiry
- **External tool bridge** — client-supplied `tools` return standard `tool_calls` / `function_call` from the proxy, never touching OpenCode built-in tools
- **Built-in tool allowlist** — requests without `tools` only allow built-ins listed in `OPENCODE_INTERNAL_ALLOWED_TOOLS`
- **Observability** — `/health/details` structured diagnostics, `/metrics` Prometheus metrics, plus request stats and log tail in the WebUI

## 🚀 Quick Start

```bash
# Install the OpenCode CLI
npm install -g opencode-ai
# or curl -fsSL https://opencode.ai/install | bash
opencode auth login          # sign in to a model provider; writes auth.json (once per machine)

git clone https://github.com/TiaraBasori/opencode2api.git
cd opencode2api
npm install
cp config.json.example config.json   # adjust port / backend address as needed
node start.mjs start                 # or just run start.bat
```

The console prints the local and LAN addresses, for example:

```
[Proxy] Active at http://0.0.0.0:10000
[Proxy]   Local: http://127.0.0.1:10000
[Proxy]   LAN · WLAN: http://192.168.2.168:10000
[Proxy]   WebUI: open any address above in a browser
```

Open the WebUI, create an API key on the **Keys** tab, and start calling. Stop the gateway with `node start.mjs stop`.

## 🖥️ WebUI

Reach it at `/` (static assets need no auth; the `/api/*` data endpoints require a Bearer key). Four tabs:

| Tab | What it does |
|:-----|:-----|
| **Dashboard** | Run status, one-click copy of gateway/backend URLs, backend health, request stats, log tail |
| **Chat** | Send a message straight through `/v1/chat/completions` and watch the stream, including tool calls |
| **Config** | Edit every setting, each field marked *hot* or *restart required* |
| **Keys** | Create, revoke and delete API keys; migrate the legacy `config.json · API_KEY` into `secrets.json` |

> Only `DEBUG` and key changes take effect immediately; every other setting is written to `config.json` and needs a gateway restart.

## 💡 Usage Examples

### Chat Completions

```bash
curl -X POST http://127.0.0.1:10000/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "opencode/big-pickle",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": false
  }'
```

### Responses API (streaming + reasoning)

```bash
curl -N -X POST http://127.0.0.1:10000/v1/responses \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt5-nano",
    "input": "Say hi in one sentence.",
    "reasoning": {"effort": "high"},
    "stream": true
  }'
```

### External tools

```bash
curl -X POST http://127.0.0.1:10000/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "opencode/big-pickle",
    "messages": [{"role": "user", "content": "Fetch https://example.com and tell me the title"}],
    "tools": [{
      "type": "function",
      "function": {
        "name": "web_fetch",
        "description": "Fetch a URL and return its content summary",
        "parameters": {
          "type": "object",
          "properties": {"url": {"type": "string"}},
          "required": ["url"]
        }
      }
    }]
  }'
```

When the model calls tools, non-streaming responses return `message.tool_calls` and streaming responses return `delta.tool_calls`.

## ⚙️ Configuration

Settings live in two local files, both git-ignored:

- **`config.json`** — port, listen address, backend URL, tool policy and everything else
- **`secrets.json`** — API keys, created by the WebUI on first use

Environment variables override the same-named file entries (env wins). The common ones:

| Environment variable | Default | Description |
|:--------|:-------|:-----|
| `API_KEY` | (empty) | Proxy Bearer auth key (read-only; migrate it into `secrets.json`) |
| `OPENCODE_SERVER_PASSWORD` | (empty) | OpenCode backend password |
| `OPENCODE_PROXY_PORT` / `PORT` | `10000` | Proxy port |
| `BIND_HOST` | `0.0.0.0` | Listen address — set `127.0.0.1` for local-only access |
| `OPENCODE_SERVER_URL` | `http://127.0.0.1:10001` | Backend URL |
| `OPENCODE_DISABLE_TOOLS` | `true` | Disable OpenCode built-in tools |
| `OPENCODE_INTERNAL_ALLOWED_TOOLS` | (empty) | Built-ins allowed when a request has no `tools`, comma-separated |
| `OPENCODE_PROXY_PROMPT_MODE` | `standard` | `standard` or `plugin-inject` |
| `OPENCODE_PROXY_OMIT_SYSTEM_PROMPT` | `false` | Ignore the incoming system prompt |
| `OPENCODE_USE_ISOLATED_HOME` | `false` | Use an isolated OpenCode config directory |
| `OPENCODE_PROXY_DEBUG` | `false` | Debug logging (also togglable in the WebUI) |

> 📄 Full reference: [Configuration](./docs/en/configuration.md)

With no key configured the gateway runs in **open mode** (do not expose it publicly); once a key exists, every `/v1/*` and `/api/*` call needs `Authorization: Bearer <key>`.

## 🔌 API Endpoints

| Method | Path | Description |
|:-----|:-----|:-----|
| `GET` | `/health` | Health check |
| `GET` | `/health/details` | Structured diagnostics (toggle/auth configurable) |
| `GET` | `/metrics` | Prometheus metrics (toggle/auth configurable) |
| `GET` | `/v1/models` | Model list |
| `POST` | `/v1/chat/completions` | Chat Completions |
| `POST` | `/v1/responses` | Responses API |
| `GET` | `/api/status` | WebUI status and LAN endpoints |
| `GET` / `POST` | `/api/config` | Read / update configuration |
| `GET` / `POST` | `/api/keys` | List / create keys |
| `POST` | `/api/keys/migrate` | Migrate the legacy `API_KEY` |
| `POST` | `/api/keys/:id/revoke` | Revoke a key (immediate) |
| `DELETE` | `/api/keys/:id` | Delete a key |
| `GET` | `/api/logs` | Tail the log |
| `GET` / `POST` | `/api/stats` | Request stats / reset |

Model names: `opencode/big-pickle`, `gpt5-nano` (auto-resolved to `gpt-5-nano`), `opencode/gpt5-nano`.

> 📖 See [API Reference](./docs/en/api-reference.md)

## 🔧 Troubleshooting

- **Saved a config in the WebUI but nothing changed** — only `DEBUG` and keys are hot; restart with `node start.mjs stop && node start.mjs start`
- **Phone / another machine can't reach it** — make sure `BIND_HOST` is `0.0.0.0` and the firewall allows port `10000`
- **Getting 401** — the key was revoked or mistyped; check the WebUI **Keys** tab. The legacy `API_KEY` only lands in `secrets.json` after you press *migrate*
- **Requests hang but `/v1/models` works** — set `OPENCODE_USE_ISOLATED_HOME=false` to reuse the local login state
- **Model not found** — run `curl http://127.0.0.1:10000/v1/models` to confirm the model ID

> 📖 More: [Troubleshooting](./docs/en/troubleshooting.md)

## 📚 Documentation

| Document | Description |
|:-----|:-----|
| [Getting Started](./docs/en/getting-started.md) | Install and first run |
| [Configuration](./docs/en/configuration.md) | All settings and key management |
| [API Reference](./docs/en/api-reference.md) | Endpoints, params, error codes |
| [Troubleshooting](./docs/en/troubleshooting.md) | Common issues |
| [Development](./docs/en/development.md) | Local development and testing |

## 📄 License

MIT · see [LICENSE](./LICENSE.md)

## 🙏 Acknowledgements

- [dxxzst/opencode-to-openai](https://github.com/dxxzst/opencode-to-openai)
- [lucasliet/opencode-openai-proxy](https://github.com/lucasliet/opencode-openai-proxy)

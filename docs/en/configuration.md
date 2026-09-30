# Configuration

Priority: **env vars > config.json > defaults**.

Env vars use the `OPENCODE_` prefix; config.json uses the short names (see tables).

## Files

| File | Tracked | Purpose |
|:-----|:--------|:--------|
| `config.json` | no (gitignored) | General configuration, 4-space indented JSON |
| `secrets.json` | no (gitignored) | API keys, created on demand, 4-space indented JSON |
| `config.json.example` | yes | Sample `config.json`, 2-space indented |

Copy `config.json.example` to `config.json` once after cloning. `secrets.json` is created automatically the first time a key is added from the WebUI — there is no need to create it by hand.

## WebUI Config Editor

Open the **Config** tab to edit the fields below. Every save is written to `config.json`; the API response reports `restartRequired` with the fields that still need a restart (`node start.mjs stop` then `node start.mjs start`, or restart the `start.bat` window).

| Field | Type | Default | Applies |
|:------|:-----|:--------|:--------|
| `PORT` | number (1–65535) | `10000` | restart |
| `BIND_HOST` | string | `0.0.0.0` | restart |
| `OPENCODE_SERVER_URL` | string | `http://127.0.0.1:10001` | restart |
| `OPENCODE_SERVER_PASSWORD` | string | (empty) | restart |
| `REQUEST_TIMEOUT_MS` | number (>= 1000) | `180000` | restart |
| `DEBUG` | boolean | `false` | **hot** |
| `DISABLE_TOOLS` | boolean | `true` | restart |
| `PROMPT_MODE` | `standard` \| `plugin-inject` | `standard` | restart |
| `OMIT_SYSTEM_PROMPT` | boolean | `false` | restart |
| `AUTO_CLEANUP_CONVERSATIONS` | boolean | `false` | restart |
| `CLEANUP_INTERVAL_MS` | number (>= 1000) | `43200000` | restart |
| `CLEANUP_MAX_AGE_MS` | number (>= 1000) | `86400000` | restart |
| `HEALTH_DETAILS_ENABLED` | boolean | `true` | restart |
| `HEALTH_DETAILS_REQUIRE_AUTH` | boolean | `true` | restart |
| `METRICS_ENABLED` | boolean | `false` | restart |
| `METRICS_REQUIRE_AUTH` | boolean | `true` | restart |

Only `DEBUG` is hot. API keys are hot too: create, revoke, delete and migrate take effect immediately, with no restart.

Fields that are not in this table (tool control, diagnostics flags, `OPENCODE_PATH`, `MANAGE_BACKEND`, `ZEN_API_KEY`, and so on) can still be set through `config.json` or env vars, but are not editable from the WebUI.

## API Keys

Keys are managed in the **Keys** tab and stored in `secrets.json`. Several keys can be active at once; each request must present one of them as `Authorization: Bearer <key>` on every `/v1/*` and `/api/*` route. Static WebUI assets stay public so the page can render and prompt for a key.

- **Create** — generates an `oc_sk_...` key and shows it once; stored as-is in `secrets.json`.
- **Revoke** — marks the key as revoked; it stops working immediately but stays listed.
- **Delete** — removes the key from `secrets.json` entirely.
- **Migrate** — moves the legacy `API_KEY` from `config.json` into `secrets.json` (`POST /api/keys/migrate`) and removes it from `config.json`. Afterwards it behaves like any other managed key and can be revoked.

The legacy `API_KEY` field in `config.json` remains accepted as a read-only key, so existing setups keep working until you migrate it.

If no active key exists anywhere, the gateway runs in open mode and requires no auth.

### WebUI API

All `/api/*` routes require a Bearer key:

| Route | Purpose |
|:------|:--------|
| `GET /api/status` | Version, uptime, listen endpoints, backend health, auth and stats summary |
| `GET /api/config` | Editable field schema plus stored values |
| `POST /api/config` | Apply a patch; returns `changed` and `restartRequired` |
| `GET /api/keys` | List keys (masked), including the read-only legacy key |
| `POST /api/keys` | Create a key (returns the plain value once) |
| `POST /api/keys/migrate` | Move the legacy `config.json` key into `secrets.json` |
| `POST /api/keys/:id/revoke` | Revoke a key |
| `DELETE /api/keys/:id` | Delete a key |
| `GET /api/logs?lines=200` | Tail `logs/proxy.log` (10–2000 lines) |
| `GET /api/stats` | In-memory request / completion counters |
| `POST /api/stats/reset` | Reset those counters |

## Environment Variables

### Service & Auth

| Env var | config.json | Default | Description |
|:---------|:------------|:-------|:-----|
| `OPENCODE_PROXY_PORT` / `PORT` | `PORT` | `10000` | Proxy listen port |
| `BIND_HOST` | `BIND_HOST` | `0.0.0.0` | Listen address, `0.0.0.0` = reachable from the LAN |
| `OPENCODE_SERVER_PORT` | - | `10001` | Backend port, only used to build default `OPENCODE_SERVER_URL` |
| `OPENCODE_SERVER_URL` | `OPENCODE_SERVER_URL` | `http://127.0.0.1:10001` | OpenCode backend address |
| `OPENCODE_SERVER_PASSWORD` | `OPENCODE_SERVER_PASSWORD` | (empty) | Backend auth password |
| `API_KEY` | `API_KEY` | (empty) | Legacy read-only Bearer key; no auth at all when no key is configured |
| `OPENCODE_PROXY_MANAGE_BACKEND` | `MANAGE_BACKEND` | `false` | Gateway starts and manages the OpenCode backend process |
| `OPENCODE_PATH` | `OPENCODE_PATH` | `opencode` | OpenCode binary path |
| `OPENCODE_ZEN_API_KEY` | `ZEN_API_KEY` | (empty) | Zen API key passthrough |
| `OPENCODE_USE_ISOLATED_HOME` | `USE_ISOLATED_HOME` | `false` | Use an isolated OpenCode config directory |

### Tool Control

| Env var | config.json | Default | Description |
|:---------|:------------|:-------|:-----|
| `OPENCODE_DISABLE_TOOLS` | `DISABLE_TOOLS` | `true` | Disable OpenCode built-in tools |
| `OPENCODE_EXTERNAL_TOOLS_MODE` | `EXTERNAL_TOOLS_MODE` | `proxy-bridge` | External tool bridge mode, only `proxy-bridge` is supported |
| `OPENCODE_EXTERNAL_TOOLS_CONFLICT_POLICY` | `EXTERNAL_TOOLS_CONFLICT_POLICY` | `namespace` | Same-name conflict isolation policy, only `namespace` is supported |
| `OPENCODE_INTERNAL_ALLOWED_TOOLS` | `INTERNAL_ALLOWED_TOOLS` | (empty) | Built-in tools allowed when request has no `tools`, comma-separated |
| `OPENCODE_INTERNAL_WEB_FETCH_ENABLED` | `INTERNAL_WEB_FETCH_ENABLED` | `false` | Legacy switch: allows `web_fetch` by default when no allowlist is set |
| `OPENCODE_INTERNAL_TOOL_METRICS_ENABLED` | `INTERNAL_TOOL_METRICS_ENABLED` | `true` | Emit allowlist mode debug/metrics logs |
| `OPENCODE_TOOL_DISCOVERY_FIXTURE` | `INTERNAL_TOOL_DISCOVERY_FIXTURE` | (empty) | Fixed backend tool ID list for tests/debug, comma-separated |

### Prompts & Sessions

| Env var | config.json | Default | Description |
|:---------|:------------|:-------|:-----|
| `OPENCODE_PROXY_PROMPT_MODE` | `PROMPT_MODE` | `standard` | `standard` or `plugin-inject` |
| `OPENCODE_PROXY_OMIT_SYSTEM_PROMPT` | `OMIT_SYSTEM_PROMPT` | `false` | Ignore incoming system prompt |
| `OPENCODE_PROXY_AUTO_CLEANUP_CONVERSATIONS` | `AUTO_CLEANUP_CONVERSATIONS` | `false` | Auto clean session storage |
| `OPENCODE_PROXY_CLEANUP_INTERVAL_MS` | `CLEANUP_INTERVAL_MS` | `43200000` | Cleanup interval (ms) |
| `OPENCODE_PROXY_CLEANUP_MAX_AGE_MS` | `CLEANUP_MAX_AGE_MS` | `86400000` | Max session age (ms) |
| `OPENCODE_PROXY_REQUEST_TIMEOUT_MS` | `REQUEST_TIMEOUT_MS` | `180000` | Request timeout (ms) |

### Diagnostics & Debug

| Env var | config.json | Default | Description |
|:---------|:------------|:-------|:-----|
| `OPENCODE_HEALTH_DETAILS_ENABLED` | `HEALTH_DETAILS_ENABLED` | `true` | Expose `/health/details` |
| `OPENCODE_HEALTH_DETAILS_REQUIRE_AUTH` | `HEALTH_DETAILS_REQUIRE_AUTH` | `true` | `/health/details` requires Bearer auth |
| `OPENCODE_METRICS_ENABLED` | `METRICS_ENABLED` | `false` | Expose `/metrics` |
| `OPENCODE_METRICS_REQUIRE_AUTH` | `METRICS_REQUIRE_AUTH` | `true` | `/metrics` requires Bearer auth |
| `OPENCODE_PROXY_DEBUG` | `DEBUG` | `false` | Debug logs |
| `OPENCODE2API_EVENT_FIRST_DELTA_TIMEOUT_MS` | - | `30000` | First-delta timeout for streaming |
| `OPENCODE2API_EVENT_IDLE_TIMEOUT_MS` | - | `8000` | Idle timeout for streaming |

## config.json Example

```json
{
    "PORT": 10000,
    "API_KEY": "your-secret-api-key",
    "BIND_HOST": "0.0.0.0",
    "DISABLE_TOOLS": true,
    "EXTERNAL_TOOLS_MODE": "proxy-bridge",
    "EXTERNAL_TOOLS_CONFLICT_POLICY": "namespace",
    "USE_ISOLATED_HOME": false,
    "PROMPT_MODE": "standard",
    "OMIT_SYSTEM_PROMPT": false,
    "AUTO_CLEANUP_CONVERSATIONS": false,
    "CLEANUP_INTERVAL_MS": 43200000,
    "CLEANUP_MAX_AGE_MS": 86400000,
    "DEBUG": false,
    "OPENCODE_SERVER_URL": "http://127.0.0.1:10001",
    "OPENCODE_PATH": "opencode",
    "REQUEST_TIMEOUT_MS": 180000
}
```

## Tool Control Details

### External Tool Bridge

- Client-supplied `tools` are not registered as OpenCode built-in tools. The proxy virtualizes them for the model.
- Model output is normalized to OpenAI-compatible `tool_calls` / `function_call` for the client.
- Same-name conflicts are isolated via an internal namespace (e.g. `external__web_fetch`). Namespace names are internal details, not public API.
- Once a request passes `tools` explicitly, OpenCode built-in tools stay disabled for that request.

### Built-in Tool Allowlist

- When a request has **no** `tools`, the proxy enters internal allowlist mode. Only tools in `OPENCODE_INTERNAL_ALLOWED_TOOLS` are allowed.
- The proxy reads the backend tool list and resolves usable tools by exact match or `.<tool>` / `/<tool>` suffix match.
- If the allowlist matches nothing on the backend, it falls back to a safe mode with all built-in tools disabled.
- `OPENCODE_INTERNAL_WEB_FETCH_ENABLED=true` is a legacy shortcut: treated as `web_fetch` when no allowlist is set.
- With `OPENCODE_INTERNAL_TOOL_METRICS_ENABLED=true`, mode selection, tool discovery, match results, and fallback reasons are logged. Tool return content is not logged.

### Request-level Allowlist Override

When a request has no `tools`, `opencode.internal_allowed_tools` in the request body overrides the server default allowlist. For isolation, the override is **intersect-only, never expands**:

```json
{
  "model": "opencode/kimi-k2.5",
  "messages": [{"role": "user", "content": "Fetch this URL"}],
  "opencode": {
    "internal_allowed_tools": ["web_fetch"]
  }
}
```

## Health Diagnostics & Metrics

- `/health` is always a lightweight check and needs no auth.
- `/health/details` returns structured diagnostic JSON (`404` when `OPENCODE_HEALTH_DETAILS_ENABLED=false`, auth required when `OPENCODE_HEALTH_DETAILS_REQUIRE_AUTH=true`):

```json
{
  "status": "ok",
  "proxy": true,
  "internal_tools": {
    "config": {
      "allowed_tools": ["web_fetch"],
      "metrics_enabled": true,
      "discovery_fixture": []
    },
    "metrics": {
      "externalBridgeRequests": 12,
      "internalAllowlistRequests": 8,
      "disabledRequests": 21,
      "discoveryFailures": 1,
      "fallbackToDisabled": 2
    },
    "cache": {
      "tool_ids_cached": true,
      "tool_id_count": 1,
      "age_ms": 12000
    }
  }
}
```

- `/metrics` returns Prometheus text format (`404` when `OPENCODE_METRICS_ENABLED=false`):

```text
opencode_internal_tool_mode_requests_total{mode="external_bridge"}
opencode_internal_tool_mode_requests_total{mode="internal_allowlist"}
opencode_internal_tool_mode_requests_total{mode="disabled"}
opencode_internal_tool_discovery_failures_total
opencode_internal_tool_fallback_disabled_total
opencode_internal_tool_cache_ids
```

## Prompt Mode

| Mode | Description |
|:-----|:-----|
| `standard` (default) | Standard mode, full prompt handling |
| `plugin-inject` | Plugin-inject mode, smaller model-side prompt, usually used with `OMIT_SYSTEM_PROMPT=true` |

## Recommended Configs

### LAN Gateway

```json
{
    "PORT": 10000,
    "BIND_HOST": "0.0.0.0",
    "DISABLE_TOOLS": true,
    "INTERNAL_ALLOWED_TOOLS": ["web_fetch"],
    "PROMPT_MODE": "plugin-inject",
    "OMIT_SYSTEM_PROMPT": true,
    "AUTO_CLEANUP_CONVERSATIONS": true
}
```

Set `OPENCODE_SERVER_PASSWORD` to match your backend, then create API keys from the WebUI **Keys** tab. Because the gateway binds to `0.0.0.0`, use keys — without them it runs open to anyone on the network.

### Local Development

```json
{
    "DISABLE_TOOLS": false,
    "DEBUG": true
}
```

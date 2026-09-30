# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [3.0.0] - 2026-09-30

### Added

- **WebUI Console**: A built-in web console served by the gateway itself at `/` (native HTML/CSS/JS in `public/`, zero build step) with four tabs — 控制台 (status, endpoints, backend health, log tail), 聊天调试 (streaming SSE chat against `/v1/chat/completions`), 配置 (every editable config field, each labelled 热更新 or 重启生效), and 密钥 (create / revoke / delete API keys).
- **Secrets-based Key Management**: API keys are now stored in `secrets.json` (gitignored) and managed from the WebUI; multiple keys can be active at once, the legacy `API_KEY` in `config.json` remains accepted as a read-only key and can be migrated in one click (`POST /api/keys/migrate`, after which it is removed from `config.json`), and key operations take effect immediately without a restart. With no key configured anywhere the gateway still runs open, as before.
- **LAN Access**: `BIND_HOST` defaults to `0.0.0.0`; on startup the gateway prints the local and LAN URLs for both the gateway and the WebUI, and `/api/status` reports them under `listen.endpoints`.
- **Stats and Log Tail**: In-memory request/completion counters shown on the dashboard (`GET /api/stats`, `POST /api/stats/reset`) and log tailing of `logs/proxy.log` (`GET /api/logs?lines=200`).
- **WebUI API**: `GET /api/status`, `GET|POST /api/config`, `GET|POST /api/keys`, `POST /api/keys/migrate`, `POST /api/keys/:id/revoke`, `DELETE /api/keys/:id`, `GET /api/logs`, `GET /api/stats`, `POST /api/stats/reset` — all Bearer-authenticated, while the static WebUI assets stay public so the page can render and prompt for a key.

### Changed

- **BREAKING — Docker Support Removed**: Docker is no longer a supported deployment. `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `entrypoint.sh`, `.github/workflows/docker-publish.yml`, `docs/zh/docker.md`, `docs/en/docker.md`, `tests/integration/test-integration.sh`, `.env` and `.env.example` were deleted, the `test:integration` script was dropped, and the docs now cover `node start.mjs start` / `start.bat` only. Docker users must migrate to running the gateway directly on Node.js 18+.
- **Configuration Files**: `config.json` (general config) and `secrets.json` (API keys) are the two gitignored JSON files the gateway reads and writes; `config.json.example` stays tracked as the sample. Only `DEBUG` and API keys hot-reload — every other config change is written to `config.json` and requires a restart, and the config API returns `restartRequired` accordingly.
- **Dependencies**: Removed `axios`; the package version is now `3.0.0`.

## [2.0.0] - 2026-09-25

### Added

- **English README**: Added `README.en.md` with a language switch between the Chinese and English docs.
- **English Docs**: Added full `docs/en/` translations of every guide; Chinese guides now live under `docs/zh/`.
- **Test Layout**: Split tests into `tests/unit/`, `tests/integration/`, and `tests/manual/`; added `npm run test:stream` for the live streaming smoke test and scoped Jest to `tests/unit`.

### Changed

- **Integration Script**: `tests/integration/test-integration.sh` accepts `TEST_API_KEY`; the manual streaming smoke test now documents its usage and stays out of CI.
- **Documentation Overhaul**: Rewrote the README and `docs/` for accuracy and concision; documented `previous_response_id` session chaining, the full environment-variable surface, and corrected env var names to match the implementation (`OPENCODE_DISABLE_TOOLS`, `OPENCODE_USE_ISOLATED_HOME`, `OPENCODE_PROXY_PROMPT_MODE`, etc.).
- **Config Surface Consistency**: `.env.example`, `docker-compose.yml`, and the `Dockerfile` now set `OPENCODE_DISABLE_TOOLS` instead of `DISABLE_TOOLS`, which the proxy never read.

## [1.5.0] - 2026-04-18

### Added

- **External Tool Bridge**: Added proxy-level bridging for external OpenAI-compatible `tools` across `/v1/chat/completions` and `/v1/responses`.
- **Streaming Tool Call Parity**: Added streaming support for external tool calls in both Chat Completions and Responses APIs.
- **Explicit External Tool Config**: Added explicit `EXTERNAL_TOOLS_MODE=proxy-bridge` and `EXTERNAL_TOOLS_CONFLICT_POLICY=namespace` configuration surface and documentation.

### Changed

- **Project Version**: Bumped the repository version to `1.5.0` across package metadata and documentation badges.

### Fixed

- **Jest Test Shutdown**: Removed a lingering queue rescheduling timer from the proxy request lock flow and updated the default test command to use the verified clean Jest invocation, eliminating the previous generic open-handle warning during `npm test`.

## [1.0.0] - 2025-04-11

### Added

- **OpenAI-compatible API**: `/v1/models`, `/v1/chat/completions`, `/v1/responses` endpoints
- **Streaming Support**: Full SSE streaming for Chat Completions and Responses API
- **Model Aliases**: GPT-style model aliasing (e.g., `gpt5-nano` → `gpt-5-nano`)
- **Docker Deployment**: Complete Docker setup with healthcheck and volume management
- **Configuration**: Environment variables and config.json support
- **Auto Cleanup**: Configurable automatic conversation/session storage cleanup

### Changed

- **Default Security**: `DISABLE_TOOLS` defaults to `true` for safer out-of-box behavior

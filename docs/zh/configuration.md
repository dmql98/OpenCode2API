# 配置详解

配置优先级：**环境变量 > config.json > 默认值**。

网关的配置分两个文件存放，都位于仓库根目录、都已 gitignore，且都是 4 空格缩进的 JSON：

| 文件 | 内容 | 说明 |
|:-----|:-----|:-----|
| `config.json` | 通用配置（端口、后端地址、工具开关等） | 首次使用从 `config.json.example` 复制；样例文件进 git |
| `secrets.json` | API 密钥列表 | 首次在 WebUI 生成密钥时自动创建 |

两个文件都由网关读写。`config.json` 不存在时网关使用默认值运行，`secrets.json` 不存在等同于「没有配置密钥」。

## WebUI

网关自带 WebUI，浏览器访问根路径 `/` 即可，四个标签页：**控制台**（状态、访问地址、后端健康、日志）、**聊天调试**（流式验证 `/v1/chat/completions`）、**配置**（编辑下文的可编辑字段）、**密钥**（密钥的生成、撤销、删除与迁移）。

- 静态资源（`/`、`/index.html`、`/app.js`、`/style.css`）是公开的，页面无需登录即可打开；
- 所有 `/api/*` 数据接口以及 `/v1/*` 接口都需要 `Authorization: Bearer <密钥>`；
- 配置页里标「热更新」的字段保存后立即生效，标「重启生效」的字段写入 `config.json`，重启网关后生效（`POST /api/config` 的响应里也会返回 `restartRequired` 列表）。

重启方式：`node start.mjs stop` 后 `node start.mjs start`，或重启 `start.bat` 所在窗口。

## 可编辑字段

下表是 WebUI「配置」页可修改的全部字段，同时也是 `config.json` 中可写的字段。除 `DEBUG` 与密钥外，其余字段都是**重启生效**。

| config.json 字段 | 类型 | 默认值 | 生效方式 | 环境变量 |
|:-----------------|:-----|:-------|:---------|:---------|
| `PORT` | 数字（1–65535） | `10000` | 重启生效 | `OPENCODE_PROXY_PORT` / `PORT` |
| `BIND_HOST` | 字符串 | `0.0.0.0` | 重启生效 | `BIND_HOST` |
| `OPENCODE_SERVER_URL` | 字符串 | `http://127.0.0.1:10001` | 重启生效 | `OPENCODE_SERVER_URL` |
| `OPENCODE_SERVER_PASSWORD` | 字符串（密码框） | （空） | 重启生效 | `OPENCODE_SERVER_PASSWORD` |
| `REQUEST_TIMEOUT_MS` | 数字（≥ 1000） | `180000` | 重启生效 | `OPENCODE_PROXY_REQUEST_TIMEOUT_MS` |
| `DEBUG` | 布尔 | `false` | **热更新** | `OPENCODE_PROXY_DEBUG` |
| `DISABLE_TOOLS` | 布尔 | `true` | 重启生效 | `OPENCODE_DISABLE_TOOLS` |
| `PROMPT_MODE` | 枚举 `standard` / `plugin-inject` | `standard` | 重启生效 | `OPENCODE_PROXY_PROMPT_MODE` |
| `OMIT_SYSTEM_PROMPT` | 布尔 | `false` | 重启生效 | `OPENCODE_PROXY_OMIT_SYSTEM_PROMPT` |
| `AUTO_CLEANUP_CONVERSATIONS` | 布尔 | `false` | 重启生效 | `OPENCODE_PROXY_AUTO_CLEANUP_CONVERSATIONS` |
| `CLEANUP_INTERVAL_MS` | 数字（≥ 1000） | `43200000` | 重启生效 | `OPENCODE_PROXY_CLEANUP_INTERVAL_MS` |
| `CLEANUP_MAX_AGE_MS` | 数字（≥ 1000） | `86400000` | 重启生效 | `OPENCODE_PROXY_CLEANUP_MAX_AGE_MS` |
| `HEALTH_DETAILS_ENABLED` | 布尔 | `true` | 重启生效 | `OPENCODE_HEALTH_DETAILS_ENABLED` |
| `HEALTH_DETAILS_REQUIRE_AUTH` | 布尔 | `true` | 重启生效 | `OPENCODE_HEALTH_DETAILS_REQUIRE_AUTH` |
| `METRICS_ENABLED` | 布尔 | `false` | 重启生效 | `OPENCODE_METRICS_ENABLED` |
| `METRICS_REQUIRE_AUTH` | 布尔 | `true` | 重启生效 | `OPENCODE_METRICS_REQUIRE_AUTH` |
| API 密钥（存于 `secrets.json`） | 字符串列表 | （空） | **热更新** | — |

不在上表中的配置项（如 `INTERNAL_ALLOWED_TOOLS`、`ZEN_API_KEY`、`MANAGE_BACKEND` 等）只能通过 `config.json` 或环境变量修改，同样需要重启才生效。

注意：环境变量优先级更高。如果某个字段被同名环境变量覆盖，你在 `config.json` 里的修改会在下次启动时被环境变量盖住。

## 密钥与鉴权

### 密钥存放

- `secrets.json` 保存 WebUI 生成的密钥，结构为 `{ "keys": [ ... ] }`，每条含 `id`、`name`、`key`、`createdAt`、`revoked`。密钥格式为 `oc_sk_` 开头的随机串，生成时只完整显示一次，之后只展示掩码。
- 可以同时存在多个有效密钥，任意一个都能通过鉴权。
- `config.json` 中的 `API_KEY` 仍然被接受，作为一条只读密钥参与鉴权。

### 迁移旧密钥

WebUI「密钥」页提供一键迁移：`POST /api/keys/migrate` 会把 `config.json` 里的 `API_KEY` 写入 `secrets.json`，然后从 `config.json` 中删除该字段。迁移后这把密钥即可在 UI 中撤销或删除。

### 开放模式

当 `secrets.json` 里没有有效密钥、`config.json` 里也没有 `API_KEY` 时（或密钥全部被撤销），网关进入开放模式：`/v1/*` 与 `/api/*` 都不要求鉴权，请求可以不带 `Authorization` 头。一旦配置了任意一把有效密钥，鉴权立即开启，且**立即生效，无需重启**。

### 鉴权范围

| 路径 | 是否需要 `Authorization: Bearer <密钥>` |
|:-----|:----------------------------------------|
| `/`、`/index.html`、`/app.js`、`/style.css` 等静态资源 | 否 |
| `/health` | 否 |
| `/health/details` | 由 `HEALTH_DETAILS_REQUIRE_AUTH` 决定（默认开启） |
| `/metrics` | 由 `METRICS_REQUIRE_AUTH` 决定（默认开启） |
| `/v1/*` | 是（开放模式除外） |
| `/api/*` | 是（开放模式除外） |

## WebUI 数据接口

以下接口全部挂在 `/api` 下，全部需要 Bearer 密钥（开放模式除外）：

| 方法 | 路径 | 说明 |
|:-----|:-----|:-----|
| GET | `/api/status` | 版本、监听地址（`listen.endpoints`）、后端健康、密钥计数、统计 |
| GET | `/api/config` | 可编辑字段定义与当前值 |
| POST | `/api/config` | 保存配置，返回 `changed` 与 `restartRequired` |
| GET | `/api/keys` | 密钥列表（掩码、来源、状态、最近使用） |
| POST | `/api/keys` | 新建密钥，明文只返回一次 |
| POST | `/api/keys/migrate` | 把 `config.json` 的 `API_KEY` 迁移到 `secrets.json` |
| POST | `/api/keys/:id/revoke` | 撤销密钥（立即生效） |
| DELETE | `/api/keys/:id` | 删除密钥 |
| GET | `/api/logs` | 日志尾部，`?lines=200&file=proxy.log`，`lines` 范围 10–2000 |
| GET | `/api/stats` | 内存中的请求统计 |
| POST | `/api/stats/reset` | 清零统计 |

## 局域网访问

- `BIND_HOST` 默认 `0.0.0.0`，网关启动后会在日志中打印本机与每个网卡的访问地址，例如 `http://192.168.2.168:10000`；
- `GET /api/status` 的 `listen.endpoints` 与 WebUI 控制台的「访问地址」卡片展示同样的列表；
- 局域网设备访问不到时，检查 `BIND_HOST` 是否被改成 `127.0.0.1`，以及系统防火墙是否放行了 `PORT` 端口；
- 只想本机使用时，把 `BIND_HOST` 设为 `127.0.0.1` 并重启网关。

## 环境变量

环境变量统一使用 `OPENCODE_` 前缀；config.json 使用对应的短名（见下表）。

### 服务与认证

| 环境变量 | config.json | 默认值 | 说明 |
|:---------|:------------|:-------|:-----|
| `OPENCODE_PROXY_PORT` / `PORT` | `PORT` | `10000` | 代理监听端口 |
| `BIND_HOST` | `BIND_HOST` | `0.0.0.0` | 监听地址 |
| `OPENCODE_SERVER_PORT` | - | `10001` | 后端端口，仅用于生成默认 `OPENCODE_SERVER_URL` |
| `OPENCODE_SERVER_URL` | `OPENCODE_SERVER_URL` | `http://127.0.0.1:10001` | OpenCode 后端地址 |
| `OPENCODE_SERVER_PASSWORD` | `OPENCODE_SERVER_PASSWORD` | (空) | 后端认证密码 |
| `API_KEY` | `API_KEY` | (空) | 旧版单密钥字段，建议迁移到 `secrets.json`；两者都为空则不鉴权 |
| `OPENCODE_PROXY_MANAGE_BACKEND` | `MANAGE_BACKEND` | `false` | 由代理自动拉起并管理 OpenCode 后端进程 |
| `OPENCODE_PATH` | `OPENCODE_PATH` | `opencode` | OpenCode 可执行文件路径 |
| `OPENCODE_ZEN_API_KEY` | `ZEN_API_KEY` | (空) | Zen API Key 透传 |
| `OPENCODE_USE_ISOLATED_HOME` | `USE_ISOLATED_HOME` | `false` | 使用隔离的 OpenCode 配置目录 |

### 工具控制

| 环境变量 | config.json | 默认值 | 说明 |
|:---------|:------------|:-------|:-----|
| `OPENCODE_DISABLE_TOOLS` | `DISABLE_TOOLS` | `true` | 禁用 OpenCode 内置工具 |
| `OPENCODE_EXTERNAL_TOOLS_MODE` | `EXTERNAL_TOOLS_MODE` | `proxy-bridge` | 外部工具桥接模式，当前仅支持 `proxy-bridge` |
| `OPENCODE_EXTERNAL_TOOLS_CONFLICT_POLICY` | `EXTERNAL_TOOLS_CONFLICT_POLICY` | `namespace` | 同名工具冲突隔离策略，当前仅支持 `namespace` |
| `OPENCODE_INTERNAL_ALLOWED_TOOLS` | `INTERNAL_ALLOWED_TOOLS` | (空) | 请求未带 `tools` 时放行的内置工具，逗号分隔 |
| `OPENCODE_INTERNAL_WEB_FETCH_ENABLED` | `INTERNAL_WEB_FETCH_ENABLED` | `false` | 旧开关：未显式配置 allowlist 时，启用后默认放行 `web_fetch` |
| `OPENCODE_INTERNAL_TOOL_METRICS_ENABLED` | `INTERNAL_TOOL_METRICS_ENABLED` | `true` | 输出 allowlist 模式的调试/指标日志 |
| `OPENCODE_TOOL_DISCOVERY_FIXTURE` | `INTERNAL_TOOL_DISCOVERY_FIXTURE` | (空) | 测试/调试用固定后端工具 ID 列表，逗号分隔 |

### 提示词与会话

| 环境变量 | config.json | 默认值 | 说明 |
|:---------|:------------|:-------|:-----|
| `OPENCODE_PROXY_PROMPT_MODE` | `PROMPT_MODE` | `standard` | `standard` 或 `plugin-inject` |
| `OPENCODE_PROXY_OMIT_SYSTEM_PROMPT` | `OMIT_SYSTEM_PROMPT` | `false` | 忽略传入的 system prompt |
| `OPENCODE_PROXY_AUTO_CLEANUP_CONVERSATIONS` | `AUTO_CLEANUP_CONVERSATIONS` | `false` | 自动清理会话存储 |
| `OPENCODE_PROXY_CLEANUP_INTERVAL_MS` | `CLEANUP_INTERVAL_MS` | `43200000` | 清理间隔（毫秒） |
| `OPENCODE_PROXY_CLEANUP_MAX_AGE_MS` | `CLEANUP_MAX_AGE_MS` | `86400000` | 会话最大保留时间（毫秒） |
| `OPENCODE_PROXY_REQUEST_TIMEOUT_MS` | `REQUEST_TIMEOUT_MS` | `180000` | 请求超时（毫秒） |

### 诊断与调试

| 环境变量 | config.json | 默认值 | 说明 |
|:---------|:------------|:-------|:-----|
| `OPENCODE_HEALTH_DETAILS_ENABLED` | `HEALTH_DETAILS_ENABLED` | `true` | 是否暴露 `/health/details` |
| `OPENCODE_HEALTH_DETAILS_REQUIRE_AUTH` | `HEALTH_DETAILS_REQUIRE_AUTH` | `true` | `/health/details` 是否要求 Bearer 认证 |
| `OPENCODE_METRICS_ENABLED` | `METRICS_ENABLED` | `false` | 是否暴露 `/metrics` |
| `OPENCODE_METRICS_REQUIRE_AUTH` | `METRICS_REQUIRE_AUTH` | `true` | `/metrics` 是否要求 Bearer 认证 |
| `OPENCODE_PROXY_DEBUG` | `DEBUG` | `false` | 调试日志（WebUI 中为热更新字段） |
| `OPENCODE2API_EVENT_FIRST_DELTA_TIMEOUT_MS` | - | `30000` | 流式响应首个 delta 的超时 |
| `OPENCODE2API_EVENT_IDLE_TIMEOUT_MS` | - | `8000` | 流式响应的空闲超时 |

## config.json 示例

```json
{
    "PORT": 10000,
    "BIND_HOST": "0.0.0.0",
    "DISABLE_TOOLS": true,
    "EXTERNAL_TOOLS_MODE": "proxy-bridge",
    "EXTERNAL_TOOLS_CONFLICT_POLICY": "namespace",
    "INTERNAL_ALLOWED_TOOLS": ["web_fetch"],
    "INTERNAL_TOOL_METRICS_ENABLED": true,
    "USE_ISOLATED_HOME": false,
    "PROMPT_MODE": "standard",
    "OMIT_SYSTEM_PROMPT": false,
    "AUTO_CLEANUP_CONVERSATIONS": false,
    "CLEANUP_INTERVAL_MS": 43200000,
    "CLEANUP_MAX_AGE_MS": 86400000,
    "REQUEST_TIMEOUT_MS": 180000,
    "DEBUG": false,
    "OPENCODE_SERVER_URL": "http://127.0.0.1:10001",
    "OPENCODE_PATH": "opencode"
}
```

## 工具控制详解

### 外部工具桥接

- 客户端传入的 `tools` 不会注册为 OpenCode 内置工具，由代理虚拟化后交给模型使用。
- 模型输出会被整理为 OpenAI 兼容的 `tool_calls` / `function_call` 返回给客户端。
- 同名冲突通过内部命名空间隔离（如 `external__web_fetch`），命名空间名是内部实现细节，不属于公开 API。
- 一旦请求显式传入 `tools`，OpenCode 内置工具在该请求中保持禁用。

### 内置工具 allowlist

- 请求 **未传入** `tools` 时，代理进入 internal allowlist 模式，只允许 `OPENCODE_INTERNAL_ALLOWED_TOOLS` 声明的内置工具。
- 代理会读取后端工具列表，通过精确匹配或 `.<tool>` / `/<tool>` 后缀匹配解析最终可用工具。
- allowlist 在后端一个都匹配不到时，自动回退为「全部内置工具禁用」的安全模式。
- `OPENCODE_INTERNAL_WEB_FETCH_ENABLED=true` 是兼容旧配置的快捷方式：未显式配置 allowlist 时视为 `web_fetch`。
- `OPENCODE_INTERNAL_TOOL_METRICS_ENABLED=true` 时输出模式选择、工具发现、命中结果和降级原因的日志，不记录工具返回内容。

### 请求级 allowlist 覆盖

请求未传入 `tools` 时，可在请求体中传 `opencode.internal_allowed_tools` 覆盖服务端默认 allowlist。出于安全隔离，覆盖**只能缩小（求交集），不能扩大**：

```json
{
  "model": "opencode/kimi-k2.5",
  "messages": [{"role": "user", "content": "Fetch this URL"}],
  "opencode": {
    "internal_allowed_tools": ["web_fetch"]
  }
}
```

## 健康诊断与指标

- `/health` 始终是轻量健康检查，不鉴权。
- `/health/details` 返回结构化诊断 JSON（`HEALTH_DETAILS_ENABLED=false` 时返回 404，`HEALTH_DETAILS_REQUIRE_AUTH=true` 时要求认证）：

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

- `/metrics` 返回 Prometheus 文本格式（`METRICS_ENABLED=false` 时返回 404）：

```text
opencode_internal_tool_mode_requests_total{mode="external_bridge"}
opencode_internal_tool_mode_requests_total{mode="internal_allowlist"}
opencode_internal_tool_mode_requests_total{mode="disabled"}
opencode_internal_tool_discovery_failures_total
opencode_internal_tool_fallback_disabled_total
opencode_internal_tool_cache_ids
```

## Prompt Mode

| 模式 | 说明 |
|:-----|:-----|
| `standard`（默认） | 标准模式，完整处理提示词 |
| `plugin-inject` | 插件注入模式，减小模型侧提示词大小，通常与 `OMIT_SYSTEM_PROMPT=true` 配合使用 |

## 推荐配置

### 局域网共享

```json
{
    "PORT": 10000,
    "BIND_HOST": "0.0.0.0",
    "DISABLE_TOOLS": true,
    "PROMPT_MODE": "plugin-inject",
    "OMIT_SYSTEM_PROMPT": true,
    "AUTO_CLEANUP_CONVERSATIONS": true
}
```

配合 WebUI「密钥」页生成密钥，避免开放模式暴露在局域网中。

### 本地开发

```json
{
    "DISABLE_TOOLS": false,
    "DEBUG": true
}
```

`DEBUG` 是热更新字段，也可以直接在 WebUI「配置」页打开，无需重启。

# OpenCode2API

<p align="center">
  <img src="https://img.shields.io/badge/version-3.0.0-blue" alt="Version">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
  <img src="https://img.shields.io/badge/Node.js-18+-orange" alt="Node">
</p>

简体中文 | [English](./README.en.md)

把本地 [OpenCode](https://opencode.ai) 运行时转换为 OpenAI 兼容 API 网关，供本机或局域网内任意客户端使用不限量的 OpenCode Zen 免费模型。

## ✨ 功能特性

- **内置 WebUI** — 控制台、聊天调试台、配置编辑、密钥管理，纯原生 HTML/JS，零构建步骤
- **局域网路由** — 默认监听 `0.0.0.0`，启动时打印本机与局域网访问地址，手机/平板/其他电脑直接接入
- **OpenAI 兼容** — `/v1/models`、`/v1/chat/completions`、`/v1/responses`，完整 SSE 流式输出
- **密钥管理** — 多密钥并发有效，`secrets.json` 独立保存且不入库，旧版 `API_KEY` 可一键迁移
- **推理控制** — 支持 `reasoning_effort` 与 `reasoning: {"effort": "high"}`
- **会话续接** — Responses API 支持 `previous_response_id`，30 分钟 TTL，到期自动清理上游会话
- **外部工具桥接** — 客户端传入 `tools`，代理返回标准 `tool_calls` / `function_call`，不触发 OpenCode 内置工具
- **内置工具 allowlist** — 请求未带 `tools` 时，仅放行 `OPENCODE_INTERNAL_ALLOWED_TOOLS` 声明的内置工具
- **可观测性** — `/health/details` 结构化诊断，`/metrics` Prometheus 指标，WebUI 内请求统计与日志尾随

## 🚀 快速开始

```bash
# 安装 OpenCode CLI
npm install -g opencode-ai
# 或 curl -fsSL https://opencode.ai/install | bash
opencode auth login          # 登录模型厂商，写入 auth.json（每台机器一次）

git clone https://github.com/TiaraBasori/opencode2api.git
cd opencode2api
npm install
cp config.json.example config.json   # 按需修改端口与后端地址
node start.mjs start                 # 或直接运行 start.bat
```

启动后终端会打印本机与局域网地址，例如：

```
[Proxy] Active at http://0.0.0.0:10000
[Proxy]   本机: http://127.0.0.1:10000
[Proxy]   局域网 · WLAN: http://192.168.2.168:10000
[Proxy]   WebUI: 在浏览器打开上述任一地址即可
```

浏览器打开 WebUI，在「密钥」页创建一个 API Key，即可开始调用。停止网关用 `node start.mjs stop`。

## 🖥️ WebUI

访问 `/` 即可打开（静态页面无需鉴权，数据接口 `/api/*` 需要 Bearer 密钥），共四个标签页：

| 标签页 | 功能 |
|:-----|:-----|
| **控制台** | 运行状态、网关/后端地址一键复制、后端健康、请求统计、日志尾随 |
| **聊天调试** | 直接发消息走 `/v1/chat/completions`，实时流式输出与工具调用 |
| **配置** | 编辑全部可配置项，逐项标注「热生效」或「需重启」 |
| **密钥** | 创建、撤销、删除 API 密钥，旧 `config.json · API_KEY` 一键迁移进 `secrets.json` |

> 只有 `DEBUG` 与密钥改动即时生效，其余配置写入 `config.json` 后需重启网关。

## 💡 使用示例

### Chat Completions

```bash
curl -X POST http://127.0.0.1:10000/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "opencode/big-pickle",
    "messages": [{"role": "user", "content": "你好!"}],
    "stream": false
  }'
```

### Responses API（流式 + 推理）

```bash
curl -N -X POST http://127.0.0.1:10000/v1/responses \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt5-nano",
    "input": "用一句话打招呼",
    "reasoning": {"effort": "high"},
    "stream": true
  }'
```

### 外部工具

```bash
curl -X POST http://127.0.0.1:10000/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "opencode/big-pickle",
    "messages": [{"role": "user", "content": "帮我获取 https://example.com 的标题"}],
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

模型决定调用工具时，非流式响应返回 `message.tool_calls`，流式响应返回 `delta.tool_calls`。

## ⚙️ 配置

配置分两份文件，均为本地文件、不入库：

- **`config.json`** — 端口、监听地址、后端地址、工具策略等通用配置
- **`secrets.json`** — API 密钥，由 WebUI 创建，首次使用自动生成

两者都可用环境变量覆盖同名项（环境变量优先）。常用项：

| 环境变量 | 默认值 | 说明 |
|:--------|:-------|:-----|
| `API_KEY` | (空) | 代理的 Bearer 认证密钥（只读，可迁移进 `secrets.json`） |
| `OPENCODE_SERVER_PASSWORD` | (空) | OpenCode 后端密码 |
| `OPENCODE_PROXY_PORT` / `PORT` | `10000` | 代理端口 |
| `BIND_HOST` | `0.0.0.0` | 监听地址，设为 `127.0.0.1` 可只允许本机访问 |
| `OPENCODE_SERVER_URL` | `http://127.0.0.1:10001` | 后端地址 |
| `OPENCODE_DISABLE_TOOLS` | `true` | 禁用 OpenCode 内置工具 |
| `OPENCODE_INTERNAL_ALLOWED_TOOLS` | (空) | 请求未带 `tools` 时放行的内置工具，逗号分隔 |
| `OPENCODE_PROXY_PROMPT_MODE` | `standard` | `standard` 或 `plugin-inject` |
| `OPENCODE_PROXY_OMIT_SYSTEM_PROMPT` | `false` | 忽略传入的 system prompt |
| `OPENCODE_USE_ISOLATED_HOME` | `false` | 使用隔离的 OpenCode 配置目录 |
| `OPENCODE_PROXY_DEBUG` | `false` | 调试日志（也可在 WebUI 内热切换） |

> 📄 完整配置见 [配置详解](./docs/zh/configuration.md)

不配置任何密钥时网关处于**开放模式**（不要暴露到公网）；配置了密钥则所有 `/v1/*` 与 `/api/*` 接口都需要 `Authorization: Bearer <key>`。

## 🔌 API 端点

| 方法 | 路径 | 说明 |
|:-----|:-----|:-----|
| `GET` | `/health` | 健康检查 |
| `GET` | `/health/details` | 结构化诊断（可配置开关/鉴权） |
| `GET` | `/metrics` | Prometheus 指标（可配置开关/鉴权） |
| `GET` | `/v1/models` | 模型列表 |
| `POST` | `/v1/chat/completions` | Chat Completions |
| `POST` | `/v1/responses` | Responses API |
| `GET` | `/api/status` | WebUI 运行状态与局域网地址 |
| `GET` / `POST` | `/api/config` | 读取 / 修改配置 |
| `GET` / `POST` | `/api/keys` | 密钥列表 / 创建密钥 |
| `POST` | `/api/keys/migrate` | 迁移旧 `API_KEY` |
| `POST` | `/api/keys/:id/revoke` | 撤销密钥（立即生效） |
| `DELETE` | `/api/keys/:id` | 删除密钥 |
| `GET` | `/api/logs` | 日志尾随 |
| `GET` / `POST` | `/api/stats` | 请求统计 / 重置 |

模型名称写法：`opencode/big-pickle`、`gpt5-nano`（自动解析为 `gpt-5-nano`）、`opencode/gpt5-nano`。

> 📖 详见 [API 参考](./docs/zh/api-reference.md)

## 🔧 故障排查

- **WebUI 打开但保存配置没生效** — 只有 `DEBUG` 与密钥热生效，其余需 `node start.mjs stop && node start.mjs start`
- **手机/其他电脑访问不到** — 确认 `BIND_HOST` 为 `0.0.0.0`，且系统防火墙放行 `10000` 端口
- **返回 401** — 密钥被撤销或写错，去 WebUI「密钥」页核对；旧 `API_KEY` 需点击迁移后才写入 `secrets.json`
- **请求卡住但 `/v1/models` 正常** — 设 `OPENCODE_USE_ISOLATED_HOME=false` 复用本地登录态
- **模型找不到** — `curl http://127.0.0.1:10000/v1/models` 确认模型 ID

> 📖 更多见 [故障排查](./docs/zh/troubleshooting.md)

## 📚 文档

| 文档 | 说明 |
|:-----|:-----|
| [快速开始](./docs/zh/getting-started.md) | 安装与首次运行 |
| [配置详解](./docs/zh/configuration.md) | 全部配置项与密钥管理 |
| [API 参考](./docs/zh/api-reference.md) | 端点、参数与错误码 |
| [故障排查](./docs/zh/troubleshooting.md) | 常见问题 |
| [开发指南](./docs/zh/development.md) | 本地开发与测试 |

## 📄 许可证

MIT · 详见 [LICENSE](./LICENSE.md)

## 🙏 致谢

- [dxxzst/opencode-to-openai](https://github.com/dxxzst/opencode-to-openai)
- [lucasliet/opencode-openai-proxy](https://github.com/lucasliet/opencode-openai-proxy)

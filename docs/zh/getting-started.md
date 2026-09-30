# 快速开始

## 环境要求

- Node.js 18 及以上
- OpenCode CLI（作为网关的后端，本机安装或局域网内已有的服务均可）

## 安装

```bash
# 安装 OpenCode CLI
npm install -g opencode-ai
# 或 curl -fsSL https://opencode.ai/install | bash

git clone https://github.com/TiaraBasori/opencode2api.git
cd opencode2api
npm install
cp config.json.example config.json
```

Windows 下复制配置文件用 `copy config.json.example config.json`。

### 登录模型厂商

网关自身不保存任何模型凭据。请求链路是 `客户端 → 网关 → 本机 opencode serve → 模型厂商`，最后一步用的是 `~/.local/share/opencode/auth.json`（Windows：`%USERPROFILE%\.local\share\opencode\auth.json`），它由 opencode CLI 写入，**不属于**本仓库、已天然在仓库之外。全新机器上必须先登录一次，否则网关能起来、`/v1/models` 也能返回，但真正发消息会因为没有厂商 key 而失败：

```bash
opencode auth login     # 交互式登录，写入 auth.json
opencode auth list      # 查看已登录的厂商
```

`auth.json` 是共享的：本机所有 `opencode` 进程（包括网关拉起的后端）都读它。给多人用时每人各自登录自己的账号，互不影响。

## 配置

`config.json` 是网关的主配置文件（已 gitignore），先确认这几项：

```json
{
    "PORT": 10000,
    "BIND_HOST": "0.0.0.0",
    "OPENCODE_SERVER_URL": "http://127.0.0.1:10001",
    "OPENCODE_SERVER_PASSWORD": ""
}
```

- `PORT` / `BIND_HOST`：监听端口与地址，默认 `0.0.0.0:10000`，即局域网内其他设备可以直接访问。
- `OPENCODE_SERVER_URL` / `OPENCODE_SERVER_PASSWORD`：OpenCode 后端地址与密码，网关以 `Authorization: Basic base64("opencode:" + 密码)` 访问后端。

API 密钥不必手写：启动后在 WebUI 的「密钥」标签页生成即可，密钥保存在 `secrets.json`（同样已 gitignore）。也可以继续把 `API_KEY` 写在 `config.json` 里，它作为只读密钥生效，可在 WebUI 一键迁移到 `secrets.json`。两者都没有配置有效密钥时，网关进入开放模式，不要求任何鉴权。

## 启动

```bash
node start.mjs start    # 启动 OpenCode 后端与网关
node start.mjs stop     # 停止两者
```

Windows 下也可以直接运行 `start.bat` / `stop.bat`。启动脚本会释放被占用的端口、拉起后端，再以守护方式启动网关；运行日志写入 `logs/proxy.log` 与 `logs/proxy.err.log`，网关进程的启动信息（本机与局域网访问地址）就在 `logs/proxy.log` 里。

## 打开 WebUI

浏览器访问 `http://127.0.0.1:10000/`；局域网其他设备访问启动日志里打印的地址，例如 `http://192.168.2.168:10000`。WebUI 由网关自身直接提供，原生 HTML/CSS/JS，没有构建步骤，也不依赖任何前端依赖。

四个标签页：

| 标签页 | 用途 |
|:-------|:-----|
| 控制台 | 运行状态与累计请求、访问地址、OpenCode 后端健康、运行日志实时查看 |
| 聊天调试 | 对 `/v1/chat/completions` 发起流式请求，同时查看请求预览与原始响应 |
| 配置 | 编辑全部可配置字段，逐项标注「热更新」或「重启生效」 |
| 密钥 | 生成、撤销、删除 API 密钥，以及迁移 `config.json` 中的旧 `API_KEY` |

鉴权规则：`/`、`/index.html`、`/app.js`、`/style.css` 这些静态资源是公开的，页面可以直接打开并弹出密钥输入框；`/api/*` 数据接口需要请求头 `Authorization: Bearer <密钥>`。密钥的新增、撤销、删除与迁移立即生效；除 `DEBUG` 外的配置修改写入 `config.json` 后需要重启网关。

## 发起第一个请求

```bash
# 健康检查（无需鉴权）
curl http://127.0.0.1:10000/health

# 模型列表（模型 ID 也可在 WebUI 控制台里刷新查看）
curl http://127.0.0.1:10000/v1/models \
  -H "Authorization: Bearer <你的密钥>"

# 聊天补全
curl -X POST http://127.0.0.1:10000/v1/chat/completions \
  -H "Authorization: Bearer <你的密钥>" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "opencode/kimi-k2.5-free",
    "messages": [{"role": "user", "content": "hi"}],
    "stream": false
  }'
```

处于开放模式时，`Authorization` 头可以省略。想快速验证流式输出，直接用 WebUI 的「聊天调试」标签页即可。

## 下一步

- [Configuration](./configuration.md) — 全部配置项、热更新与重启生效说明
- [API Reference](./api-reference.md) — OpenAI 兼容接口明细
- [Troubleshooting](./troubleshooting.md) — 常见问题排查
- [Development](./development.md) — 测试与项目结构

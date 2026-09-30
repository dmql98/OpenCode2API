# 开发指南

## 环境准备

```bash
node --version    # 需要 18+
npm install

# 安装 OpenCode CLI
npm install -g opencode-ai
# 或 curl -fsSL https://opencode.ai/install | bash
```

## 本地运行

```bash
cp config.json.example config.json
node start.mjs start    # 拉起 OpenCode 后端并启动网关
node start.mjs stop     # 停止两者
```

Windows 下可用 `start.bat` / `stop.bat` 代替。运行日志写入 `logs/proxy.log` 与 `logs/proxy.err.log`。

`npm start` 只在前台运行网关本身（`index.js`），适合调试；此时需要 OpenCode 后端已经在 `OPENCODE_SERVER_URL` 就绪，或在 `config.json` 中开启 `MANAGE_BACKEND`。

## 测试

| 命令 | 说明 |
|:-----|:-----|
| `npm test` | 全部单元测试（Jest 30，`tests/unit`） |
| `npm run test:unit` | 同上，单独执行 |
| `npm run test:stream` | 真机流式冒烟测试（手动，需后端可用） |

脚本里已经带好了 `NODE_OPTIONS=--experimental-vm-modules`，无需手工设置。当前共 149 个用例，分布在：

- `tests/unit/app.test.js` — 代理的 OpenAI 兼容接口与 Responses 会话续接
- `tests/unit/webui.test.js` — WebUI 静态资源与 `/api/*` 路由
- `tests/unit/parser-foreign-formats.test.js` — 外部工具调用的多种输出格式解析

`tests/unit/webui.test.js` 通过 `OPENCODE_CONFIG_PATH` / `OPENCODE_SECRETS_PATH` 把配置和密钥指向临时文件，避免污染仓库根目录下的真实 `config.json` / `secrets.json`。这两个变量仅供测试使用，不是面向用户的配置项。

## WebUI 没有构建步骤

`public/` 下是原生 HTML/CSS/JS（`index.html`、`app.js`、`style.css`），没有打包器、没有 `npm run build`。改动后刷新浏览器即可看到效果，静态资源由网关在 `/` 直接提供。

## 项目结构

```
opencode2api/
├── index.js                  # 环境变量与 config.json 合并，启动网关
├── start.mjs                 # 启动/停止脚本（start.bat / stop.bat 调用）
├── src/
│   ├── proxy.js              # 核心代理逻辑（/v1/* 与鉴权）
│   ├── config.js             # 配置/密钥读写、鉴权、局域网地址、日志尾部
│   ├── stats.js              # 内存中的请求统计
│   ├── webui.js              # /api/* 路由与静态资源挂载
│   └── tool-runtime/         # 工具桥接运行时（contracts/parser/policy/registry/router/validator）
├── public/                   # WebUI（原生 HTML/CSS/JS，无构建）
├── tests/
│   ├── unit/                 # Jest 单元测试（npm test）
│   └── manual/               # 真机冒烟测试，手动执行
├── docs/                     # 文档（zh/ + en/）
├── config.json.example       # 配置样例（config.json / secrets.json 均已 gitignore）
└── logs/                     # 运行日志（已 gitignore）
```

## 提交规范

使用 [Conventional Commits](https://www.conventionalcommits.org/)：

```
feat: add new feature
fix: fix bug
docs: update documentation
refactor: refactor code
test: add tests
chore: update tooling
```

## 贡献流程

1. Fork 项目并创建功能分支：`git checkout -b feature/your-feature`
2. 提交更改，确保 `npm test` 通过
3. 推送分支并创建 Pull Request

详见 [CONTRIBUTING.md](../../CONTRIBUTING.md)。

## 许可证

MIT License · 详见 [LICENSE](../../LICENSE.md)

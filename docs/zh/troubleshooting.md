# 故障排查

## 常见问题

### WebUI 打不开

先确认网关进程在运行、端口没被占用：

```bash
curl http://127.0.0.1:10000/health
```

- 端口以 `config.json` 的 `PORT` 为准；用 `node start.mjs start` 启动失败时，`start.mjs` 会打印 `logs/proxy.err.log` 的尾部内容。
- WebUI 静态资源不需要鉴权，页面打不开通常是进程没起来或端口不对，而不是密钥问题。
- 页面能打开但数据为空、一直提示 401，见下一条。

### 打开 WebUI 后提示密钥无效（401）

静态页面是公开的，但 `/api/*` 数据接口与 `/v1/*` 接口需要 `Authorization: Bearer <密钥>`：

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" ...
```

- 密钥可在 WebUI「密钥」页生成，或在 `secrets.json` / `config.json` 的 `API_KEY` 中查看。
- 密钥被撤销后立即失效，需要新建一把。
- 没有配置任何有效密钥时网关处于开放模式，页面上点「开放模式，直接进入」即可。

### 改了配置没生效

配置页里只有 `DEBUG` 与密钥是热更新，其余字段标「重启生效」：它们已经写入 `config.json`，但需要重启网关才会被读取。

```bash
node start.mjs stop
node start.mjs start
```

Windows 下重启 `start.bat` 窗口即可。另外，环境变量的优先级高于 `config.json`，如果同一字段被环境变量覆盖，文件里的修改会被盖住。

### 局域网其他设备访问不到

- `BIND_HOST` 默认是 `0.0.0.0`；如果被改成 `127.0.0.1`，只有本机能访问，改回 `0.0.0.0` 后重启。
- 用启动日志或 WebUI 控制台「访问地址」里打印的局域网地址（如 `http://192.168.2.168:10000`），不要用 `127.0.0.1`。
- 检查系统防火墙是否放行了 `PORT` 端口（默认 `10000`）。

### 密钥失效 / 被撤销

- 撤销、删除、新建密钥都立即生效，无需重启；撤销后使用该密钥的客户端会立刻收到 401。
- 从 `config.json` 迁移 `API_KEY` 后，原字段会从 `config.json` 中删除，密钥值不变，继续有效。
- 全部密钥都被撤销时，网关会退回开放模式（不鉴权）；这时要么新建密钥，要么确认开放模式符合预期。

### 请求卡住，但 `/v1/models` 正常

设置 `OPENCODE_USE_ISOLATED_HOME=false`，让 OpenCode 复用本机登录态：

```bash
export OPENCODE_USE_ISOLATED_HOME=false
```

### 模型不存在（`model_not_found`）

确认模型 ID 与后端一致：

```bash
curl http://127.0.0.1:10000/v1/models -H "Authorization: Bearer YOUR_API_KEY"
```

### 发送了 `reasoning_effort` 但没有推理输出

使用 `stream: true` 的 Responses API，并传 `reasoning.effort` 或 `reasoning_effort`。

### 客户端意外触发 OpenCode 内置工具

保持 `DISABLE_TOOLS=true`（WebUI「配置」页可改，需重启生效）。

### 端口冲突（`EADDRINUSE`）

```bash
# 检查占用
lsof -i :10000
lsof -i :10001

# 更换端口：config.json 中的 PORT / OPENCODE_SERVER_URL
```

`node start.mjs start` 在启动前会先释放这两个端口上残留的进程。

### OpenCode 未安装（`Cannot verify OpenCode installation`）

```bash
npm install -g opencode-ai
# 或 curl -fsSL https://opencode.ai/install | bash
```

也可通过 `OPENCODE_PATH` 或 `config.json` 的 `OPENCODE_PATH` 指定可执行文件完整路径。

## 调试模式

`DEBUG` 是热更新字段，在 WebUI「配置」页打开即可立即生效；也可以设置环境变量后重启：

```bash
export OPENCODE_PROXY_DEBUG=true
```

调试日志会输出详细的请求和响应信息，写入 `logs/proxy.log`，可在 WebUI 控制台的「运行日志」卡片里直接查看。

## 获取帮助

- [GitHub Issues](https://github.com/TiaraBasori/opencode2api/issues)

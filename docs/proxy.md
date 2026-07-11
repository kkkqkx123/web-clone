# 代理配置

## 概述

web-clone 通过读取环境变量自动检测 HTTP 代理，无需额外配置。如果系统中已设置代理（如 clash/v2ray/公司代理），工具会自动使用。

## 环境变量

按优先级从高到低检测以下环境变量：

| 目标协议 | 检测顺序 |
|---------|---------|
| **HTTPS** 目标 | `HTTPS_PROXY` → `https_proxy` → `HTTP_PROXY` → `http_proxy` |
| **HTTP** 目标 | `HTTP_PROXY` → `http_proxy` → `HTTPS_PROXY` → `https_proxy` |

同时也支持 `NO_PROXY` / `no_proxy` 环境变量，用于绕过代理的地址列表（逗号分隔，支持子域名匹配）。

## 工作原理

1. `src/fetcher.ts` 中的 `resolveProxyAgent()` 函数在每次 HTTP 请求时检查环境变量
2. 如果检测到代理 URL，创建对应的 `HttpsProxyAgent` 或 `HttpProxyAgent`（来自 `https-proxy-agent` / `http-proxy-agent` 包）
3. 代理 agent 通过 `agent` 选项传递给 `https.request()` / `http.request()`
4. 对于 HTTPS 目标：通过 CONNECT 隧道建立连接；对于 HTTP 目标：直接转发请求

## 示例

### 临时设置代理（PowerShell）

```powershell
$env:HTTPS_PROXY="http://127.0.0.1:7890"
npx tsx src/cli.ts "https://example.com" -o ./snapshot
```

### 永久设置代理

**Windows 系统环境变量**：设置 `HTTPS_PROXY=http://127.0.0.1:7890`

**PowerShell $PROFILE**：
```powershell
$env:HTTPS_PROXY="http://127.0.0.1:7890"
```

## 排查

如果遇到连接失败，先确认代理是否正常运行：

```powershell
# 测试代理是否可用
curl -v https://example.com

# 查看当前代理环境变量
echo "HTTPS_PROXY=$env:HTTPS_PROXY"
echo "HTTP_PROXY=$env:HTTP_PROXY"
echo "NO_PROXY=$env:NO_PROXY"
```

如果 `curl https://example.com` 成功但 `npx tsx src/cli.ts` 失败，通常是因为环境变量未正确传递到工具进程。请确认 `$env:HTTPS_PROXY` 在当前终端会话中已设置。

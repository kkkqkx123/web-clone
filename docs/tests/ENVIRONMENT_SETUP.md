# 环境配置指南

## 概述

本项目集成了 Playwright 用于集成测试。所有必要的浏览器二进制文件已在 `D:\Source\pw-browsers` 中可用。

---

## 环境检查

### ✅ 已验证的环境

```
✅ Playwright 1.58.2 已安装
✅ Chromium 1208 (chrome.exe) - 2.87 MB
✅ Chromium Headless Shell 1208 - 183.18 MB
✅ Node.js v22.14.0
✅ Windows 11 x64
```

### 浏览器位置

```
D:\Source\pw-browsers\
├── chromium-1208/
│   └── chrome-win64/
│       └── chrome.exe (标准 Chromium)
│
└── chromium_headless_shell-1208/
    └── chrome-headless-shell-win64/
        └── chrome-headless-shell.exe (无头模式)
```

---

## 环境变量配置

### 方式 1：临时设置（当前会话）

**PowerShell：**
```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = "D:\Source\pw-browsers"
npm run test:integration
```

**CMD：**
```cmd
set PLAYWRIGHT_BROWSERS_PATH=D:\Source\pw-browsers
npm run test:integration
```

**Bash/Git Bash：**
```bash
export PLAYWRIGHT_BROWSERS_PATH="D:\\Source\\pw-browsers"
npm run test:integration
```

### 方式 2：永久设置（系统环境变量）

**Windows 10/11：**

1. 打开 **系统属性** → **环境变量**
2. 点击 **新建** 用户变量
   - 变量名: `PLAYWRIGHT_BROWSERS_PATH`
   - 变量值: `D:\Source\pw-browsers`
3. 点击 **确定** 保存
4. 重启 IDE 或终端使变量生效

**验证设置：**
```cmd
echo %PLAYWRIGHT_BROWSERS_PATH%
```

### 方式 3：项目 .env 文件（推荐）

在项目根目录创建 `.env` 文件：

```env
PLAYWRIGHT_BROWSERS_PATH=D:\Source\pw-browsers
```

然后在 `package.json` 的脚本中使用 `dotenv`：

```bash
npm install --save-dev dotenv
```

在测试文件顶部加入：
```typescript
import * as dotenv from 'dotenv';
dotenv.config();
```

---

## 验证环境

### 检查浏览器可用性

```bash
npm run check-browsers
```

**预期输出：**
```
✅ Chromium (chrome.exe)
✅ Chromium Headless Shell
✅ Playwright 1.58.2 installed
✅ All required browsers are available!
```

### 测试 Playwright 功能

```bash
npm run test-playwright
```

**预期输出：**
```
✅ Browser launched successfully
✅ Context created successfully
✅ Page created successfully
✅ page.evaluate() works
✅ Navigation successful
✅ All tests passed!
```

---

## 运行测试

### Mock 单元测试（无需浏览器）

```bash
npm run test:unit
```

- 快速执行（< 5 秒）
- 无需网络
- 无需浏览器

### 集成测试（需要浏览器）

```bash
# 先设置环境变量
set PLAYWRIGHT_BROWSERS_PATH=D:\Source\pw-browsers

# 运行集成测试
npm run test:integration
```

- 使用真实 Chromium 浏览器
- 需要网络访问
- 执行时间较长（1-2 分钟）

### 所有测试

```bash
npm run test:all
```

顺序运行：
1. Mock 单元测试
2. 集成测试

### 生成覆盖率报告

```bash
npm run test:coverage
```

---

## 测试脚本速查表

| 脚本 | 命令 | 说明 |
|------|------|------|
| 检查浏览器 | `npm run check-browsers` | 验证浏览器二进制文件 |
| 测试 PW | `npm run test-playwright` | 测试 Playwright 功能 |
| 单元测试 | `npm run test:unit` | Mock 测试 |
| 集成测试 | `npm run test:integration` | 真实浏览器测试 |
| 所有测试 | `npm run test:all` | 完整测试套件 |
| 覆盖率 | `npm run test:coverage` | 代码覆盖率报告 |
| 清理 | `npm run test:clean` | 删除临时文件 |

---

## 常见问题

### Q1：环境变量无法识别

**问题：** `PLAYWRIGHT_BROWSERS_PATH is not recognized`

**解决方案：**
1. 使用 bash/Git Bash，而非 cmd.exe
2. 或在 PowerShell 中使用 `$env:VAR_NAME` 语法
3. 或设置系统环境变量后重启 IDE

### Q2：浏览器启动超时

**问题：** `Error: Browser launch failed: Timeout 30000ms exceeded`

**解决方案：**
1. 检查 `PLAYWRIGHT_BROWSERS_PATH` 是否正确
2. 确认浏览器文件未被杀毒软件隔离
3. 检查磁盘空间充足
4. 尝试以管理员身份运行

### Q3：无法连接网络

**问题：** 导航到 URL 超时

**解决方案：**
1. 检查网络连接
2. 尝试增加超时时间
3. 使用 `headless: false` 调试

### Q4：端口被占用

**问题：** `Error: Port 3000 is already in use`

**解决方案：**
```bash
# 查找占用端口的进程
netstat -ano | findstr :3000

# 杀死进程
taskkill /PID <PID> /F
```

---

## 调试技巧

### 启用调试日志

```bash
DEBUG=* npm run test:integration
```

### 启用 Playwright 调试模式

```bash
PWDEBUG=1 npm run test:integration
```

这会启动 Playwright Inspector，可以单步调试测试。

### 查看浏览器 UI（非 Headless）

修改集成测试中的启动参数：

```typescript
const browser = await setupBrowser({
  headless: false,  // 显示浏览器窗口
  slowMo: 100,      // 减速 100ms
});
```

### 保存调试截图

```typescript
await takeScreenshot(page, './debug-screenshot.png');
```

---

## 性能优化

### 并行运行测试

默认 vitest 会并行运行测试。如果遇到资源限制：

```bash
npm run test:integration -- --threads 1
```

### 限制浏览器数量

在 vitest 配置中设置：

```typescript
export default defineConfig({
  test: {
    maxThreads: 2,
    minThreads: 1,
  },
});
```

---

## 下一步

1. ✅ 验证环境：`npm run check-browsers`
2. ✅ 测试 Playwright：`npm run test-playwright`
3. ✅ 运行单元测试：`npm run test:unit`
4. ✅ 运行集成测试：`npm run test:integration`
5. ✅ 查看覆盖率：`npm run test:coverage`

---

## 参考资源

- [Playwright 官方文档](https://playwright.dev/)
- [Vitest 配置](https://vitest.dev/config/)
- [项目测试计划](./PLAYWRIGHT_INTEGRATION_TEST_PLAN.md)
- [测试结构指南](./TEST_STRUCTURE.md)

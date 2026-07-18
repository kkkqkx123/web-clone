# 有头模式（Headed Mode）支持方案

## 1. 背景与现状

### 1.1 问题来源

在分析 `https://www.shidianguji.com/library/?page_from=collection_list` 页面时发现，使用 Playwright 适配器进行快照时，页面 API 调用返回 `errorCode: 31000`（字节跳动反爬错误码），导致书库内容无法加载。而该页面在真实浏览器中可以正常展示内容。

根本原因之一是 headless 浏览器存在可被检测的特征，许多网站的反爬系统会针对 headless 模式进行限制或阻断。

### 1.2 当前支持状态

当前项目中两个自动化适配器均**硬编码** `headless: true`，没有任何途径切换到有头模式：

| 组件 | 文件 | 当前代码 |
|------|------|---------|
| `createPlaywrightAdapter` | `packages/adapter-playwright/src/adapter.ts:401` | `headless: true`（硬编码） |
| `createPuppeteerAdapter` | `packages/adapter-puppeteer/src/adapter.ts:483` | `headless: true`（硬编码） |
| CLI `BrowserAdapterOptions` | `apps/cli/src/browser.ts:21-32` | 无 `headless` 字段 |
| CLI `--adapter` | `apps/cli/src/cli.ts:57` | 无 `--headed` / `--no-headless` 标志 |
| `PlaywrightAdapterOptions` | `packages/adapter-playwright/src/options.ts:33-95` | 无 `headless` 字段 |
| `PuppeteerAdapterOptions` | `packages/adapter-puppeteer/src/options.ts:38-92` | 无 `headless` 字段 |

### 1.3 有头模式的价值

| 场景 | 说明 |
|------|------|
| **反爬绕过** | 部分网站通过检测 `navigator.webdriver`、`chrome.runtime`、窗口尺寸等特征来识别 headless 浏览器，有头模式可降低被检测概率 |
| **调试/可视化** | 开发者可观察浏览器实际渲染过程，定位 JS 执行、布局、API 请求等问题 |
| **验证码处理** | 某些页面需要手动验证（CAPTCHA），有头模式允许人工介入 |
| **Canvas/WebGL 渲染** | 部分 headless 环境不支持完整的 Canvas/WebGL API，有头模式提供完整渲染能力 |
| **OAuth/SSO 登录** | 第三方登录流程可能重定向到外部页面，有头模式可观察跳转过程 |

## 2. 设计方案

### 2.1 设计原则

1. **最小侵入**：不改动 `FetcherAdapter` 核心接口，只在 `create*Adapter` 工厂函数层添加选项
2. **默认无头**：保持默认 `headless: true`，不破坏现有行为，有头模式为显式选择
3. **分层传递**：选项从 CLI → `createBrowserAdapter` → `createPlaywrightAdapter`/`createPuppeteerAdapter` → `chromium.launch`/`puppeteer.launch` 逐层传递
4. **适配器无关**：CLI 层不感知具体适配器实现，统一通过 `BrowserAdapterOptions` 传递

### 2.2 修改范围

```
┌──────────────────────────────────────────────────────────────────┐
│  CLI 层 (apps/cli)                                              │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │ cli.ts: 新增 --headed/--no-headless 选项                     ││
│  │ cli-adapter.ts: CommanderOpts 新增 headless 字段             ││
│  │ browser.ts: BrowserAdapterOptions 新增 headless 字段         ││
│  └──────────────────────────────────────────────────────────────┘│
│                              │                                    │
│                              ▼                                    │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │ 适配器层 (packages/adapter-*)                                ││
│  │                                                              ││
│  │  Playwright:                                                 ││
│  │    options.ts → PlaywrightAdapterOptions 新增 headless 字段   ││
│  │    adapter.ts → CreatePlaywrightAdapterOptions 继承 headless  ││
│  │    adapter.ts → createPlaywrightAdapter() 使用 headless 选项  ││
│  │                                                              ││
│  │  Puppeteer:                                                  ││
│  │    options.ts → PuppeteerAdapterOptions 新增 headless 字段    ││
│  │    adapter.ts → CreatePuppeteerAdapterOptions 继承 headless   ││
│  │    adapter.ts → createPuppeteerAdapter() 使用 headless 选项   ││
│  └──────────────────────────────────────────────────────────────┘│
│                              │                                    │
│                              ▼                                    │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │ 浏览器启动层                                                ││
│  │  chromium.launch({ headless }) / puppeteer.launch({ headless })│
│  └──────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────┘
```

### 2.3 接口定义

#### 适配器层（Playwright）

**`packages/adapter-playwright/src/options.ts`** — `PlaywrightAdapterOptions` 新增字段：

```typescript
export interface PlaywrightAdapterOptions {
  // ... 现有字段 ...

  /**
   * 是否以无头模式启动浏览器
   *
   * - true: 无头模式（默认，不显示浏览器窗口）
   * - false: 有头模式（显示浏览器窗口，便于调试和反爬绕过）
   *
   * 注意：此选项仅在使用 createPlaywrightAdapter() 时生效。
   * 如果直接使用 new PlaywrightFetcherAdapter(page, context, options)，
   * 浏览器生命周期由调用方管理，此选项不适用。
   *
   * @default true
   */
  headless?: boolean;
}
```

**`packages/adapter-playwright/src/adapter.ts`** — `CreatePlaywrightAdapterOptions`：

```typescript
export interface CreatePlaywrightAdapterOptions extends PlaywrightAdapterOptions {
  /** Navigation / browser launch timeout in ms (default: 30000) */
  timeout?: number;

  // headless 继承自 PlaywrightAdapterOptions，不需要重复定义
}
```

**`packages/adapter-playwright/src/adapter.ts`** — `createPlaywrightAdapter()` 修改：

```typescript
export async function createPlaywrightAdapter(
  options: CreatePlaywrightAdapterOptions = {}
): Promise<PlaywrightAdapterHandle> {
  const { chromium } = await import('playwright');

  // 提取 headless 选项，默认 true
  const headless = options.headless !== false;

  // ... 代理逻辑不变 ...

  const browser = await chromium.launch({
    headless,           // ← 使用选项而非硬编码 true
    timeout: options.timeout ?? 30000,
    args: browserArgs,
  });

  // ... 后续不变 ...
}
```

#### 适配器层（Puppeteer）

**`packages/adapter-puppeteer/src/options.ts`** — `PuppeteerAdapterOptions` 新增字段：

```typescript
export interface PuppeteerAdapterOptions {
  // ... 现有字段 ...

  /**
   * 是否以无头模式启动浏览器
   *
   * - true: 无头模式（默认）
   * - false: 有头模式（显示浏览器窗口）
   *
   * @default true
   */
  headless?: boolean;
}
```

**`packages/adapter-puppeteer/src/adapter.ts`** — `createPuppeteerAdapter()` 修改：

```typescript
export async function createPuppeteerAdapter(
  options: CreatePuppeteerAdapterOptions = {}
): Promise<PuppeteerAdapterHandle> {
  const puppeteer = await import('puppeteer');

  const headless = options.headless !== false;

  // ... 代理逻辑不变 ...

  const browser = await puppeteer.launch({
    headless,           // ← 使用选项而非硬编码 true
    timeout: options.timeout ?? 30000,
    args: browserArgs,
  });

  // ... 后续不变 ...
}
```

#### CLI 层

**`apps/cli/src/browser.ts`** — `BrowserAdapterOptions` 新增字段：

```typescript
export interface BrowserAdapterOptions {
  /** Navigation timeout in ms (default: 30000) */
  timeout?: number;
  /** Page load wait state (default: 'networkidle') */
  waitForLoadState?: 'load' | 'domcontentloaded' | 'networkidle';
  /** Whether to validate SSL certificates (default: true) */
  validateSSL?: boolean;
  /** Custom HTTP headers for all requests */
  customHeaders?: Record<string, string>;
  /** Debug screenshot path */
  debugScreenshot?: string;
  /**
   * 是否以无头模式启动浏览器
   * @default true
   */
  headless?: boolean;
}
```

**`apps/cli/src/browser.ts`** — `createBrowserAdapter()` 传递选项：

```typescript
export async function createBrowserAdapter(
  type: BrowserType,
  options: BrowserAdapterOptions = {}
): Promise<BrowserAdapterHandle> {
  if (type === 'playwright') {
    const { createPlaywrightAdapter } = await import('@web-clone/adapter-playwright');
    return createPlaywrightAdapter(options);  // headless 已在 options 中
  }
  const { createPuppeteerAdapter } = await import('@web-clone/adapter-puppeteer');
  return createPuppeteerAdapter(options);  // headless 已在 options 中
}
```

**`apps/cli/src/cli.ts`** — 新增 CLI 选项：

```typescript
program
  // ... 现有选项 ...
  .option('--headed', '以有头模式启动浏览器（显示窗口），仅适用于 --adapter playwright|puppeteer')
  .option('--no-headed', '以无头模式启动浏览器（默认）')
```

**`apps/cli/src/cli-adapter.ts`** — `CommanderOpts` 新增字段：

```typescript
export interface CommanderOpts {
  // ... 现有字段 ...
  headed?: boolean;  // true = --headed, false = --no-headed, undefined = 默认
}
```

### 2.4 CLI 行为逻辑

```typescript
// 在 cli.ts 的 action 中，适配器创建处：
const handle = await createBrowserAdapter(adapterType, {
  timeout: options.timeout,
  // 处理 headed 选项：
  // --headed → headless: false
  // --no-headed → headless: true
  // 默认 → headless: true
  headless: opts.headed !== undefined ? !opts.headed : true,
});
```

| CLI 参数 | `headless` 值 | 行为 |
|----------|--------------|------|
| （默认，不指定） | `true` | 无头模式，与现有行为一致 |
| `--headed` | `false` | 有头模式，显示浏览器窗口 |
| `--no-headed` | `true` | 显式指定无头模式 |

### 2.5 高级用法：有头模式下的调试增强

当启用有头模式时，可自动附带以下调试增强：

```typescript
const browser = await chromium.launch({
  headless,
  timeout: options.timeout ?? 30000,
  args: [
    ...browserArgs,
    // 有头模式下自动添加调试辅助参数
    ...(headless ? [] : [
      '--auto-open-devtools-for-tabs',  // 自动打开 DevTools
    ]),
  ],
  // 有头模式下添加 slowMo 使操作可视化
  slowMo: headless ? 0 : (options.slowMo ?? 300),
});
```

`CreatePlaywrightAdapterOptions` 可新增可选的 `slowMo` 字段：

```typescript
export interface CreatePlaywrightAdapterOptions extends PlaywrightAdapterOptions {
  timeout?: number;
  /**
   * 操作延迟（毫秒），有头调试时有用
   * 仅在 headless: false 时生效
   * @default 0
   */
  slowMo?: number;
}
```

## 3. 影响范围

### 3.1 向后兼容性

| 影响 | 说明 |
|------|------|
| **CLI 默认行为** | 不变，`--headed` 必须显式指定 |
| **库 API 默认行为** | 不变，`headless` 默认 `true` |
| **现有测试** | 不受影响，`headless: true` 是默认值 |
| **示例代码** | 示例中 `headless: true` 仍有效，无需修改 |
| **用户脚本** | 直接使用 `new PlaywrightFetcherAdapter(page, context)` 的用户不受影响（浏览器生命周期由调用方管理） |

### 3.2 依赖关系

```
apps/cli/src/cli.ts
  → apps/cli/src/browser.ts (BrowserAdapterOptions.headless)
    → packages/adapter-playwright/src/adapter.ts (CreatePlaywrightAdapterOptions.headless)
      → playwright (chromium.launch)
    → packages/adapter-puppeteer/src/adapter.ts (CreatePuppeteerAdapterOptions.headless)
      → puppeteer (puppeteer.launch)
```

### 3.3 注意事项

1. **有头模式仅在 `createPlaywrightAdapter()`/`createPuppeteerAdapter()` 工厂函数中生效**，直接使用 `new PlaywrightFetcherAdapter(page, context)` 时，浏览器由调用方创建，不受此选项影响
2. **CI 环境中不要使用 `--headed`**，CI 通常没有显示器，有头模式会失败
3. **Windows 子系统（WSL）** 中有头模式需要额外配置 X11 转发，可文档说明
4. **有头模式可能影响性能**，浏览器窗口渲染需要额外资源

## 4. 测试计划

### 4.1 单元测试

| 测试项 | 位置 | 说明 |
|--------|------|------|
| `createPlaywrightAdapter` 默认 headless | `adapter-playwright` 测试 | 不传 headless 时，默认 true |
| `createPlaywrightAdapter` 显式 headless | `adapter-playwright` 测试 | 传 `headless: false` 时，launch 参数正确 |
| `createPuppeteerAdapter` 默认 headless | `adapter-puppeteer` 测试 | 同上 |
| `createPuppeteerAdapter` 显式 headless | `adapter-puppeteer` 测试 | 同上 |

### 4.2 集成测试

| 测试项 | 说明 |
|--------|------|
| CLI 无 `--headed` | 默认无头模式，现有行为不变 |
| CLI `--headed` | 浏览器以有头模式启动 |
| CLI `--no-headed` | 显式无头模式 |
| 有头模式 + 反爬页面 | 验证 shidianguji 等页面在非 headless 下 API 是否正常 |

### 4.3 手动测试场景

```bash
# 有头模式快照（可观察浏览器窗口）
pnpm dev:cli -- https://www.shidianguji.com/library/?page_from=collection_list --adapter playwright --headed

# 显式无头模式（与默认行为一致）
pnpm dev:cli -- https://www.shidianguji.com/library/?page_from=collection_list --adapter playwright --no-headed

# 有头 + Puppeteer
pnpm dev:cli -- https://example.com --adapter puppeteer --headed
```

## 5. 相关文档更新

| 文档 | 需要更新的内容 |
|------|--------------|
| `docs/dev/PLAYWRIGHT_INSTANCE_GUIDE.md` | 非 Headless 模式调试章节补充 `--headed` CLI 用法 |
| `docs/plan/12-headed-mode-support.md` | 本文件（设计文档自身） |
| `apps/cli/README.md` 或 CLI 帮助 | 新增 `--headed` 和 `--no-headed` 选项说明 |

## 6. 实施步骤

1. **Playwright 适配器**：`packages/adapter-playwright/src/options.ts` + `adapter.ts`
2. **Puppeteer 适配器**：`packages/adapter-puppeteer/src/options.ts` + `adapter.ts`
3. **CLI 层**：`apps/cli/src/browser.ts` + `cli.ts` + `cli-adapter.ts`
4. **测试**：单元测试 + 集成测试
5. **文档**：更新相关文档

## 7. 附录：反爬对比验证

以下为 headless 模式与有头模式在反爬检测上的差异参考：

| 检测项 | Headless | Headed |
|--------|----------|--------|
| `navigator.webdriver` | `true` | `false` |
| `chrome.runtime` | 缺失部分 API | 完整 |
| 窗口尺寸 | 典型 800x600 | 用户屏幕尺寸 |
| User-Agent | 含 `HeadlessChrome` | 正常 Chrome UA |
| WebGL 渲染 | 可能不完整 | 完整 |
| 权限 API | 行为异常 | 正常 |

**注意**：使用 `--headed` 并不能保证 100% 绕过所有反爬检测，但能显著降低被检测的概率。对于 shidianguji.com 这类使用字节跳动反爬系统的网站，有头模式结合其他措施（如设置合理的 User-Agent、Viewport 等）可提高成功率。

## 8. executeJs 实现分析

### 8.1 当前实现概览

| 适配器 | executeJs: true（默认） | executeJs: false |
|--------|----------------------|-----------------|
| **Playwright** | `page.goto()` → 全页面渲染 → SPA 等待 → `page.content()` | `context.request.fetch()` → 原始 HTTP 请求（无 JS、无渲染） |
| **Puppeteer** | `page.goto()` → SPA 等待 → `page.content()` | `fetchWithHttp()` → 带 Cookie 的 Node.js HTTP fetch |

### 8.2 问题分析

#### 问题 1：无降级/回退机制

当 `executeJs: true`（默认）时，如果 `page.goto()` 导航或 JS 执行失败（超时、反爬阻断、页面崩溃），适配器直接抛出异常，整个快照流程终止。**没有尝试回退到 `executeJs: false` 模式或使用不同参数重试。**

```typescript
// 当前代码（Playwright adapter.ts:166-168）
if (!response) {
  throw new Error(`Failed to navigate to ${url}`);
}
// 无反爬检测失败的降级处理
```

**影响**：对于 shidianguji.com 这类页面，JS 执行"成功"（页面加载完毕）但 API 请求被反爬阻断，页面显示空状态。适配器不会检测到内容为空，也不会尝试其他策略。

#### 问题 2：executeJs: false 对 CSR SPA 无效

对于 CSR（Client-Side Rendered）SPA 页面，`executeJs: false` 返回的是原始 HTML 外壳（`<div id="root"></div>`），不包含任何实际内容。但适配器没有检测页面是否为空，也没有提示用户：

```typescript
// Puppeteer fetchWithHttp: 直接返回原始 HTTP 响应
// 不检查返回的 HTML 是否包含实际内容（如 #app 内是否有子元素）
```

**影响**：用户设置 `executeJs: false` 后获得一个几乎空白的页面，没有收到任何提示告知这是 SPA 页面，需要启用 JS 执行。

#### 问题 3：executeJs 选项未暴露到 CLI

当前 `executeJs` 仅存在于适配器层的 `PlaywrightAdapterOptions` / `PuppeteerAdapterOptions` 中，CLI 没有任何参数可以控制。用户无法通过命令行快速切换 JS 执行模式：

```
# 当前 CLI 不支持以下用法
pnpm dev:cli -- https://example.com --adapter playwright --no-js
```

#### 问题 4：SPA 等待在内容为空时浪费资源

当页面加载但 SPA 初始化失败（如 API 被反爬阻断）时，`waitForSpaHydration()` 仍然会执行：

- Phase 1: `page.evaluate()` 检测框架标识 —— 可能成功（webpack 等非标准框架返回 false）
- Phase 2: 未检测到框架，跳过
- Phase 3: `waitForFunction` 检测 `document.readyState === 'complete'` —— 立即返回
- Phase 4: 固定 `waitForTimeout(1000)` —— 仍然执行，浪费 1 秒

**影响**：额外的 1 秒延迟，但没有任何实际效果，因为页面已经是空状态。

#### 问题 5：SPA 检测器框架覆盖不全

当前 SPA 检测器仅识别 Nuxt/Vue/React/Angular，对于 shidianguji.com 这类使用 webpack + Semi-UI（字节跳动）的页面，框架不被识别，检测器退化为 `document.readyState === 'complete'`，无法提供有效的 hydration 等待。

### 8.3 改进建议

#### 改进 1：添加 JS 执行失败后的降级策略

```typescript
async fetchWithPage(url, options, pwOptions): Promise<FetchResult> {
  try {
    // 默认：执行 JS 渲染
    return await this.fetchWithJs(url, options, pwOptions);
  } catch (error) {
    // 如果 JS 执行失败且未设置 executeJs: false，尝试降级到原始 HTTP
    if (pwOptions.executeJs !== false && this.isJsExecutionError(error)) {
      console.warn(`[Playwright Adapter] JS execution failed, falling back to raw HTTP fetch: ${error.message}`);
      return await this.fetchRawHtml(url, options, pwOptions);
    }
    throw error;
  }
}
```

#### 改进 2：内容有效性检测

在 `page.content()` 获取 HTML 后，检查页面是否包含实际内容：

```typescript
const html = await this.page.content();
// 检测是否为 SPA 空壳
const bodyContent = await this.page.evaluate(() => {
  const root = document.querySelector('#root, #app, #__nuxt, .app');
  if (root) return root.children.length > 0 ? 'has-content' : 'empty-shell';
  return document.body ? (document.body.children.length > 3 ? 'has-content' : 'possibly-empty') : 'no-body';
});
if (bodyContent === 'empty-shell' && pwOptions.executeJs !== false) {
  console.warn(`[Playwright Adapter] Page appears to be an empty SPA shell — API may be blocked`);
}
```

#### 改进 3：CLI 暴露 `--no-js` / `--execute-js` 选项

```bash
# 禁用 JS 执行（仅获取原始 HTML）
pnpm dev:cli -- https://example.com --adapter playwright --no-js
```

#### 改进 4：配置化的 SPA 检测等待时间

将 SPA hydration 等待的固定 1 秒延迟变为可配置项，允许用户设置 `--spa-wait <ms>` 或设为 0 跳过。

### 8.4 改进优先级

| 优先级 | 改进项 | 工作量 | 影响 |
|--------|--------|--------|------|
| P0 | CLI 暴露 `--no-js` 选项 | 小 | 低（用户可自行控制） |
| P1 | 内容有效性检测 + 警告 | 中 | 中（帮助用户诊断问题） |
| P2 | JS 失败降级策略 | 中 | 中（提高成功率） |
| P3 | SPA 检测器框架扩展 | 大 | 中（覆盖更多页面类型） |
| P4 | SPA 等待时间可配置 | 小 | 低（边际收益） |
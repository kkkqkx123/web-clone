# Playwright 集成实现审查与修复方案

> 审查日期：2026-07-12
> 涉及版本：web-clone v1.0.0

---

## 目录

1. [总体评价](#1-总体评价)
2. [P0: 适配器未贯穿下载链路](#2-p0-适配器未贯穿下载链路)
3. [P1: 主文档判断逻辑错误](#3-p1-主文档判断逻辑错误)
4. [P1: CLI 重复启动浏览器](#4-p1-cli-重复启动浏览器)
5. [P2: 选项合并优先级错误](#5-p2-选项合并优先级错误)
6. [P3: executeJs 选项未实现](#6-p3-executejs-选项未实现)
7. [P3: waitForLoadState 冗余调用](#7-p3-waitforloadstate-冗余调用)
8. [P4: saveState/loadState 薄包装](#8-p4-savestateloadstate-薄包装)
9. [P4: getAuthContext 只检查首个 origin](#9-p4-getauthcontext-只检查首个-origin)
10. [实施步骤](#10-实施步骤)

---

## 1. 总体评价

### 1.1 架构正确性

**适配器模式 + 模块分离** 的方向是正确的：

```
FetcherAdapter (interface)          ← 纯抽象，零 Playwright 依赖
  ├── HttpFetcherAdapter            ← 默认实现
  └── PlaywrightFetcherAdapter      ← Playwright 实现，独立入口
```

核心库 (`assembler.ts`, `index.ts`) 已无 Playwright 类型引用，Playwright 适配器通过 `web-clone/adapters` 子路径导出，使用者按需安装。**Architecture is sound.**

### 1.2 实现问题总览

| 编号 | 严重程度 | 问题 | 位置 |
|------|----------|------|------|
| #1 | **P0** | 子资源下载绕过适配器，认证页面快照部分失效 | `fetcher.ts:273` |
| #2 | **P1** | 同源子资源被误判为主文档，触发错误导航 | `playwright-fetcher-adapter.ts:145-149` |
| #3 | **P1** | CLI 重复启动浏览器，浪费资源 | `cli.ts:205-215` + `playwright.ts:55-104` |
| #4 | **P2** | 选项合并优先级错误，`validateSSL` 被覆盖 | `playwright-fetcher-adapter.ts:134-140` |
| #5 | **P3** | `executeJs` 声明但未使用 | `playwright-fetcher-adapter.ts:44` |
| #6 | **P3** | `waitForLoadState` 冗余调用 | `playwright-fetcher-adapter.ts:198-201` |
| #7 | **P4** | `saveState/loadState` 是 Playwright 内置 API 的薄包装 | `playwright-fetcher-adapter.ts:360-431` |
| #8 | **P4** | `getAuthContext` 只检查第一个 origin 的 localStorage | `playwright-fetcher-adapter.ts:325` |

---

## 2. P0: 适配器未贯穿下载链路

### 2.1 问题描述

`downloadSingleAsset` 直接调用 `fetchWithTimeout`，完全不使用 `FetcherAdapter`。

**当前代码** (`fetcher.ts:273`):

```typescript
const result = await fetchWithTimeout(ref.url, options.timeout, referer, maxSize);
```

**后果**：Playwright 模式下，子资源（JS、图片、字体、媒体）全部通过裸 HTTP 获取，丢失认证 Cookie。

### 2.2 修复方案

**方案 A（推荐）**：将 `FetcherAdapter` 传入 `downloadAllAssets` 和 `downloadSingleAsset`。

**修改点**：

#### 2.2.1 `fetcher.ts` — 修改 `downloadAllAssets` 签名

```typescript
export async function downloadAllAssets(
  refs: AssetRef[],
  options: SnapshotOptions,
  onProgress?: (asset: Asset, index: number, total: number) => void,
  adapter?: FetcherAdapter,                          // ← 新增参数
): Promise<Asset[]> {
  const tasks = refs.map(ref => () => downloadSingleAsset(ref, options, options.url, adapter));
  // ... 其余不变
}
```

#### 2.2.2 `fetcher.ts` — 修改 `downloadSingleAsset` 签名

```typescript
export async function downloadSingleAsset(
  ref: AssetRef,
  options: SnapshotOptions,
  referer: string,
  adapter?: FetcherAdapter,                          // ← 新增参数
): Promise<Asset> {
  // ...
  // 将 fetchWithTimeout 替换为 adapter.fetch()
  const fetcher = adapter ?? { fetch: (url: string, opts: any) => fetchWithTimeout(url, opts.timeout, opts.referer, opts.maxSize) };
  const result = await fetcher.fetch(ref.url, { timeout: options.timeout, referer, maxSize });
  // ...
}
```

或者更简洁：创建一个内部辅助函数：

```typescript
async function doFetch(url: string, options: SnapshotOptions, referer: string, adapter?: FetcherAdapter) {
  if (adapter) {
    return adapter.fetch(url, { timeout: options.timeout, maxSize: options.maxFileSize, referer });
  }
  return fetchWithTimeout(url, options.timeout, referer, options.maxFileSize ?? 0);
}
```

#### 2.2.3 `assembler.ts` — 传递 adapter

```typescript
const assets = await downloadAllAssets(filteredRefs, options, progressCallback, adapter);
//                                                                          ↑ 传入 adapter
```

### 2.3 影响范围

- `fetcher.ts`: 2 个函数签名变更
- `assembler.ts`: 1 处调用更新
- `HttpFetcherAdapter` 的 `fetch` 方法已兼容 `fetchWithTimeout` 的返回值格式，无需额外修改

---

## 3. P1: 主文档判断逻辑错误

### 3.1 问题描述

`PlaywrightFetcherAdapter.fetch()` 内部通过 URL 启发式判断"是否是主文档请求"：

```typescript
const isMainDocument =
  !currentUrl ||
  currentUrl === 'about:blank' ||
  new URL(url).origin === new URL(currentUrl).origin;  // ← 同源即判为主文档
```

当页面在 `https://app.example.com/dashboard` 时，同源的 `style.css` 会被判定为主文档，触发 `page.goto()` 导航，而非用 `context.request.fetch()` 获取内容。

### 3.2 修复方案

**原则**：主文档/子资源的判断应由调用方决定，而非适配器推断。

#### 3.2.1 扩展 `FetchOptions`

在 `fetcher-adapter.ts` 的 `FetchOptions` 中增加 `isMainDocument` 标记：

```typescript
export interface FetchOptions {
  // ... 现有字段 ...
  
  /**
   * 标记此请求是否为主文档（HTML 页面）。
   * - true: 使用 page.goto() 获取渲染后的 HTML
   * - false/undefined: 使用 context.request.fetch() 获取资源
   * 由调用方（snapshotInternal）根据上下文设置。
   */
  isMainDocument?: boolean;
}
```

#### 3.2.2 修改 `PlaywrightFetcherAdapter.fetch()`

```typescript
async fetch(url: string, options: FetchOptions): Promise<FetchResult> {
  // 不再通过 URL 启发式判断，完全由调用方决定
  if (options.isMainDocument) {
    return await this.fetchWithPage(url, options, mergedOptions);
  } else {
    return await this.fetchWithContext(url, options, mergedOptions);
  }
}
```

#### 3.2.3 修改 `assembler.ts` 的调用点

`fetchHtml` 调用时传入 `isMainDocument: true`，CSS 解析循环和 `downloadSingleAsset` 调用时传入 `isMainDocument: false`（或不传，默认 false）。

```typescript
// fetchHtml 内部
const result = await adapter.fetch(url, { timeout, maxSize, isMainDocument: true });

// CSS 解析循环
const result = await adapter.fetch(ref.url, { timeout, maxSize, referer: options.url, isMainDocument: false });

// downloadSingleAsset 内部
const result = await adapter.fetch(ref.url, { timeout, referer, maxSize, isMainDocument: false });
```

### 3.3 `fetchWithPage` 的优化

修复主文档判断后，`fetchWithPage` 只在首次获取 HTML 时被调用，不会再被误调用于子资源。此时可以移除 `fetchWithPage` 中的冗余 `waitForLoadState`（见第 7 节）。

---

## 4. P1: CLI 重复启动浏览器

### 4.1 问题描述

`cli.ts` 的 `performPlaywrightSnapshot()` 先启动浏览器、创建 context、加载 auth state，然后调用 `snapshotWithPlaywright()`，后者**内部又启动了一个全新的浏览器**。

### 4.2 修复方案

**方案**：CLI 改用 `snapshot()` + `PlaywrightFetcherAdapter` 直接调用，或者使用 `snapshotWithBrowserContext()` 传入已创建的 context。

#### 4.2.1 修改 `cli.ts` 的 `performPlaywrightSnapshot()`

```typescript
async function performPlaywrightSnapshot(
  options: any,
  opts: CommanderOpts
): Promise<SnapshotResult> {
  const { chromium } = await import('playwright');

  const launchOptions: LaunchOptions = {
    headless: opts.headless !== 'false',
    proxy: opts.proxy ? { server: opts.proxy } : undefined,
  };

  const contextOptions: BrowserContextOptions = {
    userAgent: opts.userAgent,
  };

  if (opts.viewport) {
    contextOptions.viewport = parseViewport(opts.viewport);
  }

  const browser = await chromium.launch(launchOptions);

  try {
    const context = await browser.newContext(contextOptions);

    // Load state if provided
    if (opts.loadState) {
      // ... 加载状态逻辑 ...
    }

    // Run auth script if provided
    if (opts.authScript && !opts.loadState) {
      // ... 执行认证脚本逻辑 ...
    }

    // 方案 A: 用 snapshotWithBrowserContext 传入已有 context
    const result = await snapshotWithBrowserContext(
      options.url,
      options,
      context,
      {}  // adapterOptions
    );

    // Save state if requested
    if (opts.saveState) {
      // ... 保存状态逻辑 ...
    }

    return result;
  } finally {
    await browser.close();
  }
}
```

#### 4.2.2 或者完全移除 `snapshotWithPlaywright` 的浏览器管理职责

`snapshotWithPlaywright` 可以简化为直接调用 `snapshotWithBrowserContext` 并在内部启动浏览器，但 CLI 不再使用它，而是直接用 `snapshotWithBrowserContext`。

或者更彻底：删除 `snapshotWithPlaywright()`，因为 `snapshotWithBrowserContext()` + `snapshot()` 已覆盖所有场景。由调用方决定是否管理浏览器生命周期。

---

## 5. P2: 选项合并优先级错误

### 5.1 问题描述

```typescript
const mergedOptions: PlaywrightAdapterOptions = {
  waitForNavigation: this.options.waitForNavigation ?? true,
  executeJs: this.options.executeJs ?? true,
  waitForLoadState: this.options.waitForLoadState ?? 'networkidle',
  validateSSL: options.validateSSL ?? true,    // 被下一行覆盖
  ...this.options,                              // validateSSL 可能被覆盖为 undefined
};
```

### 5.2 修复方案

明确合并优先级：`FetchOptions` 的参数 > `PlaywrightAdapterOptions` 的构造参数 > 默认值。

```typescript
const mergedOptions: PlaywrightAdapterOptions = {
  // 默认值
  waitForNavigation: true,
  executeJs: true,
  waitForLoadState: 'networkidle',
  validateSSL: true,
  // 构造时传入的配置（次优先）
  ...this.options,
  // 每次 fetch 调用时传入的配置（最高优先）
  ...(options.validateSSL !== undefined ? { validateSSL: options.validateSSL } : {}),
};
```

---

## 6. P3: executeJs 选项未实现

### 6.1 问题描述

`PlaywrightAdapterOptions` 声明了 `executeJs?: boolean`，但没有任何代码读取它。

### 6.2 修复方案

**二选一**：

**方案 A：实现 executeJs 逻辑**

```typescript
private async fetchWithPage(url: string, options: FetchOptions, pwOptions: PlaywrightAdapterOptions): Promise<FetchResult> {
  if (pwOptions.executeJs === false) {
    // 不执行 JS：使用 context.request.fetch() 获取原始 HTML
    const response = await (this.context.request!).fetch(url, {
      timeout: options.timeout ?? 30000,
      headers: { ...options.headers, ...pwOptions.customHeaders },
    });
    // ... 处理响应 ...
  } else {
    // 执行 JS：使用 page.goto() 获取渲染后 HTML
    const response = await this.page.goto(url, { ... });
    // ... 处理响应 ...
  }
}
```

**方案 B：删除该选项**

如果当前没有使用场景，删除 `executeJs` 避免混淆。用户可以通过选择 `snapshotWithBrowserContext` 或直接使用 `snapshot()` + adapter 来控制是否执行 JS。

---

## 7. P3: waitForLoadState 冗余调用

### 7.1 问题描述

```typescript
const response = await this.page.goto(url, {
  timeout: options.timeout ?? 30000,
  waitUntil: pwOptions.waitForLoadState,     // goto 已等待
});

if (pwOptions.waitForNavigation && pwOptions.waitForLoadState) {
  await this.page.waitForLoadState(pwOptions.waitForLoadState);  // 重复等待
}
```

### 7.2 修复方案

删除冗余的 `waitForLoadState` 调用：

```typescript
const response = await this.page.goto(url, {
  timeout: options.timeout ?? 30000,
  waitUntil: pwOptions.waitForLoadState,
});

// 不再需要二次 waitForLoadState
```

---

## 8. P4: saveState/loadState 薄包装

### 8.1 问题描述

`saveState` 和 `loadState` 是 Playwright 内置 API 的薄包装：

```typescript
// saveState — 等同于 context.storageState() + 写文件
async saveState(path: string): Promise<void> {
  const state = await this.context.storageState();
  await fs.writeFile(path, JSON.stringify(state, null, 2), 'utf-8');
}

// loadState — 等同于 读文件 + context.addCookies()
async loadState(path: string): Promise<void> {
  const state = JSON.parse(content);
  await this.context.addCookies(state.cookies);
  // ... 遍历 origins 设置 localStorage ...
}
```

Playwright 的 `browserContext.storageState({ path })` 和 `browserContext.addCookies()` 已原生支持这些功能。

### 8.2 修复方案

**方案**：标记为 `@deprecated`，在文档中建议用户直接使用 Playwright 内置 API：

```typescript
/**
 * @deprecated Use Playwright's built-in BrowserContext.storageState() and
 * BrowserContext.addCookies() directly instead.
 * 
 * Example:
 *   await context.storageState({ path: 'state.json' });
 *   const context = await browser.newContext({ storageState: 'state.json' });
 */
```

或者直接删除，由调用方自己管理状态持久化。

---

## 9. P4: getAuthContext 只检查首个 origin

### 9.1 问题描述

```typescript
if (storageState?.origins && storageState.origins.length > 0) {
  const localStorage = storageState.origins[0].localStorage;  // ← 只检查第一个
  // ...
}
```

对于多域名应用（如 `auth.example.com` 发 token，`app.example.com` 使用），会漏掉后者的 localStorage。

### 9.2 修复方案

遍历所有 origins：

```typescript
let token: string | undefined;
if (storageState?.origins) {
  for (const origin of storageState.origins) {
    if (origin.localStorage) {
      for (const item of origin.localStorage) {
        if (
          item.name.toLowerCase().includes('token') ||
          item.name.toLowerCase().includes('auth')
        ) {
          token = item.value;
          break;
        }
      }
      if (token) break;
    }
  }
}
```

---

## 10. 实施步骤

### 阶段 1：P0 修复 — 适配器贯穿下载链路

**文件**：`fetcher.ts`, `assembler.ts`

| 步骤 | 操作 | 预计工作量 |
|------|------|------------|
| 1.1 | 修改 `fetchWithTimeout` 调用处，改为优先使用 adapter | 0.5h |
| 1.2 | 修改 `downloadAllAssets` 签名，增加 `adapter` 参数 | 0.2h |
| 1.3 | 修改 `downloadSingleAsset` 签名，使用 adapter 或回退到 `fetchWithTimeout` | 0.3h |
| 1.4 | 修改 `snapshotInternal` 中调用 `downloadAllAssets` 处，传入 adapter | 0.1h |
| 1.5 | 验证：Playwright 模式下子资源也能携带 Cookie | 0.5h |

### 阶段 2：P1 修复 — 主文档判断 + CLI 重复启动

**文件**：`fetcher-adapter.ts`, `playwright-fetcher-adapter.ts`, `assembler.ts`, `cli.ts`

| 步骤 | 操作 | 预计工作量 |
|------|------|------------|
| 2.1 | `FetchOptions` 增加 `isMainDocument?: boolean` | 0.1h |
| 2.2 | 修改 `PlaywrightFetcherAdapter.fetch()` 使用 `options.isMainDocument` 判断 | 0.3h |
| 2.3 | 修改 `fetchHtml` 调用处传 `isMainDocument: true` | 0.1h |
| 2.4 | 修改 CSS 解析循环和子资源下载传 `isMainDocument: false` | 0.2h |
| 2.5 | 修改 CLI 使用 `snapshotWithBrowserContext` 而非 `snapshotWithPlaywright` | 0.5h |
| 2.6 | 验证：同源 CSS 不再触发页面导航 | 0.3h |

### 阶段 3：P2-P4 修复

**文件**：`playwright-fetcher-adapter.ts`

| 步骤 | 操作 | 预计工作量 |
|------|------|------------|
| 3.1 | 修复选项合并优先级 | 0.2h |
| 3.2 | 实现 `executeJs` 或删除 | 0.3h |
| 3.3 | 删除冗余 `waitForLoadState` | 0.1h |
| 3.4 | `saveState/loadState` 标记 `@deprecated` | 0.1h |
| 3.5 | 修复 `getAuthContext` 遍历所有 origins | 0.2h |

### 工作量估计

| 阶段 | 内容 | 预估时间 |
|------|------|----------|
| 1 | P0 修复 | 1.5h |
| 2 | P1 修复 | 1.5h |
| 3 | P2-P4 修复 | 1h |
| **总计** | | **4h** |

### 验证清单

- [ ] Playwright 快照的 JS 子资源携带 Cookie
- [ ] Playwright 快照的图片子资源携带 Cookie
- [ ] 同源 CSS 使用 `context.request.fetch()` 而非 `page.goto()`
- [ ] CLI `--use-playwright` 只启动一个浏览器
- [ ] `--save-state` 和 `--load-state` 正确工作
- [ ] `getAuthContext()` 返回多域名 token
- [ ] `validateSSL: false` 选项生效
- [ ] 现有 HTTP 模式快照不受影响
# 浏览器上下文配置与 CLI 配置文件增强方案

## 1. 背景与问题

### 1.1 浏览器上下文配置缺失

对比成功爬虫（`crawler-tutorial/shidianguji/scraper.py`）与 web-clone 的 Playwright 适配器，发现关键差异：

| 配置项 | 成功爬虫 | web-clone `createPlaywrightAdapter` | 影响 |
|--------|---------|--------------------------------------|------|
| **User-Agent** | `Mozilla/5.0 ... Chrome/125.0.0.0` | **未设置** → 默认 UA 含 `HeadlessChrome` | ❌ 反爬直接识别 |
| **Viewport** | `1920×1080` | **未设置** → 默认 `1280×720` | ❌ 典型 headless 尺寸 |
| **Locale** | `zh-CN` | **未设置** → 系统默认 | ❌ 中文网站不自然 |
| **headless** | `true` | `true`（已可配置） | ✅ 已修复 |

当前 `createPlaywrightAdapter()` 创建浏览器上下文时：
```typescript
const context = await browser.newContext({
    ...(proxyUrl ? { ignoreHTTPSErrors: true } : {}),
});
```

没有任何 User-Agent、Viewport、Locale 等配置，导致：
- 反爬系统通过 `HeadlessChrome` UA 字符串轻易识别
- 默认 1280×720 视口进一步暴露 headless 特征
- 中文网站缺少 `zh-CN` locale 设置

### 1.2 CLI 参数过长

当前 CLI 支持大量参数（约 40+ 个选项），对于复杂场景需要手写极长的命令：

```bash
pnpm dev:cli -- https://example.com --adapter playwright --headed --timeout 90000 --mode bundle \
  --max-assets 200 --concurrency 8 --retry-count 3 --resource-preset no-media --scan-depth 2 \
  --include-fonts --exclude-js --codegen-framework react --codegen-typescript \
  --extract-components --component-filter "confidence >= 0.7"
```

已有配置文件系统（`web-clone.config.json`、`.web-clonerc`），但仅支持资源过滤相关选项，**不支持浏览器适配器选项和大部分 CLI 参数**。

## 2. 设计目标

1. **浏览器指纹可配置**：User-Agent、Viewport、Locale 等可通过适配器选项、CLI 参数、配置文件三种方式设置
2. **合理的默认值**：提供一套能通过大多数反爬检测的默认浏览器配置
3. **配置文件全面覆盖**：所有 CLI 参数均可通过 JSON 配置文件指定
4. **分层优先级**：CLI 参数 > 项目配置文件 > 全局配置文件 > 代码默认值
5. **向后兼容**：现有代码和配置不破坏

## 3. 浏览器上下文配置设计

### 3.1 接口定义

#### 适配器层（Playwright）

**`packages/adapter-playwright/src/options.ts`** — `PlaywrightAdapterOptions` 新增字段：

```typescript
export interface PlaywrightAdapterOptions {
  // ... 现有字段 ...

  /**
   * Browser User-Agent string.
   * If not set, Playwright's default is used (which includes "HeadlessChrome").
   * Set to a normal Chrome UA to reduce anti-bot detection probability.
   *
   * @example 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
   */
  userAgent?: string;

  /**
   * Browser viewport size.
   * If not set, Playwright's default 1280x720 is used.
   * Setting to 1920x1080 helps avoid headless browser detection.
   *
   * @default { width: 1280, height: 720 }
   */
  viewport?: { width: number; height: number };

  /**
   * Browser locale (e.g. 'zh-CN', 'en-US').
   * Affects Accept-Language header and browser locale APIs.
   * For Chinese websites, setting to 'zh-CN' helps appear more natural.
   */
  locale?: string;

  /**
   * Geographic location override.
   * Sets navigator.geolocation and timezone.
   */
  geolocation?: {
    latitude: number;
    longitude: number;
    /** Timezone ID, e.g. 'Asia/Shanghai' */
    timezoneId?: string;
  };

  /**
   * Extra Chromium launch arguments.
   * These are appended to the default args in createPlaywrightAdapter().
   *
   * @example ['--disable-gpu', '--disable-software-rasterizer']
   */
  launchArgs?: string[];
}
```

**`packages/adapter-playwright/src/adapter.ts`** — `createPlaywrightAdapter()` 使用新配置：

```typescript
export async function createPlaywrightAdapter(
  options: CreatePlaywrightAdapterOptions = {}
): Promise<PlaywrightAdapterHandle> {
  const { chromium } = await import('playwright');

  // ... 代理解析逻辑不变 ...

  const headless = options.headless !== false;

  const browser = await chromium.launch({
    headless,
    timeout: options.timeout ?? 30000,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      ...(options.launchArgs ?? []),
      ...(proxyUrl ? [`--proxy-server=${proxyHost}`, '--ignore-certificate-errors'] : []),
    ],
  });

  const context = await browser.newContext({
    ...(proxyUrl ? { ignoreHTTPSErrors: true } : {}),
    // 浏览器上下文配置
    ...(options.userAgent ? { userAgent: options.userAgent } : {}),
    ...(options.viewport ? { viewport: options.viewport } : {}),
    ...(options.locale ? { locale: options.locale } : {}),
    ...(options.geolocation ? {
      geolocation: { latitude: options.geolocation.latitude, longitude: options.geolocation.longitude },
      timezoneId: options.geolocation.timezoneId,
    } : {}),
  });
  const page = await context.newPage();

  // ... 其余不变 ...
}
```

#### 适配器层（Puppeteer）

**`packages/adapter-puppeteer/src/options.ts`** — `PuppeteerAdapterOptions` 新增相同字段：

```typescript
export interface PuppeteerAdapterOptions {
  // ... 现有字段 ...
  userAgent?: string;
  viewport?: { width: number; height: number };
  locale?: string;
  geolocation?: { latitude: number; longitude: number; timezoneId?: string };
  launchArgs?: string[];
}
```

**`packages/adapter-puppeteer/src/adapter.ts`** — `createPuppeteerAdapter()` 使用新配置：

```typescript
const page = await browser.newPage() as unknown as PuppeteerPage;

// 设置上下文参数（Puppeteer 通过 page 级别设置）
if (options.userAgent) await page.setUserAgent(options.userAgent);
if (options.viewport) await page.setViewport(options.viewport);
if (options.locale) {
  await page.setExtraHTTPHeaders({ 'Accept-Language': options.locale.replace('_', '-') });
}
```

#### CLI 层

**`apps/cli/src/browser.ts`** — `BrowserAdapterOptions` 新增字段：

```typescript
export interface BrowserAdapterOptions {
  // ... 现有字段 ...
  headless?: boolean;
  userAgent?: string;
  viewport?: string;  // 格式: "widthxheight", 如 "1920x1080"
  locale?: string;
  launchArgs?: string[];
}
```

**`apps/cli/src/cli.ts`** — 新增 CLI 选项：

```typescript
program
  // ... 现有选项 ...
  .option('--user-agent <ua>', 'Browser User-Agent string (override Playwright/Puppeteer default)')
  .option('--viewport <size>', 'Browser viewport size, e.g. "1920x1080" (default: 1280x720)')
  .option('--locale <locale>', 'Browser locale, e.g. "zh-CN" (affects Accept-Language)')
  .option('--launch-args <args>', 'Extra Chromium launch arguments (comma-separated)')
```

**`apps/cli/src/cli.ts`** — 传递到 `createBrowserAdapter`：

```typescript
const handle = await createBrowserAdapter(adapterType, {
  timeout: options.timeout,
  headless: opts.headed !== undefined ? !opts.headed : true,
  userAgent: opts.userAgent,
  viewport: opts.viewport ? parseViewport(opts.viewport) : undefined,
  locale: opts.locale,
  launchArgs: opts.launchArgs ? opts.launchArgs.split(',') : undefined,
});
```

辅助函数：

```typescript
function parseViewport(val: string): { width: number; height: number } | undefined {
  const m = val.match(/^(\d+)x(\d+)$/);
  if (!m) {
    console.warn(`⚠ Invalid viewport format: "${val}", expected "WIDTHxHEIGHT" (e.g. "1920x1080")`);
    return undefined;
  }
  return { width: parseInt(m[1], 10), height: parseInt(m[2], 10) };
}
```

### 3.2 合理的默认值

为 `createPlaywrightAdapter()` 和 `createPuppeteerAdapter()` 设置合理的默认浏览器上下文，降低反爬检测概率：

```typescript
// 默认 User-Agent（不含 HeadlessChrome）
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

// 默认 Viewport
const DEFAULT_VIEWPORT = { width: 1920, height: 1080 };

// 默认 Locale（根据常见场景）
const DEFAULT_LOCALE = 'zh-CN';
```

**注意**：这些默认值应该**仅在 `create*Adapter()` 工厂函数中设置**，而不是在 `PlaywrightAdapterOptions` 接口中——因为直接使用 `new PlaywrightFetcherAdapter(page, context)` 的用户自行管理浏览器上下文，不应被覆盖默认值。

### 3.3 配置分发流程

```
CLI 参数 (--user-agent, --viewport, --locale)
  │
  ▼
createBrowserAdapter()  ← BrowserAdapterOptions
  │
  ├── Playwright: createPlaywrightAdapter()  ← CreatePlaywrightAdapterOptions
  │     └── chromium.launch() + browser.newContext()
  │
  └── Puppeteer: createPuppeteerAdapter()  ← CreatePuppeteerAdapterOptions
        └── puppeteer.launch() + page.setUserAgent() + page.setViewport()
```

## 4. CLI 配置文件增强设计

### 4.1 当前配置文件系统的局限性

当前 `WebCloneConfigFile` 接口仅支持：

```typescript
export interface WebCloneConfigFile {
  $schema?: string;
  resourcePreset?: ResourcePreset;
  skipExtensions?: string[];
  includeExtensions?: string[];
  excludeExtensions?: string[];
  include?: { wasm?: boolean; bin?: boolean; ... };
  defaults?: Partial<SnapshotOptions>;  // 仅 SnapshotOptions 的子集
}
```

不支持：
- 浏览器适配器选项（`adapter`, `headless`, `userAgent`, `viewport` 等）
- 组件提取和代码生成选项（`extractComponents`, `codegenFramework` 等）
- 大量 CLI 特有选项（`serve`, `proxy`, `run` 等）
- 多 URL 批量处理

### 4.2 增强后的配置文件接口

```typescript
export interface WebCloneConfigFile {
  $schema?: string;

  // ── 资源过滤（现有，保持不变） ──────────────────────
  resourcePreset?: ResourcePreset;
  skipExtensions?: string[];
  includeExtensions?: string[];
  excludeExtensions?: string[];
  include?: { wasm?: boolean; bin?: boolean; video?: boolean; audio?: boolean; fonts?: boolean; ... };

  // ── 浏览器适配器配置（新增） ────────────────────────
  browser?: {
    /** 适配器类型: 'playwright' | 'puppeteer' */
    adapter?: string;
    /** 是否无头模式 */
    headless?: boolean;
    /** User-Agent 字符串 */
    userAgent?: string;
    /** 视口大小 */
    viewport?: string;  // "1920x1080"
    /** 语言 */
    locale?: string;
    /** 额外启动参数 */
    launchArgs?: string[];
    /** 页面加载等待策略 */
    waitForLoadState?: 'load' | 'domcontentloaded' | 'networkidle';
    /** 是否启用混合模式 */
    hybrid?: boolean;
  };

  // ── 组件提取（新增） ────────────────────────────────
  extraction?: {
    enabled?: boolean;
    depth?: number;
    framework?: string;
    filter?: string;
    extractLogic?: boolean;
    memoryLimit?: number;
  };

  // ── 代码生成（新增） ────────────────────────────────
  codegen?: {
    framework?: string;
    typescript?: boolean;
    cssModules?: boolean;
    generateDrafts?: boolean;
    extractShared?: boolean;
  };

  // ── 服务器模式（新增） ──────────────────────────────
  server?: {
    enabled?: boolean;
    port?: number;
    proxy?: boolean;
  };

  // ── 全局默认值（增强，覆盖所有 SnapshotOptions） ────
  defaults?: Partial<SnapshotOptions> & {
    /** 浏览器适配器选项（不在 SnapshotOptions 中） */
    adapter?: string;
    headless?: boolean;
    userAgent?: string;
    viewport?: string;
    locale?: string;
    launchArgs?: string[];
    hybrid?: boolean;
    serve?: boolean;
    servePort?: number;
    run?: boolean;
    proxy?: boolean;
    convertLocal?: string;
  };
}
```

### 4.3 配置加载优先级

```
1. CLI 参数（最高优先级）
       ↑
2. 项目配置文件 (./web-clone.config.json)
       ↑
3. 全局配置文件 (~/.config/web-clone/config.json)
       ↑
4. 代码默认值（最低优先级）
```

### 4.4 配置合并逻辑

在 `loadMergedConfig()` 中新增浏览器配置合并：

```typescript
export function loadMergedConfig(projectDir?: string): MergedConfig {
  const global = loadGlobalConfig();
  const project = projectDir ? searchConfigFile(projectDir) : searchConfigFile(process.cwd());

  const layers: WebCloneConfigFile[] = [];
  if (global) layers.push(global);
  if (project) layers.push(project.config);

  // 现有资源过滤合并逻辑不变 ...

  // 合并浏览器配置（全局 → 项目，项目覆盖全局）
  const browserConfig: Record<string, unknown> = {};
  for (const layer of layers) {
    if (layer.browser) {
      Object.assign(browserConfig, layer.browser);
    }
  }

  return {
    // ... 现有字段 ...
    browserConfig: browserConfig as MergedBrowserConfig | undefined,
  };
}

export interface MergedBrowserConfig {
  adapter?: string;
  headless?: boolean;
  userAgent?: string;
  viewport?: string;
  locale?: string;
  launchArgs?: string[];
  hybrid?: boolean;
  waitForLoadState?: string;
}
```

### 4.5 CLI 配置加载

在 `cli.ts` 中，将配置文件中的浏览器配置应用到 CLI 选项：

```typescript
// 在 fromCommander 中合并配置
export function fromCommander(cmd: CommanderOpts, url: string): SnapshotOptions & { browserConfig?: MergedBrowserConfig } {
  const mergedConfig: MergedConfig = loadMergedConfig();

  // ... 现有合并逻辑 ...

  // 附加浏览器配置（供后续 createBrowserAdapter 使用）
  const result = { ...opts, browserConfig: mergedConfig.browserConfig };
  return result;
}
```

### 4.6 配置文件示例

**最小配置（仅指定浏览器设置）：**

```json
{
  "browser": {
    "adapter": "playwright",
    "headless": false,
    "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "viewport": "1920x1080",
    "locale": "zh-CN"
  }
}
```

**完整配置：**

```json
{
  "$schema": "https://example.com/schemas/web-clone-config.json",
  "resourcePreset": "no-media",
  "include": {
    "fonts": true
  },
  "browser": {
    "adapter": "playwright",
    "headless": true,
    "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "viewport": "1920x1080",
    "locale": "zh-CN",
    "waitForLoadState": "networkidle"
  },
  "extraction": {
    "enabled": true,
    "depth": 3,
    "framework": "react",
    "extractLogic": true
  },
  "codegen": {
    "framework": "react",
    "typescript": true,
    "cssModules": true
  },
  "defaults": {
    "timeout": 30000,
    "maxAssets": 200,
    "concurrency": 8,
    "retryCount": 3,
    "scanDepth": 2,
    "scanJs": true
  }
}
```

**使用方式：**

```bash
# 无需任何 CLI 参数 —— 所有配置从 web-clone.config.json 读取
pnpm dev:cli -- https://www.shidianguji.com/library

# CLI 参数覆盖配置文件中的对应项
pnpm dev:cli -- https://www.shidianguji.com/library --adapter puppeteer --headed
```

## 5. 影响范围

### 5.1 向后兼容性

| 修改 | 影响 |
|------|------|
| `PlaywrightAdapterOptions` 新增字段 | 可选字段，不传时与现有行为一致 |
| `PuppeteerAdapterOptions` 新增字段 | 同上 |
| `createPlaywrightAdapter()` 默认 context | 无头模式默认使用 Playwright 默认 UA/Viewport（与之前一致） |
| `BrowserAdapterOptions` 新增字段 | 可选字段，不传时无影响 |
| CLI 新增选项 | 可选，不指定时行为不变 |
| 配置文件接口扩展 | 新增字段不会影响现有配置文件的解析 |

### 5.2 修改文件清单

| 文件 | 修改内容 |
|------|---------|
| `packages/adapter-playwright/src/options.ts` | `PlaywrightAdapterOptions` 新增 `userAgent`, `viewport`, `locale`, `geolocation`, `launchArgs` |
| `packages/adapter-playwright/src/adapter.ts` | `createPlaywrightAdapter()` 中配置 `browser.newContext()` |
| `packages/adapter-puppeteer/src/options.ts` | `PuppeteerAdapterOptions` 新增相同字段 |
| `packages/adapter-puppeteer/src/adapter.ts` | `createPuppeteerAdapter()` 中配置 page 级别设置 |
| `apps/cli/src/browser.ts` | `BrowserAdapterOptions` 新增字段，viewport 解析 |
| `apps/cli/src/cli.ts` | 新增 CLI 选项，传递到 `createBrowserAdapter` |
| `apps/cli/src/config/cli-adapter.ts` | `CommanderOpts` 新增字段，`fromCommander` 合并浏览器配置 |
| `packages/core/src/config/load-config.ts` | `WebCloneConfigFile` 接口扩展，`MergedConfig` 新增 `browserConfig`，`loadMergedConfig` 合并浏览器配置 |
| `packages/core/src/config/schema.ts` | 无修改（浏览器配置不进入 `SnapshotOptions`） |

## 6. 测试计划

### 6.1 单元测试

| 测试项 | 位置 |
|--------|------|
| `createPlaywrightAdapter` 默认上下文 | Playwright 适配器测试 |
| `createPlaywrightAdapter` 自定义 UA/Viewport | Playwright 适配器测试 |
| `createPuppeteerAdapter` 默认上下文 | Puppeteer 适配器测试 |
| `createPuppeteerAdapter` 自定义 UA/Viewport | Puppeteer 适配器测试 |
| `parseViewport()` 合法输入/非法输入 | CLI 测试 |
| 配置文件合并优先级 | Core config 测试 |

### 6.2 集成测试

| 测试项 | 说明 |
|--------|------|
| 无配置文件运行时 | 现有行为不变 |
| 有配置文件时 CLI 参数覆盖 | 确认 CLI 参数优先级高于配置文件 |
| 全局 + 项目配置文件层级 | 确认项目配置覆盖全局配置 |
| 实际反爬页面测试 | 使用新配置验证 shidianguji.com 或其他反爬页面 |

## 7. 实施步骤

1. **Playwright 适配器选项扩展**：`options.ts` + `adapter.ts`
2. **Puppeteer 适配器选项扩展**：`options.ts` + `adapter.ts`
3. **CLI 层**：`browser.ts` + `cli.ts` + `cli-adapter.ts`
4. **Core 配置文件扩展**：`load-config.ts`
5. **测试**：单元测试 + 集成测试
6. **文档**：更新 CLI 使用说明和配置文件示例

## 8. 附录：配置示例

### 8.1 反爬优化配置

针对 shidianguji.com 这类字节跳动反爬站点的推荐配置：

```json
{
  "browser": {
    "adapter": "playwright",
    "headless": true,
    "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "viewport": "1920x1080",
    "locale": "zh-CN",
    "waitForLoadState": "domcontentloaded"
  },
  "defaults": {
    "timeout": 60000
  }
}
```

### 8.2 调试配置

```json
{
  "browser": {
    "adapter": "playwright",
    "headless": false,
    "viewport": "1920x1080",
    "locale": "zh-CN",
    "waitForLoadState": "domcontentloaded"
  },
  "defaults": {
    "timeout": 90000
  }
}
```

### 8.3 批量处理配置

```json
{
  "browser": {
    "adapter": "playwright",
    "headless": true,
    "viewport": "1920x1080"
  },
  "defaults": {
    "mode": "bundle",
    "maxAssets": 200,
    "concurrency": 8,
    "timeout": 30000,
    "retryCount": 3,
    "resourcePreset": "no-media",
    "includeFonts": true
  },
  "extraction": {
    "enabled": true,
    "framework": "react"
  }
}
```
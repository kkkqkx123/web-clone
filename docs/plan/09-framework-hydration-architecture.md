# 框架感知的水合注入架构设计方案

> 基于 `docs/issue/crosspaste-hydration-analysis.md` 的分析结论，重新设计水合注入架构。
> 目标：解决当前 `injectVueHydrationForCli` 单一、冗余、仅支持 Nuxt 2 的问题，建立可扩展的多框架水合处理体系。

---

## 总览

| 当前问题 | 根因 | 新方案 |
|----------|------|--------|
| 仅支持 Nuxt 2 | 注入脚本硬编码 Nuxt 2 专用 API | 插件化策略体系，每种框架一个策略文件 |
| 水合检测与注入分离 | `detectFramework` 在 `path-fixer.ts`，注入在 `hydration.ts`，互不感知 | 统一的 `detector.ts` 输出给 `injector.ts` |
| 框架检测过于粗糙 | 仅凭字符串 `includes` 判断，误判率高 | 多维度检测（HTML 标记 + 全局变量 + JS 内容 + Meta 标记） |
| `scanDepth=2` 第二层扫描无价值 | `extractJsUrls` 正则无法区分页面链接 vs 真实资源 | 默认 `scanDepth=1`，增加精确的 Vite chunk 检测 |
| 优先级用数值，实际只有排序意义 | `priority: 100` / `priority: 80` 等数值让读者误以为有数学意义 | 改用有序列表，语义明确 |

---

## 设计原则

### 1. 检测与注入分离

```
HTML + JS 内容 → [detector.ts] → FrameworkDetection → [injector.ts] → 注入脚本
                                ↓
                          [path-fixer.ts] 复用检测结果进行路径修复
```

### 2. 策略模式

每种框架一个策略文件，实现 `HydrationStrategy` 接口。新增框架只需添加策略文件，**不修改核心逻辑**。

### 3. 优先级用有序列表

不使用数值优先级，而是用**有序列表**表示匹配顺序。语义明确，避免读者误以为优先级有数学可计算性。

---

## 架构设计

### 目录结构

```
packages/core/src/
  framework/
    detector.ts                # 统一的框架检测
    injector.ts                # 水合脚本注入器
    types.ts                   # 框架类型、HydrationStrategy 接口
    strategies/
      index.ts                 # 导出所有策略（按匹配优先级排序）
      nuxt2.ts                 # Nuxt 2 水合策略
      nuxt3.ts                 # Nuxt 3 水合策略
      vue3.ts                  # Vue 3 / VitePress 水合策略
      nextjs.ts                # Next.js 水合策略
      react.ts                 # React 通用水合策略
      angular.ts               # Angular 水合策略
      svelte.ts                # SvelteKit 水合策略
      astro.ts                 # Astro islands 水合策略
      static.ts                # 纯静态页面（空操作，降级策略）
```

### 核心类型定义

```typescript
// types.ts

/**
 * 支持的框架类型。
 * 每次新增策略时在此枚举中追加。
 */
export type FrameworkType =
  | 'nuxt2' | 'nuxt3' | 'vitepress' | 'vue3'
  | 'nextjs' | 'react' | 'react18'
  | 'angular' | 'angular-ssr'
  | 'sveltekit'
  | 'astro'
  | 'static' | 'unknown';

/**
 * 框架检测结果
 */
export interface FrameworkDetection {
  /** 识别出的框架类型 */
  framework: FrameworkType;
  /** 检测置信度（0-1），用于日志和调试 */
  confidence: number;
  /** 应用挂载点选择器，如 '#app', '#__nuxt', '#__next' */
  appElement: string | null;
  /** 是否有 SSR 数据（如 __NUXT__, __NEXT_DATA__ 等全局变量） */
  ssrData: boolean;
  /** 检测到的标记列表，用于调试和日志 */
  markers: string[];
}

/**
 * 水合策略接口。
 * 每种框架实现一个策略，按确定顺序匹配。
 */
export interface HydrationStrategy {
  /** 框架类型标识 */
  framework: FrameworkType;

  /** 检测是否匹配此策略 */
  matches(detection: FrameworkDetection): boolean;

  /** 生成水合脚本（HTML 字符串，注入到 </body> 前） */
  generateScript(detection: FrameworkDetection): string;

  /** 是否需要额外的资源路径重写 */
  needsPathRewrite: boolean;

  /** 路径重写规则（可选） */
  pathRewriteRules?: Array<{ from: RegExp; to: string }>;
}
```

### 统一框架检测器

```typescript
// detector.ts

/**
 * 多维度框架检测。
 *
 * 检测维度（按可靠性从高到低）：
 * 1. 全局变量（window.__NUXT__ 等）—— 最可靠
 * 2. HTML 特定标记（id="__nuxt" 等）—— 可靠
 * 3. Meta generator 标签 —— 可靠
 * 4. JS 内容扫描（框架特有代码模式）—— 中等
 * 5. 通用挂载点（id="app"）—— 低可靠，作为辅助信号
 */
export function detectFramework(
  html: string,
  jsContents?: string[]
): FrameworkDetection {
  const markers: string[] = [];
  const jsText = jsContents?.join('\n') ?? '';

  // ── 维度 1：全局变量标记 ──────────────────────────────
  if (html.includes('window.__NUXT__')) {
    markers.push('__NUXT__');
    return {
      framework: 'nuxt3',  // Nuxt 3+ 使用 __NUXT__
      confidence: 0.95,
      appElement: '#__nuxt',
      ssrData: true,
      markers,
    };
  }
  if (html.includes('window.__NEXT_DATA__')) {
    markers.push('__NEXT_DATA__');
    return {
      framework: 'nextjs',
      confidence: 0.95,
      appElement: '#__next',
      ssrData: true,
      markers,
    };
  }
  if (html.includes('window.__NUXT__') === false
      && html.includes('__NUXT__')) {
    // 注意：VitePress 可能没有 __NUXT__ 但可能有 __VP_HASH_MAP__
    markers.push('__VP_HASH_MAP__');
    // 继续检测，不要立即返回
  }

  // ── 维度 2：HTML 特定标记 ─────────────────────────────
  // 检查 id="__nuxt" 等
  const hasNuxtApp = /id=["']__nuxt["']/.test(html);
  const hasNextApp = /id=["']__next["']/.test(html);
  const hasVpApp = /id=["']VPContent["']/.test(html);  // VitePress 特有
  const hasAngularApp = /ng-version|=["']ng-app["']/.test(html);

  // ── 维度 3：Meta generator ────────────────────────────
  const metaMatch = html.match(/<meta\s+name=["']generator["'][^>]*content=["']([^"']+)["']/i);
  if (metaMatch) {
    markers.push(`generator:${metaMatch[1]}`);
    // 根据 generator 值判断框架
    const gen = metaMatch[1].toLowerCase();
    if (gen.includes('vitepress')) {
      return { framework: 'vitepress', confidence: 0.9, appElement: '#app', ssrData: false, markers };
    }
    if (gen.includes('vuepress')) {
      return { framework: 'vue3', confidence: 0.85, appElement: '#app', ssrData: false, markers };
    }
    if (gen.includes('astro')) {
      return { framework: 'astro', confidence: 0.9, appElement: null, ssrData: false, markers };
    }
  }

  // ── 维度 4：JS 内容扫描 ───────────────────────────────
  if (jsText.includes('createSSRApp') || jsText.includes('__VUE__')) {
    markers.push('__VUE__');
    return { framework: 'vue3', confidence: 0.8, appElement: '#app', ssrData: false, markers };
  }
  if (jsText.includes('hydrateRoot') || jsText.includes('__REACT_DEVTOOLS')) {
    markers.push('__REACT_DEVTOOLS');
    return { framework: 'react18', confidence: 0.7, appElement: '#root', ssrData: false, markers };
  }
  if (jsText.includes('ng.probe') || jsText.includes('platformBrowser')) {
    markers.push('angular');
    return { framework: 'angular', confidence: 0.7, appElement: null, ssrData: false, markers };
  }

  // ── 维度 5：通用挂载点（低置信度） ────────────────────
  if (hasVpApp) {
    return { framework: 'vitepress', confidence: 0.6, appElement: '#app', ssrData: false, markers };
  }
  if (hasNuxtApp) {
    return { framework: 'nuxt2', confidence: 0.5, appElement: '#__nuxt', ssrData: false, markers };
  }
  if (hasNextApp) {
    return { framework: 'nextjs', confidence: 0.5, appElement: '#__next', ssrData: false, markers };
  }

  // ── 无匹配 ────────────────────────────────────────────
  return { framework: 'unknown', confidence: 0, appElement: null, ssrData: false, markers };
}
```

### 水合策略列表（按优先级排序）

优先级使用有序列表而非数值，因为只有匹配顺序有意义，数值会导致读者误以为有可计算性。

```typescript
// strategies/index.ts

/**
 * 水合策略注册表。
 *
 * 策略按匹配优先级从高到低排列。
 * 排在前面的策略先匹配，匹配成功后不再尝试后续策略。
 *
 * 添加新策略时：
 * 1. 创建策略文件
 * 2. 在此数组中按优先级插入合适位置
 */
export const hydrationStrategies: HydrationStrategy[] = [
  // ── 第一梯队：精确匹配，高置信度 ──────────────────────
  // 这些策略通过全局变量等精确信号判断，置信度高
  nuxt3Strategy,    // 匹配: window.__NUXT__ + #__nuxt
  nextjsStrategy,   // 匹配: window.__NEXT_DATA__ + #__next
  astroStrategy,    // 匹配: <meta generator="Astro ...">

  // ── 第二梯队：中等置信度，有明确框架标记 ──────────────
  vitepressStrategy, // 匹配: <meta generator="VitePress"> 或 #VPContent
  nuxt2Strategy,     // 匹配: #__nuxt + window.$nuxt
  vue3Strategy,      // 匹配: JS 中包含 createSSRApp
  angularStrategy,   // 匹配: ng-version 属性

  // ── 第三梯队：通用框架，基于 JS 内容扫描 ──────────────
  reactStrategy,     // 匹配: JS 中包含 hydrateRoot
  svelteStrategy,    // 匹配: JS 中包含 SvelteKit 特有代码

  // ── 降级策略：无框架或无法识别，不注入任何脚本 ─────────
  staticStrategy,    // 匹配: 所有情况（始终匹配），空操作
];
```

### 水合脚本注入器

```typescript
// injector.ts

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { detectFramework, type FrameworkDetection } from './detector.js';
import { hydrationStrategies } from './strategies/index.js';
import type { SnapshotOptions } from '../types.js';

export interface HydrationInjectOptions {
  /** 输出 HTML 路径 */
  htmlPath: string;
  /** 已下载的 JS 文件内容（用于增强检测） */
  jsContents?: string[];
}

/**
 * 注入水合脚本到快照 HTML 中。
 *
 * 流程：
 * 1. 读取 HTML 文件
 * 2. 检测框架类型
 * 3. 按优先级匹配策略
 * 4. 生成对应水合脚本
 * 5. 注入到 </body> 前
 *
 * 若无匹配策略（unknown），则不注入任何脚本。
 */
export function injectHydrationScript(
  options: HydrationInjectOptions
): void {
  const { htmlPath, jsContents } = options;

  let html: string;
  try {
    html = readFileSync(htmlPath, 'utf8');
  } catch {
    return; // 文件不存在，静默跳过
  }

  // 1. 检测框架
  const detection = detectFramework(html, jsContents);

  // 2. 按优先级匹配策略
  const strategy = hydrationStrategies.find(s => s.matches(detection));
  if (!strategy || strategy.framework === 'static') {
    return; // 无匹配或降级策略，不注入
  }

  // 3. 生成并注入脚本
  const script = strategy.generateScript(detection);
  const modifiedHtml = html.replace('</body>', script + '\n</body>');

  if (modifiedHtml !== html) {
    writeFileSync(htmlPath, modifiedHtml, 'utf8');
  }
}
```

---

## 各策略实现示例

### Nuxt 2 策略

```typescript
// strategies/nuxt2.ts

export const nuxt2Strategy: HydrationStrategy = {
  framework: 'nuxt2',
  matches: (d) => d.markers.includes('__NUXT__') && d.appElement === '#__nuxt',
  needsPathRewrite: false,
  generateScript: (d) => `
<script type="text/javascript">
(function() {
  var retries = 0, maxRetries = 20, delay = 500;
  function tryHydrate() {
    var appEl = document.querySelector('#__nuxt');
    if (!appEl) return;
    if (appEl.__vue__) { console.log('[Hydration] Nuxt 2 already hydrated'); return; }
    if (window.__NUXT__ && window.$nuxt && window.$nuxt.$mount) {
      try { window.$nuxt.$mount('#__nuxt'); return; } catch (e) {}
    }
    if (++retries < maxRetries) { setTimeout(tryHydrate, delay); }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryHydrate);
  } else { setTimeout(tryHydrate, 100); }
})();
<\/script>`,
};
```

### VitePress 策略

```typescript
// strategies/vitepress.ts

export const vitepressStrategy: HydrationStrategy = {
  framework: 'vitepress',
  matches: (d) =>
    d.framework === 'vitepress' ||
    d.markers.some(m => m.includes('generator:vitepress') || m.includes('VPContent')),
  needsPathRewrite: false,
  generateScript: (d) => `
<script type="text/javascript">
(function() {
  // VitePress 使用 Vite 的 ESM 动态 import 加载，脚本已内联在 HTML 中。
  // 不需要主动触发水合——VitePress 的 JS 入口脚本会在加载完成后自动调用
  // createApp(App).mount('#app')。
  // 我们只需要确保挂载点存在，并等待 Vue 完成水合即可。
  var appEl = document.querySelector('#app');
  if (!appEl || appEl.__vue__) return;

  console.log('[Hydration] VitePress detected, waiting for auto-hydration...');
  var retries = 0;
  var check = setInterval(function() {
    if (appEl.__vue__) {
      clearInterval(check);
      console.log('[Hydration] VitePress hydration successful');
    }
    if (++retries > 30) {
      clearInterval(check);
      console.log('[Hydration] VitePress hydration timeout (non-fatal)');
    }
  }, 500);
})();
<\/script>`,
};
```

### Next.js 策略

```typescript
// strategies/nextjs.ts

export const nextjsStrategy: HydrationStrategy = {
  framework: 'nextjs',
  matches: (d) => d.markers.includes('__NEXT_DATA__'),
  needsPathRewrite: true,
  pathRewriteRules: [
    { from: /^\/_next\/static\//, to: './assets/_next/static/' },
    { from: /^\/_next\/data\//, to: './assets/_next/data/' },
  ],
  generateScript: (d) => `
<script type="text/javascript">
(function() {
  var root = document.getElementById('__next');
  if (!root || root._reactRootContainer) return;
  console.log('[Hydration] Next.js page ready, waiting for React hydration...');
  // Next.js 的自动水合由 webpack 运行时触发，不需要额外操作
  // 但需要确保 _next/static/chunks 路径被正确重写
  var retries = 0;
  var check = setInterval(function() {
    if (root._reactRootContainer) {
      clearInterval(check);
      console.log('[Hydration] Next.js hydration successful');
    }
    if (++retries > 30) {
      clearInterval(check);
      console.log('[Hydration] Next.js hydration timeout (non-fatal)');
    }
  }, 500);
})();
<\/script>`,
};
```

### 降级策略（纯静态）

```typescript
// strategies/static.ts

export const staticStrategy: HydrationStrategy = {
  framework: 'static',
  matches: () => true,      // 始终匹配，作为兜底
  needsPathRewrite: false,
  generateScript: () => '',  // 不生成任何脚本
};
```

---

## 与现有架构的集成

### CLI 层调用

```typescript
// apps/cli/src/cli.ts

import { injectHydrationScript } from '@web-clone/core/framework';

// 在 HTTP 模式和 Playwright 模式完成快照后
// 替换原来的 injectVueHydrationForCli 调用
const jsContents = result.assets
  .filter(a => a.type === 'js' && a.status === 'fetched' && a.textContent)
  .map(a => a.textContent!);

const htmlPath = options.mode === 'bundle'
  ? join(options.output, 'index.html')
  : options.output;

injectHydrationScript({
  htmlPath,
  jsContents,  // 传入 JS 内容增强检测
});
```

### Playwright 适配器集成

```typescript
// packages/adapter-playwright/src/adapter.ts

// 在 fetchWithPage 中，使用框架检测结果优化等待策略
const detection = detectFramework(html);
await waitForSpaHydration(this.page, {
  timeout: options.timeout ?? 30000,
  detection,  // 传入检测结果，让等待策略更精确
});
```

### 路径修复集成

```typescript
// packages/core/src/output/path-fixer.ts

// 复用 detector.ts 的检测结果
import { detectFramework } from '../framework/detector.js';

export function fixPathsForFileProtocol(document: Document, html: string): void {
  const detection = detectFramework(html);
  const framework = detection.framework;

  // 框架特定的路径修复
  if (framework === 'nuxt2' || framework === 'nuxt3') {
    fixNuxtConfig(document);
  } else if (framework === 'nextjs') {
    fixNextjsConfig(document, detection);
  }
}
```

---

## 关于优先级取值方式的说明

### 为什么不用数值，而用有序列表？

**问题**：之前在策略接口中设计了 `priority: number` 字段，这是一个设计缺陷。

| 方案 | 问题 |
|------|------|
| `priority: 100` / `priority: 80` | 读者会问"为什么是 100 不是 99？两个策略之间差 20 意味着什么？"—— 实际上没有任何数学意义 |
| `priority: 1` / `priority: 2` | 数值本身暗示了可计算性（相加、相减、比值），但实际只用于排序 |
| 有序列表 | 语义明确："排在前面的先匹配"。不需要解释"为什么是 100" |

**决策**：使用有序列表 `HydrationStrategy[]` 表示优先级，策略按匹配优先级从高到低排列。`injector.ts` 中 `find()` 方法天然按数组顺序匹配，第一个匹配的即最高优先级。

```typescript
// 正确：按优先级排序的数组
const strategies = [nuxt3Strategy, nextjsStrategy, vue3Strategy, staticStrategy];

// 错误：使用数值优先级
interface HydrationStrategy { priority: number; /* 100 还是 99？为什么？ */ }
```

---

## 涉及文件变更清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `packages/core/src/framework/types.ts` | **新增** | 框架类型、HydrationStrategy 接口 |
| `packages/core/src/framework/detector.ts` | **新增** | 统一框架检测器 |
| `packages/core/src/framework/injector.ts` | **新增** | 水合脚本注入器 |
| `packages/core/src/framework/strategies/index.ts` | **新增** | 策略注册表（按优先级排序） |
| `packages/core/src/framework/strategies/nuxt2.ts` | **新增** | Nuxt 2 策略 |
| `packages/core/src/framework/strategies/nuxt3.ts` | **新增** | Nuxt 3 策略 |
| `packages/core/src/framework/strategies/vue3.ts` | **新增** | Vue 3 / VitePress 策略 |
| `packages/core/src/framework/strategies/nextjs.ts` | **新增** | Next.js 策略 |
| `packages/core/src/framework/strategies/react.ts` | **新增** | React 通用策略 |
| `packages/core/src/framework/strategies/angular.ts` | **新增** | Angular 策略 |
| `packages/core/src/framework/strategies/svelte.ts` | **新增** | SvelteKit 策略 |
| `packages/core/src/framework/strategies/astro.ts` | **新增** | Astro 策略 |
| `packages/core/src/framework/strategies/static.ts` | **新增** | 降级策略（空操作） |
| `packages/core/src/framework/index.ts` | **新增** | 导出入口 |
| `packages/core/src/index.ts` | **修改** | 导出 framework 模块 |
| `packages/core/src/config/defaults.ts` | **修改** | `scanDepth` 默认值改为 1 |
| `packages/core/src/assembler.ts` | **修改** | 移除 `?? 1` 回退，对齐 defaults |
| `packages/core/src/output/path-fixer.ts` | **修改** | 复用 `detectFramework` 检测结果 |
| `packages/core/src/discovery/recursive-scanner.ts` | **修改** | 增强 Vite chunk 检测 |
| `apps/cli/src/hydration.ts` | **删除** | 被 `injectHydrationScript` 替代 |
| `apps/cli/src/cli.ts` | **修改** | 替换 `injectVueHydrationForCli` 调用 |
| `apps/cli/src/__tests__/cli-hydration.test.ts` | **修改** | 适配新注入接口 |

---

## 实施步骤

### Phase 1：基础设施（建议 1 天）

1. 创建 `packages/core/src/framework/types.ts` —— 定义 `FrameworkType`、`FrameworkDetection`、`HydrationStrategy`
2. 创建 `packages/core/src/framework/detector.ts` —— 实现 `detectFramework`
3. 创建 `packages/core/src/framework/injector.ts` —— 实现 `injectHydrationScript`
4. 创建 `packages/core/src/framework/index.ts` —— 导出入口
5. 更新 `packages/core/src/index.ts` —— 导出 framework 模块

### Phase 2：策略实现（建议 2 天）

1. 创建 `strategies/static.ts` —— 降级策略
2. 创建 `strategies/nuxt2.ts` —— 将现有 `injectVueHydrationForCli` 逻辑迁移
3. 创建 `strategies/vitepress.ts` —— 新增 VitePress 策略
4. 创建 `strategies/nextjs.ts` —— 新增 Next.js 策略
5. 创建 `strategies/index.ts` —— 注册表，按优先级排序
6. 其他策略可按需逐步添加

### Phase 3：集成与替换（建议 1 天）

1. 修改 `apps/cli/src/cli.ts` —— 替换 `injectVueHydrationForCli` 为 `injectHydrationScript`
2. 删除 `apps/cli/src/hydration.ts`
3. 修改 `packages/core/src/output/path-fixer.ts` —— 复用 `detectFramework`
4. 修改 `packages/core/src/config/defaults.ts` —— `scanDepth` 改为 1
5. 修改 `packages/core/src/assembler.ts` —— 对齐 `scanDepth` 默认值
6. 更新测试

### Phase 4：测试与验证（建议 1 天）

1. 为每个策略编写单元测试
2. 更新 CLI 水合测试
3. 端到端验证各框架页面

---

## 后续扩展

### 新增框架支持

添加新框架只需要：

1. 在 `types.ts` 的 `FrameworkType` 中添加枚举值
2. 在 `detector.ts` 中添加检测逻辑
3. 创建 `strategies/xxx.ts` 实现 `HydrationStrategy`
4. 在 `strategies/index.ts` 中按优先级插入

**无需修改** `injector.ts`、`cli.ts` 或任何核心逻辑。

### 可能的新策略

- **Gatsby**: `window.__GATSBY` 全局变量
- **Remix**: `<meta name="remix:..." />` 标记
- **Nuxt 2 (classic)**: `window.__NUXT__` 但无 `#__nuxt`
- **Eleventy**: 纯静态 SSG，归入 `static`
# E2E 测试实现与验证问题报告

> 生成日期：2026-07-28
> 范围：E2E 测试实施过程中发现的问题与改进建议

---

## 一、已修复的问题

### 1.1 SvelteKit 内联脚本 import 使用绝对路径

**严重程度**：高
**文件**：`tests/e2e/build-fixtures.ts`
**状态**：已修复

**问题描述**：
SvelteKit 的 static adapter 构建产物在 `index.html` 的内联 `<script>` 中生成 `import("/_app/immutable/entry/start.xxx.js")` 形式的动态导入，路径以 `/` 开头。原有路径修复逻辑只处理 HTML 属性 `src`/`href`，遗漏了内联 JavaScript 中的 `import()` 调用。

**影响**：
E2E fixture server 使用 `/fixtureName/` 前缀提供文件，绝对路径的 `/_app/...` 会请求到服务器根目录而非 `/sveltekit-ssr/_app/...`，导致模块加载 404 失败，SPA 水合无法完成。

**修复方式**：
在 `build-fixtures.ts` 的后处理步骤中新增对内联脚本 `import("/_app/...")` 和 `import("/_next/...")` 的路径替换，改写为 `import("./_app/...")`。

**相关 commit**：(待提交)

### 1.2 Single-file 模式 E2E 测试缺失

**严重程度**：中
**文件**：`tests/e2e/spa-crawl-e2e.test.ts`
**状态**：已修复

**问题描述**：
原有 E2E 测试仅覆盖 `mode: 'bundle'` 模式。`mode: 'single'`（内联所有资源到单文件）是 CLI 的核心功能之一，但完全没有 E2E 验证。

**影响**：
single-file 模式的资源内联逻辑（CSS 内联、JS 内联、data: URI 生成）无法通过 E2E 验证，可能因管线变更而引入回归。

**修复方式**：
- 在 `assertion-utils.ts` 中新增 `assertSingleFileMode()` 断言：验证输出无 `assets/` 目录、HTML 中存在内联 `<style>` 或 data: URI
- 在 `spa-crawl-e2e.test.ts` 中新增 `crawlFixtureSingle()` 辅助函数和 2 个 SSR 框架（Nuxt 3、Next.js）的 single-file 测试组

### 1.3 E2E 回归基准缺失

**严重程度**：中
**文件**：`tests/e2e/baseline/`
**状态**：已修复

**问题描述**：
缺少 E2E 回归基准数据。没有基准就无法自动检测管线变更是否引入回归（如框架检测置信度下降、资源下载数减少、耗时增加等）。

**修复方式**：
- 创建 `tests/e2e/baseline/` 目录和说明文档
- 创建 `scripts/e2e-regression-check.sh` 回归检测脚本（检查：成功率、检测准确率、置信度下降、资源丢失、耗时回归）

---

## 二、待处理的问题

### 2.1 Chromium 浏览器下载缓慢

**严重程度**：高
**文件**：CI 环境
**状态**：待处理

**问题描述**：
Playwright Chromium（167MB）从 `cdn.playwright.dev` 下载速度约为 30-50 KB/s，安装耗时超过 10 分钟。当前环境在 300 秒内仅下载到 20%。

**影响**：
E2E 测试在 CI 中首次安装浏览器耗时会超过合理的 CI 时间预算，可能导致 CI 超时失败。

**建议方案**：
1. **预装 Chromium**：在 CI 镜像中预装 Playwright Chromium，CI 启动时跳过下载步骤
2. **使用系统级 Chromium**：通过 `apt` 安装 `chromium-browser`，Playwright 通过 `channel: 'chromium'` 使用系统浏览器
3. **缓存浏览器**：在 CI 缓存层中保存 `/root/.cache/ms-playwright/` 目录
4. **使用国内镜像**：设置 `PLAYWRIGHT_DOWNLOAD_HOST=https://npmmirror.com/mirrors/playwright/` 环境变量加速下载

### 2.2 Nuxt 3 fixture 的 buildAssetsDir 为绝对路径

**严重程度**：低
**文件**：`tests/e2e/builds/nuxt3-ssr/index.html`
**状态**：待处理

**问题描述**：
Nuxt 3 构建产物的 `__NUXT__` payload 中 `config.app.buildAssetsDir` 仍为绝对值 `'/_nuxt/'`。

```json
config: {
  public: {},
  app: { baseURL: './', buildAssetsDir: '/_nuxt/', cdnURL: '' }
}
```

Nuxt 3 运行时的 module loading 代码会读取 `buildAssetsDir` 来构造资源 URL。虽然 E2E fixture server 的路径映射依赖 HTTP 响应，此配置值主要影响客户端 hydration 阶段 Nuxt 内部的资源路径拼接。

**影响**：
在 bundle 或 single-file 模式中，`buildAssetsDir` 值已经被写入 HTML 且无法被 `build-fixtures.ts` 的路径修复脚本处理。如果 Nuxt 3 在 hydration 阶段动态加载额外 chunk，会基于此绝对路径构造 URL，可能导致 404。

**建议方案**：
在 `build-fixtures.ts` 后处理步骤中也修复 `buildAssetsDir` 值：

```javascript
html = html.replace(
  /buildAssetsDir:\s*['"]\/(_nuxt\/)/g,
  "buildAssetsDir: './$1"
);
```

### 2.3 Vue 3 SPA fixture 依赖完整浏览器渲染

**严重程度**：低
**文件**：`tests/e2e/builds/vue3-spa/index.html`
**状态**：已知，暂不修复

**问题描述**：
Vue 3 SPA fixture 的 `index.html` 仅 318 字节，包含 `<div id="app"></div>` 骨架。所有页面内容由 Vue 运行时 `createApp().mount('#app')` 动态生成。这与真实 SPA 场景一致，但对 E2E 测试的影响是：

1. 如果 Playwright `page.goto()` 后的 JS 执行不完整（网络问题、超时），`page.content()` 返回的是空骨架
2. `assertContentCaptured` 断言完全依赖 `waitForSpaHydration()` 正确等待 Vue 应用初始化

**影响**：
Vue 3 SPA 是 E2E 测试中最易受环境波动影响的 fixture。任何影响 JS 执行的因素（浏览器版本、网络延迟、CDN 不可用）都可能导致此 fixture 的 `assertContentCaptured` 失败。

**建议方案**：
1. 保持现状（作为 SPA hydration 能力的"金丝雀"测试）
2. 可选：将 Vue 3 SPA 的超时从 60s 提高到 90s，降低环境波动导致的误报率

### 2.4 路径修复正则表达式覆盖不完整

**严重程度**：中
**文件**：`tests/e2e/build-fixtures.ts`
**状态**：待处理

**问题描述**：
当前路径修复正则只匹配 `_app/` 和 `_next/` 前缀：

```typescript
html = html.replace(/(import\s*\(\s*["'])\/(_app\/)/g, '$1./$2');
html = html.replace(/(import\s*\(\s*["'])\/(_next\/)/g, '$1./$2');
```

这种方法存在两个局限：
1. **框架耦合**：添加新框架（如 Gatsby、Astro、Remix）时需要手动新增正则
2. **前缀遗漏**：Nuxt 3 的 `_nuxt/`、Angular 的 chunk 加载路径、自定义构建前缀无法自动覆盖

**影响**：
新增框架 fixture 时，如果未手动补充正则表达式，绝对路径问题可能被漏掉，导致该 fixture 在 E2E 服务器上 404。

**建议方案**：
采用通用绝对路径替换策略：匹配所有 `src|href|import|fetch` 中引用的绝对路径（以 `/` 开头且后跟目录名），统一改写为相对路径：

```typescript
// 通用方案：匹配任意以 / 开头的局部路径引用
html = html.replace(
  /((?:import|fetch)\s*\(\s*["'])\/([a-zA-Z][a-zA-Z0-9_-]*\/)/g,
  '$1./$2'
);
html = html.replace(
  /((?:src|href)=["'])\/([a-zA-Z][a-zA-Z0-9_-]*\/)/g,
  '$1./$2'
);
```

### 2.5 运行 E2E 测试前需要先构建项目

**严重程度**：低
**文件**：`package.json`
**状态**：待处理

**问题描述**：
`pnpm test:e2e` 直接运行 vitest，不检查项目是否已构建。如果 `@web-clone/core` 和 `@web-clone/adapter-playwright` 的 `dist/` 不存在或过期，E2E 测试会因模块找不到而直接失败。

**影响**：
首次克隆仓库或在 `pnpm clean` 后直接运行 `pnpm test:e2e` 会报错。

**建议方案**：
在 `package.json` 添加 `test:e2e:all` 脚本：

```json
"test:e2e:all": "pnpm build && pnpm test:e2e"
```

### 2.6 缺少 CSS @import 递归发现的 E2E 测试

**严重程度**：低
**文件**：待添加
**状态**：待处理

**问题描述**：
Web Clone 管线的阶段 3（CSS @import 递归发现）完全没有 E2E 验证。当前 fixture 的 CSS 文件不含 `@import url("...")` 引用。`@import` 递归解析是复杂页面（如 Bootstrap + 自定义主题组合）的常见场景。

**影响**：
CSS 解析器（`packages/core/src/css-parser.ts`）中的 `@import` 递归逻辑仅在单元测试中覆盖。如果解析器变更引入 bug，E2E 测试不会捕获。

**建议方案**：
在现有 fixture（推荐 `nuxt3-ssr` 或 `nextjs-ssr`，因为它们的 CSS 文件更大）中添加一个含 `@import url("nested.css")` 的测试样式表，并添加断言验证被引用文件的内联。

### 2.7 缺少 ResourceFilter 的 E2E 测试

**严重程度**：低
**文件**：待添加
**状态**：待处理

**问题描述**：
资源过滤器（`ResourceFilter`，`packages/core/src/resource-filter.ts`）用于跳过不需要的扩展名（`.map`、`.ts` 等）。当前 E2E 测试未覆盖自定义 `skipExtensions` 和 `includeExtensions` 场景。

**影响**：
如果 ResourceFilter 逻辑变更导致正确资源被误过滤，E2E 测试不会报警。

**建议方案**：
添加专门的过滤测试 fixture（或对现有 fixture 使用自定义 `snapshotOptions`，指定 `skipExtensions: ['.js']`），然后断言 JS 文件未被下载而 CSS 文件正常下载。

### 2.8 缺少 scanDepth > 1 的递归扫描 E2E 测试

**严重程度**：低
**文件**：待添加
**状态**：待处理

**问题描述**：
递归扫描功能（`scanDepth` 参数，`packages/core/src/recursive-scanner.ts`）在 `scanDepth > 1` 时会从 JS/CSS/JSON 中提取 URL 并执行额外轮次的下载。此功能完全没有 E2E 测试。

**影响**：
递归扫描是复杂单页应用的关键功能，如果没有 E2E 验证，实现变更可能引入未被检测的 bug。

**建议方案**：
创建包含嵌套资源引用的 fixture（如在 JS 文件中嵌入 JSON 数据 URL），设置 `scanDepth: 2` 进行测试。

---

## 三、Fixture 构建产物的质量分析

### 3.1 各 fixture HTML 大小

| Fixture | index.html 大小 | 内容类型 |
|---------|----------------|---------|
| vue3-spa | 318 B | 纯骨架（依赖 JS 渲染） |
| react18-spa | ~400 B | 纯骨架（依赖 JS 渲染） |
| angular-spa | 475 B | 纯骨架（依赖 JS 渲染） |
| sveltekit-ssr | 1,277 B | SSR + hydration 内联脚本 |
| nextjs-ssr | 5,782 B | SSR 完整内容 + CSS-in-JS |
| nuxt3-ssr | 3,613 B | SSR 完整内容 + __NUXT__ payload |

**分析**：SPA 框架（Vue/React/Angular）的 fixture HTML 极小，只有骨架。它们的 `assertContentCaptured` 完全依赖 Playwright 的 JS 执行能力。SSR 框架（SvelteKit/Next.js/Nuxt）的 HTML 包含预渲染内容，部分验证不依赖 JS 执行。

### 3.2 各 fixture 资源文件分析

| Fixture | JS 文件数 | CSS 文件数 | 图片/字体 | 总大小 |
|---------|----------|----------|----------|--------|
| vue3-spa | 1 (assets/) | 0 | 0 | ~5 KB |
| react18-spa | 1 | 0 | 0 | ~8 KB |
| angular-spa | 4 (含 polyfills) | 0 | 0 | ~170 KB |
| sveltekit-ssr | 15 (含 chunks) | 1 | 0 | ~110 KB |
| nextjs-ssr | 7 (含 framework chunks) | 0 (CSS-in-JS) | 0 | ~300 KB |
| nuxt3-ssr | 5 | 1 | 3 SVG | ~200 KB |

**分析**：Angular-SPA 的 `main.6a572794a0c54647.js` 达到 119KB，可能包含 Angular 框架代码。Nuxt 3 SSR 是唯一包含图片资源（SVG）的 fixture，使其成为验证子资源下载能力的较好选择。

---

## 四、代码层面的潜在问题

### 4.1 `spider-runner.ts` 中 `extractBrowserFramework` 的 markers 字段简化过度

**严重程度**：低
**文件**：`tests/e2e/helpers/spider-runner.ts:91`
**状态**：待处理

**问题描述**：
`extractBrowserFramework()` 将 markers 设置为 `[result.browserFramework.framework]`，即只包含框架名。但 `waitForSpaHydration()` 检测到的实际 markers 可能包含多个信号（如 `__VUE__`, `__vue_app__`, `#app` 等）。

```typescript
// 当前代码
markers: [result.browserFramework.framework],  // e.g., ['vue3']

// 期望值（如果 result.browserFramework.markers 存在）
markers: result.browserFramework.markers || [result.browserFramework.framework],  // e.g., ['__VUE__', '__vue_app__']
```

**影响**：
不影响测试通过率，但 `results.json` 中的 markers 信息不够完整，不利于问题诊断。

**建议方案**：
如果 `SnapshotResult.browserFramework` 包含 `markers` 字段，直接使用；否则保持现有回退逻辑。

### 4.2 `assertion-utils.ts` 中 `assertContentCaptured` 的阈值可能过严

**严重程度**：低
**文件**：`tests/e2e/helpers/assertion-utils.ts:46-63`
**状态**：已知，暂不修改

**问题描述**：
`assertContentCaptured` 要求文本内容 >= 100 字符且 >= 3 个 HTML 闭合标签。对于极简页面（如简单的"Hello World" demo），这些阈值可能过高。但对于当前 6 个 fixture 的内容量，阈值是合理的。

**建议方案**：
保持现状。如果未来添加了更简化的 fixture，可以考虑将阈值设为可配置参数。

---

## 五、总体评价

| 维度 | 评分 | 说明 |
|------|------|------|
| 测试覆盖率 | 7/13 管线阶段 | 核心路径已覆盖，边缘路径待补充 |
| Fixture 质量 | 良好 | 6 个框架覆盖三类渲染模式（CSR/SSR/水合） |
| 回归基础设施 | 已添加 | baseline 机制 + 自动化检测脚本 |
| 构建可靠性 | 良好 | 路径修复已改进，但正则覆盖需完善 |
| CI 就绪度 | 部分 | Chromium 下载耗时是主要阻塞项 |

**下一步建议**：
1. 解决 Chromium 下载问题，打通 CI 流水线
2. 补上 `buildAssetsDir` 修复
3. 首次全量测试通过后将 `outputs/results.json` 保存为 baseline
4. 逐步添加 CSS @import、ResourceFilter、scanDepth 的专项测试

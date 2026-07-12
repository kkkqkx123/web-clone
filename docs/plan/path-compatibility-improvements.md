# Web-Clone 路径兼容性改进设计方案

## 概述

保持 bundle 模式作为默认，但通过增强路径修复逻辑，使快照在 `file://` 协议下完全可用。目标是支持更多框架，处理更复杂的路径场景，同时不改变架构。

---

## Phase 1：框架配置对象统一处理

### 问题分析

当前实现只处理 Nuxt。其他框架（React/Vue/Angular）也可能在 HTML 中嵌入配置对象：

```javascript
// Nuxt
window.__NUXT__ = { config: { _app: { assetsPath: "/_nuxt/" } } }

// React/Vite
window.__VITE_MANIFEST__ = { "/src/main.jsx": { file: "/_app.js" } }

// Angular
window.ng.probe(document.body).injector.get('$rootScope')

// Custom apps
window.__APP_CONFIG__ = { apiBase: "/_api/v1" }
```

### 设计方案

#### 1.1 通用配置扫描器
```typescript
// src/core/framework-config-scanner.ts
interface FrameworkConfig {
  framework: 'nuxt' | 'vue' | 'react' | 'angular' | 'vite' | 'webpack' | 'unknown';
  configObjects: Array<{
    objectPath: string;        // 'window.__NUXT__'
    configText: string;        // 原始文本
    absolutePaths: Array<{
      path: string;            // '/_nuxt/'
      context: string;         // 'assetsPath' 字段名
    }>;
  }>;
}

export function scanFrameworkConfigs(document: Document): FrameworkConfig[];
```

#### 1.2 框架检测与映射
```typescript
const FRAMEWORK_CONFIG_PATTERNS: Record<string, RegExp[]> = {
  nuxt: [
    /window\.__NUXT__\s*=/,
    /assetsPath\s*:\s*["']\/[^"']*["']/,
  ],
  vue: [
    /window\.__VUE__\s*=/,
    /__ASSETS_PATH__\s*[:=]\s*["']\/[^"']*["']/,
  ],
  react: [
    /window\.__REACT_/,
    /__VITE_MANIFEST__/,
    /publicPath\s*[:=]\s*["']\/[^"']*["']/,
  ],
  angular: [
    /ng\.bootstrap|ng-app/,
    /ng-config\s*=\s*["'][^"']*["']/,
  ],
};

const ABSOLUTE_PATH_PATTERNS: Record<string, RegExp> = {
  assetsPath: /assetsPath\s*:\s*["'](\/[^"']*\/?)["']/g,
  publicPath: /publicPath\s*:\s*["'](\/[^"']*\/?)["']/g,
  basePath: /basePath\s*:\s*["'](\/[^"']*\/?)["']/g,
  cdnURL: /cdnURL\s*:\s*["'](\/[^"']*\/?)["']/g,
  apiBase: /apiBase\s*:\s*["'](\/[^"']*\/?)["']/g,
  __dirname: /__dirname\s*:\s*["'](\/[^"']*\/?)["']/g,
};
```

#### 1.3 改进的修复函数
```typescript
export function fixFrameworkConfigs(document: Document, html: string): void {
  const configs = scanFrameworkConfigs(document);
  
  for (const config of configs) {
    for (const obj of config.configObjects) {
      let fixed = obj.configText;
      
      for (const [fieldName, pattern] of Object.entries(ABSOLUTE_PATH_PATTERNS)) {
        fixed = fixed.replace(pattern, (match, path) => {
          const relative = absoluteToRelative(path, 'assets');
          return match.replace(path, relative);
        });
      }
      
      if (fixed !== obj.configText) {
        // 在 document 中找到对应脚本并更新
        updateScriptContent(document, obj.objectPath, fixed);
      }
    }
  }
}
```

---

## Phase 2：内联 CSS 中的 URL 引用处理

### 问题分析

```html
<style>
  .bg { background: url('/_nuxt/bg.jpg'); }
  .icon { background: url('/assets/icon.svg'); }
  @import url('/_css/style.css');
</style>
```

这些 URL 在快照中仍是绝对路径，需要转换。

### 设计方案

#### 2.1 CSS 解析器增强
```typescript
// src/core/css-url-fixer.ts

/**
 * 提取 CSS 中的所有 URL 引用
 */
function extractCssUrls(cssText: string): Array<{
  url: string;
  type: 'url()' | '@import' | 'srcset';
  context: string; // 完整的匹配文本，用于替换
}>;

/**
 * 修复 CSS 中的绝对路径
 */
export function fixCssUrls(cssText: string): string {
  const urls = extractCssUrls(cssText);
  let fixed = cssText;
  
  for (const { url, context } of urls) {
    if (isAbsolutePath(url) && !url.includes('://')) {
      const relative = absoluteToRelative(url, 'assets');
      fixed = fixed.replace(context, context.replace(url, relative));
    }
  }
  
  return fixed;
}
```

#### 2.2 集成到路径修复流程
```typescript
// 在 fixPathsForFileProtocol 中添加
export function fixPathsForFileProtocol(document: Document, html: string): void {
  // ... 现有逻辑 ...
  
  // 修复内联 CSS 中的 URL
  const styles = Array.from(document.querySelectorAll('style'));
  for (const style of styles) {
    const text = style.textContent || '';
    const fixed = fixCssUrls(text);
    if (fixed !== text) {
      style.textContent = fixed;
    }
  }
  
  // 修复 style 属性中的 URL
  const elementsWithStyle = Array.from(document.querySelectorAll('[style]'));
  for (const el of elementsWithStyle) {
    const style = el.getAttribute('style') || '';
    const fixed = fixCssUrls(style);
    if (fixed !== style) {
      el.setAttribute('style', fixed);
    }
  }
}
```

---

## Phase 3：内联 JavaScript 路径处理（高阶）

### 问题分析

在 JavaScript 代码中识别和修改路径字符串极具风险：

```javascript
// ❌ 不应该修改（服务器特定 API）
fetch('/_api/data')

// ⚠️ 可能需要修改（资源引用）
const iconUrl = '/_assets/icon.svg'
import('/_app/chunk.js')

// ✅ 明确需要修改（框架配置）
const config = { assetsPath: '/_nuxt/' }
```

### 设计方案

#### 3.1 保守的启发式方法

**不修改的模式**：
```javascript
// API 调用
fetch('/_api/...')
axios.get('/_api/...')
$.ajax('/_api/...')

// 服务端路由
window.location = '/_auth/login'
href="/_profile"

// 数据 URL
src="data:..."
```

**可修改的模式**：
```javascript
// 明确的资源引用
url: '/_assets/...'      // assets/images/js 等
src: '/_images/...'

// 文件导入
import('/_modules/...')
require('/_modules/...')

// 资源映射表
'/_app.js': '/dist/_app-xyz.js'  // Webpack manifest
```

#### 3.2 实现方案（第二阶段）
```typescript
// src/core/js-path-fixer.ts

const SAFE_PATTERNS = [
  // 资源相关
  /['"]url['"]\s*:\s*['"]\/(?:assets|images|js|css|media|fonts)\//,
  /['"]src['"]\s*:\s*['"]\/(?:assets|images|js|css|media|fonts)\//,
  /import\s*\(\s*['"]\/(?:modules|chunks|components)\//,
  /require\s*\(\s*['"]\/(?:modules|chunks|components)\//,
];

const UNSAFE_PATTERNS = [
  // API 调用
  /['"]\/api\//,
  /['"]\/auth\//,
  
  // 路由导航
  /window\.location\s*=\s*['"]\/\w+\//,
  /href\s*=\s*['"]\/\w+\//,
];

export function fixJavaScriptPaths(
  jsText: string,
  onlyInFrameworkConfig: boolean = true
): string {
  if (onlyInFrameworkConfig) {
    // 仅修复框架配置中的路径 - 最安全
    return fixInFrameworkConfigOnly(jsText);
  }
  
  // 启发式修复（需要用户明确选择）
  return fixWithHeuristics(jsText);
}
```

---

## Phase 4：Nuxt 特定优化

### 问题分析

当前实现已处理 `assetsPath`，但 Nuxt 还有其他需要处理的配置：

```javascript
config: {
  _app: {
    basePath: "/",           // ← 需要检查
    assetsPath: "/_nuxt/",   // ✅ 已处理
    cdnURL: "https://cdn.example.com",  // ← 可能需要处理
  },
  public: {
    apiBaseUrl: "/api",      // ← 需要转换
  }
}
```

### 设计方案

#### 4.1 扩展 Nuxt 修复
```typescript
export function fixNuxtConfigComprehensive(document: Document): void {
  const scripts = Array.from(document.querySelectorAll('script'));

  for (const script of scripts) {
    const content = script.textContent || '';
    if (!content.includes('window.__NUXT__')) continue;

    let fixed = content;

    // 1. 处理 assetsPath
    fixed = fixed.replace(
      /assetsPath:"\\u002F_nuxt\\u002F"/g,
      'assetsPath:".\\u002Fassets\\u002Fjs\\u002F_nuxt\\u002F"'
    );

    // 2. 处理 basePath - 仅在非 "/" 时转换
    // basePath 在 "/" 时应保持为 "/"，表示应用根目录
    // 在 "/app/" 等其他值时应转换

    // 3. 处理 cdnURL - 仅在使用相对路径时转换
    // 如果是完整 URL（https://...），保持不变
    // 如果是路径（/_cdn/），转换为相对路径

    // 4. 处理 public.apiBaseUrl - 仅转换资源相关路径
    // 保留 /api 等业务路由

    if (fixed !== content) {
      script.textContent = fixed;
    }
  }
}
```

#### 4.2 配置字段白名单
```typescript
const NUXT_SAFE_FIELDS = [
  'assetsPath',      // ✅ 资源路径
  'publicPath',      // ✅ 资源根路径
  'baseURL',         // ⚠️ 需要检查是否为资源
];

const NUXT_UNSAFE_FIELDS = [
  'apiBase',         // ❌ API 端点
  'authRoute',       // ❌ 认证路由
];
```

---

## Phase 5：修复日志与诊断

### 设计方案

#### 5.1 修复记录
```typescript
interface PathFixReport {
  framework: string;
  fixedCount: number;
  fixes: Array<{
    type: 'nuxt-config' | 'script-src' | 'link-href' | 'css-url' | 'js-path';
    original: string;
    fixed: string;
    location: string; // 在 HTML 中的位置描述
  }>;
  skipped: Array<{
    reason: string;
    pattern: string;
  }>;
}

export function getPathFixReport(): PathFixReport;
```

#### 5.2 输出报告
```bash
# 修复完成后输出
✓ Path compatibility fixes applied:
  • Nuxt assetsPath: /_nuxt/ → ./assets/js/_nuxt/ (1 fix)
  • Script src paths: 4 fixes
  • Link href paths: 2 fixes
  • CSS url() references: 8 fixes
  • Skipped: 3 API paths (safe, left unchanged)
```

---

## 实现路线图

### Week 1-2: Phase 1 + Phase 2
- 实现通用框架配置扫描器
- 支持 Nuxt/Vue/React/Angular 基础配置对象
- 实现内联 CSS URL 替换

### Week 3: Phase 4
- 完善 Nuxt 配置处理（cdnURL、basePath）
- 测试复杂场景

### Week 4: Phase 5 + Phase 3（可选）
- 实现修复报告与诊断
- 如果用户需求，考虑启发式 JS 路径修复（需显式标志）

---

## 风险评估

### 低风险 ✅
- Framework 配置对象修复（结构化数据）
- CSS 中的 URL 替换（简单字符串替换）

### 中风险 ⚠️
- 多 Nuxt 配置字段处理（需了解 Nuxt 的各字段含义）
- 跨框架配置检测（可能有遗漏）

### 高风险 ❌
- JavaScript 代码中的路径修改（容易误伤）
- 需要显式用户授权或仅在框架配置中应用

---

## 质量保证

### 测试覆盖
```bash
# 测试应用列表
- Nuxt 3 应用（assetsPath、cdnURL、basePath）
- Vue 3 + Vite 应用
- React 应用（Webpack/Vite）
- Angular 应用
- 纯 HTML/JS 应用
```

### 验证清单
- [ ] 快照在 file:// 协议下完整加载
- [ ] 下拉菜单、模态框等交互功能恢复
- [ ] 控制台无 404/跨域错误
- [ ] 生成的快照大小无显著增加
- [ ] 修复不影响 bundle 模式的资源分解

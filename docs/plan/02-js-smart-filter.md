# 02 — JS 智能预过滤

## 问题

`js-analyzer.ts` 调用 `@babel/parser` 解析完整的 JS 文本。对于 SPA 页面，JS Bundle 通常很大：

- **ModelScope（UmiJS）**：`umi.js` 约 9.9MB
- Babel 解析 10MB 的 JS 需要大量内存和时间
- 大部分代码是框架运行时（React、Umi 等），与组件提取无关
- 在 `assembler.ts` 中，`extractJsFromAssets` 将所有下载的 JS 合并为一个字符串，可能包含多个 Bundle

## 方案

### 1. 智能预过滤 — 仅提取用户态代码

在将 JS 传入 Babel 解析前，先进行快速预过滤，剔除框架/库代码：

```typescript
// 框架/库文件的特征路径模式
const FRAMEWORK_PATTERNS = [
    /\/node_modules\//,
    /\/react(\.[a-z]+)?\.js$/,
    /\/vue(\.[a-z]+)?\.js$/,
    /\/angular(\.[a-z]+)?\.js$/,
    /\/jquery(\.[a-z]+)?\.js$/,
    /\/umi(\.[a-z]+)?\.js$/,
    /\/lodash(\.[a-z]+)?\.js$/,
    /\/moment(\.[a-z]+)?\.js$/,
    /\/antd(\.[a-z]+)?\.js$/,
    /\/babel(\.[a-z]+)?\.js$/,
    /\/webpack(\.[a-z]+)?\.js$/,
    /\.min\.js$/,
];

// 来源 URL 过滤
function isFrameworkCode(originUrl: string): boolean {
    return FRAMEWORK_PATTERNS.some(pattern => pattern.test(originUrl));
}

// 在 assembler.ts 中，下载 JS 时标注来源
function extractJsFromAssets(assets: any[]): string {
    const userCode = assets.filter(a =>
        a.type === 'js' &&
        a.status === 'fetched' &&
        !isFrameworkCode(a.originUrl)  // 过滤框架代码
    );
    const frameworkCode = assets.filter(a =>
        a.type === 'js' &&
        a.status === 'fetched' &&
        isFrameworkCode(a.originUrl)
    );

    // 输出过滤统计
    if (frameworkCode.length > 0) {
        const userSize = userCode.reduce((s, a) => s + a.size, 0);
        const fwSize = frameworkCode.reduce((s, a) => s + a.size, 0);
        console.log(`  JS filter: ${userCode.length} user files (${fmt(userSize)}) + ${frameworkCode.length} framework files (${fmt(fwSize)}) filtered`);
    }

    return userCode.map(a => a.textContent || '').filter(Boolean).join('\n');
}
```

### 2. 截断式解析（Truncated Parsing）

对大文件，仅解析前 N 个语句：

```typescript
function analyzeJavaScript(js: string, options?: any): JsAnalysisResult {
    if (!js.trim()) return result;

    // 对大文件截断
    const MAX_JS_LENGTH = 500 * 1024; // 500KB
    let jsToParse = js;
    if (js.length > MAX_JS_LENGTH) {
        jsToParse = js.slice(0, MAX_JS_LENGTH);
        console.warn(`⚠ JS truncated: ${fmt(js.length)} → ${fmt(MAX_JS_LENGTH)}`);
    }

    // 现有 Babel 解析逻辑...
}
```

### 3. 快速扫描模式 — 基于正则的轻量分析

在完整 Babel 解析之前，先用正则快速扫描提取关键信息：

```typescript
function quickScanJs(js: string): { state: string[]; handlers: string[] } {
    const state: string[] = [];
    const handlers: string[] = [];

    // 快速扫描变量声明
    const statePattern = /\b(var|let|const)\s+(\w+)\s*=\s*(['"`]|\d+|true|false|null|undefined|\{|\[)/g;
    let match;
    while ((match = statePattern.exec(js)) !== null) {
        state.push(match[2]);
    }

    // 快速扫描函数定义
    const handlerPattern = /\b(?:function\s+(\w+)|(\w+)\s*=\s*(?:function|\([^)]*\)\s*=>))\s*[({]/g;
    while ((match = handlerPattern.exec(js)) !== null) {
        handlers.push(match[1] || match[2]);
    }

    return { state, handlers };
}
```

### 4. 分级策略

| 文件大小 | 策略 | 说明 |
|---------|------|------|
| < 100KB | 完整 Babel 解析 | 质量最高 |
| 100KB - 1MB | 预过滤 + 完整 Babel 解析 | 过滤框架代码后解析 |
| 1MB - 5MB | 预过滤 + 截断解析 | 仅解析前 500KB |
| > 5MB | 正则快速扫描 | 跳过 Babel，仅正则提取 |

### 变更文件

| 文件 | 变更 |
|------|------|
| `src/transform/js-analyzer.ts` | 新增预过滤、截断、快速扫描 |
| `src/assembler.ts` | `extractJsFromAssets` 增加框架过滤 |

### 验收标准

- [ ] 框架代码（react, vue, umi, jquery 等）被正确过滤
- [ ] 用户态代码中的状态/事件/方法被正确提取
- [ ] 10MB JS Bundle 不会导致 OOM
- [ ] 所有现有测试通过
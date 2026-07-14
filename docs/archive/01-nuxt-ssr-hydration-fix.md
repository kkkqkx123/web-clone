# Nuxt SSR 水合修复 — 修改归档

> 对应问题分析：`docs/issue/nuxt-ssr-hydration-analysis.md`
> 修复方案：`docs/plan/06-nuxt-ssr-hydration-fix.md`
> 归档日期：2026-07-14

## 背景

对 `https://fanyi.pdf365.cn/?agent=zhihu` 执行快照时，语言选择器下拉框等 Vue 交互组件无法展开，控制台报错 `ChunkLoadError: Loading chunk 41 failed`。

## 修改清单

### 修改 1：`extractWebpackChunks` 函数重写

**文件**：`packages/core/src/discovery/recursive-scanner.ts`

**问题**：原实现使用逐条目 30 字符上下文窗口验证 chunk 是否在 webpack chunk map 中。但 Nuxt 的 chunk map 有 30+ 个条目（约 200+ 字符长度），中间条目（如 chunk 41 `b02411f`）的上下文看不到开头的 `{` 和结尾的 `}[e] + ".js"`，验证失败、chunk 被静默跳过。

**修复**：改为两阶段匹配——

1. 先用 `/\{[^}]+?\}\s*\[\w+\]\s*\+\s*["']\.js["']/g` 找到整个 chunk map 对象
2. 再从匹配到的对象中提取所有 hex hash 值

```typescript
// 旧：逐条目上下文验证
const contextStart = Math.max(0, match.index - 30);
const contextEnd = Math.min(jsText.length, match.index + match[0].length + 30);
const isWebpackChunk = /\{\s*\d+\s*:/.test(context) && /\[\w+\]\s*\+\s*["']\.js["']/.test(context);

// 新：两阶段匹配——先整体匹配 chunk map 对象，再提取所有 hash
const chunkMapRe = /\{[^}]+?\}\s*\[\w+\]\s*\+\s*["']\.js["']/g;
while ((mapMatch = chunkMapRe.exec(jsText)) !== null) {
  const hashRe = /["']([a-f0-9]{6,8})["']/g;
  while ((hashMatch = hashRe.exec(chunkMapStr)) !== null) {
    // ... 添加所有 chunk
  }
}
```

### 修改 2：CLI `--scan-depth` 默认值修复

**文件**：`apps/cli/src/cli.ts`

**问题**：Commander 的 `--scan-depth` 选项默认值为 `'1'`，即使 `DEFAULTS.scanDepth = 2`，Commander 传递的 `'1'` 使 `fromCommander` 中的 `cmd.scanDepth !== undefined` 为 true，导致递归扫描始终不执行。

**修复**：移除 Commander 默认值，让 `fromCommander` 的 `else` 分支使用 `DEFAULTS.scanDepth`。

```diff
- .option('--scan-depth <n>', '...', '1')
+ .option('--scan-depth <n>', '...')
```

### 修改 3：`fromCommander` 默认值兜底

**文件**：`apps/cli/src/config/cli-adapter.ts`

**问题**：当 CLI 和配置文件都未提供 `scanDepth` 时，`opts.scanDepth` 保持 `undefined`，`assembler.ts` 中的 `?? 1` 回退使其为 1。

**修复**：增加 `else` 分支，显式使用 `DEFAULTS.scanDepth`。

```diff
  if (cmd.scanDepth !== undefined) {
    opts.scanDepth = safeInt(cmd.scanDepth, DEFAULTS.scanDepth);
  } else if (mergedConfig.optionOverrides.scanDepth !== undefined) {
    opts.scanDepth = mergedConfig.optionOverrides.scanDepth;
+ } else {
+   opts.scanDepth = DEFAULTS.scanDepth;
  }
```

## 验证结果

| 指标 | 修复前 | 修复后 |
|------|--------|--------|
| `_nuxt` 目录 JS 文件数 | 7 | 43 |
| `b02411f.js`（chunk 41，语言选择器） | ❌ 缺失 | ✅ 下载 |
| 递归扫描日志 | 无 | `Recursive resource scanning (depth: 2)...` |
| 总下载数 | 110 | 231 |
| 总大小 | 3.2 MB | 5.7 MB |
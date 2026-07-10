# 11 — 流式 CSS 解析器多行选择器修复

## 问题

`css-analyzer.ts` 的 `analyzeCssStreaming()` 函数在处理多行选择器时，仅捕获 **包含 `{` 的最后一行**，丢失了选择器的前几行。

例如，对于以下 CSS：

```css
.el-table--border:after,
.el-table--group:after {
  content: '';
}
```

流式解析器处理流程：

```
第 1 行: ".el-table--border:after,"      → SELECTOR 状态，无 {，跳过（不累积）
第 2 行: ".el-table--group:after {"      → 命中 {，currentSelector = 仅 ".el-table--group:after"
```

结果：`currentSelector` 为 `.el-table--group:after`，丢失了 `.el-table--border:after`。这不仅导致 BEM 组件分组（`groupStylesByComponent`）的错误匹配，还会影响后续的 CSS 规则关联和样式提取。

## 根因

状态机在 `SELECTOR` 状态下，遇到不含 `{` 的行时 **什么都不做**（不累积到 `currentBlock` 或 `currentSelector`）：

```typescript
if (state === 'SELECTOR') {
  if (trimmed.includes('{')) {
    // 只有包含 { 的行才进入
    const braceIdx = trimmed.indexOf('{');
    currentSelector = trimmed.slice(0, braceIdx).trim();  // 仅此行的选择器部分
    currentBlock = trimmed + '\n';
    // ...
  }
  // 没有 else：不含 { 的行完全被忽略！
}
```

## 方案

### 方案 A：在 SELECTOR 状态累积行

在 SELECTOR 状态下，将不含 `{` 的行累积起来，当遇到包含 `{` 的行时，将累积的选择器与前一行拼接：

```typescript
if (state === 'SELECTOR') {
  if (trimmed.includes('{')) {
    const braceIdx = trimmed.indexOf('{');
    // 将累积的前置选择器与此行合并
    const selectorLines = (selectorAccumulator + trimmed.slice(0, braceIdx).trim())
      .replace(/\n/g, ' ')         // 换行→空格
      .replace(/\s+/g, ' ')        // 合并空白
      .replace(/\s*,\s*/g, ', ')   // 逗号后加空格
      .trim();
    currentSelector = selectorLines;
    currentBlock = (selectorAccumulator + trimmed + '\n');
    selectorAccumulator = '';
    state = 'BODY';
    // ... braceDepth 计算同前
  } else {
    // 累积选择器行
    selectorAccumulator += trimmed + ' ';
  }
}
```

需要新增一个 `selectorAccumulator` 变量（函数作用域，在 for 循环外初始化）。

### 方案 B：预处理合并多行选择器

在进入状态机之前，对 CSS 做一次预处理：将跨行的选择器合并到同一行：

```typescript
function normalizeSelectors(css: string): string {
  // 选择器可能跨行：以 , 结尾的行与下一行是同一个选择器
  // 将选择器行合并（以 ,\n 或直接在换行处）
  return css.replace(/(\w[\w-]*)\n(?=\s*\.)/g, '$1 ');
  // 更可靠的版本：
  // 如果一行不以 { 结尾且不包含 {，且下一行包含 {，则合并
}
```

**方案 A 更可靠**，因为它不破坏 CSS 原文，直接在状态机中处理。

### 方案 C：后处理修正选择器列表

在 `processRule` 中，从 `block` 的 selector 部分重新提取完整的选择器，而非使用 `currentSelector`：

```typescript
function processRule(selector: string, block: string, ...) {
  // 从 block 中重新提取完整的选择器（block 包含所有行）
  const blockSelectorEnd = block.indexOf('{');
  const actualSelector = block.slice(0, blockSelectorEnd)
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // 使用 actualSelector 而非 selector 参数
}
```

**方案 C 最简单**，对现有代码改动最小，且 block 内容已经被 `currentSelector + trimmed + ...` 方法正确累积（因为 block 是从第一个包含 `{` 的行开始累积的，之前的行丢失了）。

等等，block 其实也丢失了非 `{` 行——`currentBlock = trimmed + '\n'` 只在 `{` 所在行赋值。所以 block 也不完整。

**结论：方案 A 是唯一正确的解决方案**。

### 修正后的状态机

```typescript
function analyzeCssStreaming(css: string): CssAnalysisResult {
  const variables: Record<string, string> = {};
  const rules: CssRule[] = [];
  const componentStyles: Record<string, string[]> = {};

  let state: 'SELECTOR' | 'BODY' = 'SELECTOR';
  let currentSelector = '';
  let currentBlock = '';
  let selectorAccumulator = '';  // 新增：多行选择器累积
  let braceDepth = 0;

  for (const line of css.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;  // 跳过空行

    if (state === 'SELECTOR') {
      if (trimmed.includes('{')) {
        const braceIdx = trimmed.indexOf('{');
        // 将累积的前置选择器与此行的选择器部分合并
        const selectorLines = (selectorAccumulator + trimmed.slice(0, braceIdx).trim())
          .replace(/\n/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        currentSelector = selectorLines || trimmed.slice(0, braceIdx).trim();
        currentBlock = (selectorAccumulator + trimmed + '\n');
        selectorAccumulator = '';

        state = 'BODY';
        braceDepth = 1;
        const remaining = trimmed.slice(braceIdx + 1);
        if (remaining.includes('{')) {
          braceDepth += (remaining.match(/\{/g) || []).length;
        }
        braceDepth -= (trimmed.match(/\}/g) || []).length;
        if (braceDepth <= 0) {
          processRule(currentSelector, currentBlock, variables, rules, componentStyles);
          state = 'SELECTOR';
          currentSelector = '';
          currentBlock = '';
        }
      } else {
        // 累积选择器行
        selectorAccumulator += trimmed + ' ';
      }
    } else if (state === 'BODY') {
      // BODY 状态不变
      currentBlock += line + '\n';
      braceDepth += (trimmed.match(/\{/g) || []).length;
      braceDepth -= (trimmed.match(/\}/g) || []).length;

      if (braceDepth <= 0) {
        processRule(currentSelector, currentBlock, variables, rules, componentStyles);
        state = 'SELECTOR';
        currentSelector = '';
        currentBlock = '';
      }
    }
  }

  // 处理未闭合规则
  if (state === 'BODY' && currentSelector) {
    processRule(currentSelector, currentBlock, variables, rules, componentStyles);
  }

  const { globalStyles, componentStyles: grouped } = groupStylesByComponent(rules);
  const dynamicStyles = detectDynamicStyles(rules);

  return { variables, rules, componentStyles: grouped, globalStyles, dynamicStyles };
}
```

## 影响分析

### 直接影响

| 模块 | 影响 |
|------|------|
| `groupStylesByComponent` | 选择器完整后，BEM 匹配更准确 |
| `detectDynamicStyles` | 选择器正确关联到动态属性 |
| CSS variable 提取 | 多行规则 body 被正确扫描 |
| component styles | 正确的选择器用于组件样式分组 |

### 边缘情况

| 场景 | 处理 |
|------|------|
| 注释中的选择器 | CSS 注释 `/* ... */` 可能包含 `{`，但注释在流式解析中没有特殊处理，此场景可接受 |
| `@media` 规则中的多行选择器 | `@media` 的 `{` 在 SELECTOR 状态被捕获，内部子选择器的 `{` 在 BODY 状态被正常累积 |
| 空选择器 | `selectorAccumulator` 为空时直接使用当前行 |

## 变更文件

| 文件 | 变更 |
|------|------|
| `src/transform/css-analyzer.ts` | `analyzeCssStreaming`: 新增 `selectorAccumulator`；SELECTOR 状态累积非 `{` 行 |

## 验收标准

- [ ] `.el-table--border:after,\n.el-table--group:after { ... }` 的选择器被正确解析为 `.el-table--border:after, .el-table--group:after`
- [ ] 单行选择器行为不变
- [ ] 现有 dynamicStyles 和 groupStylesByComponent 输出正确
- [ ] `tsc --noEmit` 编译无错误

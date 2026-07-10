# Output / Parser 模块深层分析报告

## 概述

本文档对 `src/output/` 和 `src/parser/` 两个模块进行深层分析，识别潜在问题并按严重性分级。

---

## 一、`src/output/` 模块

### 文件清单

| 文件 | 职责 |
|------|------|
| `single-file.ts` | 生成单一自包含 HTML 文件 |
| `bundle.ts` | 生成分离资源的目录结构 |
| `convert.ts` | 生成组件提取输出（框架代码、模板、样式） |

---

### 高严重性问题

#### H1 — `single-file.ts` 中 `esc()` 用于 CSS 选择器导致 `&` 无法匹配

**文件**: [single-file.ts:66](file:///workspace/web-clone/src/output/single-file.ts#L66)

**问题**: 第 66 行使用 `esc()` 函数对 URL 进行 HTML 转义后拼接 CSS 选择器：
```typescript
const imgs = [...document.querySelectorAll(`img[src="${esc(a.originUrl)}"]`)];
```
`esc()` 将 `&` 转为 `&amp;`，但 DOM 属性值存储的是原始 URL（如 `https://example.com/path?q=a&b`）。CSS 属性选择器按字面值比较，`[src="...&amp;..."]` 不会匹配属性值为 `...&...` 的元素。

**影响**: 所有包含 `&` 的 URL（常见于带查询参数的 CDN URL）在图片替换、srcset 替换等环节无法匹配，导致资源引用失败。

**同样问题也存在于**:
- [single-file.ts:66](file:///workspace/web-clone/src/output/single-file.ts#L66) — `img[src="..."]`
- [bundle.ts:179](file:///workspace/web-clone/src/output/bundle.ts#L179) — `[data-origin-url="..."]`
- [bundle.ts:205](file:///workspace/web-clone/src/output/bundle.ts#L205) — `a[href="..."]`

#### H2 — `single-file.ts` pretty 模式破坏内联脚本/样式

**文件**: [single-file.ts:121](file:///workspace/web-clone/src/output/single-file.ts#L121)

**问题**:
```typescript
if (options.pretty) {
  html = html.replace(/>\s+</g, '>\n<');
}
```
全局替换 `>\s+<` 会匹配 `<script>` 和 `<style>` 标签内容中的类似模式，例如 `if (x > 0 && y < 1)` 会被破坏为：
```
if (x >\n0 && y <\n1)
```

**影响**: 启用 `--pretty` 选项时，内联脚本可能被破坏。

#### H3 — `single-file.ts` URL 替换存在子串污染

**文件**: [single-file.ts:8-14](file:///workspace/web-clone/src/output/single-file.ts#L8-L14)

**问题**:
```typescript
function rewriteUrls(text: string, urlMap: Map<string, string>): string {
  let result = text;
  for (const [original, replacement] of urlMap) {
    result = result.split(original).join(replacement);
  }
  return result;
}
```
当 one URL 是另一个 URL 的前缀子串时，先替换的短 URL 会污染长 URL。例如：
- URL A: `https://cdn.example.com/img/icon.png`
- URL B: `https://cdn.example.com/img/icon.png?v=2`
- 先替换 A 后，B 中的 `...icon.png` 部分已被替换，导致 B 无法匹配

**同样问题存在于** [single-file.ts:73](file:///workspace/web-clone/src/output/single-file.ts#L73) 的 srcset 替换中。

---

### 中严重性问题

#### M1 — `single-file.ts` 的 `esc` 缺少单引号转义

**文件**: [single-file.ts:3-5](file:///workspace/web-clone/src/output/single-file.ts#L3-L5)

**问题**:
```typescript
// single-file.ts
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
```
对比 [bundle.ts:10-16](file:///workspace/web-clone/src/output/bundle.ts#L10-L16) 中的版本多了一步 `'` → `&#39;` 转义。两个文件的 `esc` 函数不一致。

#### M2 — `bundle.ts` 中 `esc()` 用于 CSS 选择器导致 `&` 无法匹配

**文件**: [bundle.ts:179](file:///workspace/web-clone/src/output/bundle.ts#L179)

**问题**: 同 H1，使用 HTML 转义函数处理 CSS 选择器中的属性值，导致 `&` 查询参数无法匹配。影响 `data-origin-url` 和 `a[href]` 的查找。

#### M3 — `convert.ts` 中 `options` 参数类型为 `any`

**文件**: [convert.ts:8](file:///workspace/web-clone/src/output/convert.ts#L8)

**问题**:
```typescript
export function assembleConvert(result: ConvertResult, options: any): ConvertResult {
```
`options` 声明为 `any` 类型，失去 TypeScript 类型安全检查。应使用 `SnapshotOptions` 或定义更精确的类型。

---

### 低严重性问题

#### L1 — `single-file.ts` `metaSource.nextSibling!` 非空断言

**文件**: [single-file.ts:104](file:///workspace/web-clone/src/output/single-file.ts#L104)

**问题**: 当 `<head>` 只有 `metaSource` 一个子元素时，`nextSibling` 为 `null`，非空断言 `!` 会导致运行时错误。

#### L2 — `bundle.ts` 写入两份相似的 JSON 文件

**文件**: [bundle.ts:277-285](file:///workspace/web-clone/src/output/bundle.ts#L277-L285)

**问题**: `snapshot.json` 和 `manifest.json` 包含高度重叠的信息（assets 清单、统计信息），造成冗余。

#### L3 — `convert.ts` 组件名不做路径安全校验

**文件**: [convert.ts:22](file:///workspace/web-clone/src/output/convert.ts#L22)

**问题**: 直接用 `comp.name` 创建目录，如果组件名包含 `../` 等路径穿越字符，可能导致文件写入到预期目录之外。

#### L4 — `convert.ts` 写入空共享逻辑文件

**文件**: [convert.ts:396-398](file:///workspace/web-clone/src/output/convert.ts#L396-L398)

**问题**: 当 `SharedLogicExtractor` 返回空字符串时，仍然写入空文件（如 `api.ts`、`utils.ts`、`constants.ts`），占用不必要的磁盘空间。

#### L5 — 无单元测试覆盖

**文件**: 所有 output 文件

**问题**: `src/output/` 和 `src/parser/` 模块没有任何单元测试，降低代码可维护性。

---

## 二、`src/parser/` 模块

### 文件清单

| 文件 | 职责 |
|------|------|
| `url-resolver.ts` | URL 解析、规范化、srcset 解析 |
| `css-parser.ts` | CSS 资产提取、URL 重写 |
| `html-parser.ts` | HTML 解析、资产引用提取 |

---

### 中严重性问题

#### M4 — `url-resolver.ts` 协议相对 URL 处理过于复杂

**文件**: [url-resolver.ts:7-9](file:///workspace/web-clone/src/parser/url-resolver.ts#L7-L9)

**问题**:
```typescript
if (raw.startsWith('//')) {
  const base = new URL(baseUrl);
  return new URL(raw, `${base.protocol}${raw}`).href;
}
```
`new URL(raw, baseUrl)` 本身就能正确处理协议相对 URL（`//example.com/path`），无需特殊处理。当前实现复杂且冗余。

#### M5 — `html-parser.ts` 深层 CSS 递归提取未去重

**文件**: [html-parser.ts:94-105](file:///workspace/web-clone/src/parser/html-parser.ts#L94-L105)

**问题**: 从 `<style>` 内联样式提取的 CSS 资产通过 `seen` 去重，但 `extractCssAssets` 每调用一次就创建一个新的 `seen` 集合。当同一个 CSS 文件中 `@import` 多个子文件时，重复的 `@import` 不会被去重。不过这个问题在 `assembler.ts` 的 `dedupe` 函数中会被二次处理，影响较小。

---

### 低严重性问题

#### L6 — `html-parser.ts` 全局计数器不重置

**文件**: [html-parser.ts:6](file:///workspace/web-clone/src/parser/html-parser.ts#L6)

**问题**: `snapshotIdCounter` 是模块级变量，在单次进程生命周期内多次调用 `parseHtml` 时不会重置，`data-snapshot-id` 会持续递增。

#### L7 — `html-parser.ts` srcset 处理代码重复

**文件**: [html-parser.ts:70-92](file:///workspace/web-clone/src/parser/html-parser.ts#L70-L92)

**问题**: `img[srcset]` 和 `source[srcset]` 的处理逻辑完全一致，可以提取为共享函数。

#### L8 — `css-parser.ts` `classifyCssUrl` 无法识别无扩展名 URL

**文件**: [css-parser.ts:10-23](file:///workspace/web-clone/src/parser/css-parser.ts#L10-L23)

**问题**: 仅通过文件扩展名分类，对于无扩展名的 URL（如 `https://cdn.example.com/font` 或 URL 重写后的路径）只能返回 `'other'`。

#### L9 — 无单元测试覆盖

**问题**: `src/parser/` 模块没有任何单元测试。

---

## 三、严重性汇总

| 编号 | 严重性 | 模块 | 问题描述 |
|------|--------|------|----------|
| H1 | **高** | single-file/bundle | `esc()` 用于 CSS 选择器导致 `&` 无法匹配 |
| H2 | **高** | single-file | pretty 模式破坏内联脚本/样式 |
| H3 | **高** | single-file | URL 子串替换污染 |
| M1 | 中 | single-file | `esc` 缺少单引号转义 |
| M2 | 中 | bundle | `esc()` 用于 CSS 选择器导致 `&` 无法匹配 |
| M3 | 中 | convert | `options` 类型为 `any` |
| M4 | 中 | url-resolver | 协议相对 URL 处理过于复杂 |
| M5 | 中 | html-parser | 深层 CSS 递归提取未去重 |
| L1 | 低 | single-file | `nextSibling!` 非空断言 |
| L2 | 低 | bundle | 冗余 JSON 文件 |
| L3 | 低 | convert | 组件名缺路径安全校验 |
| L4 | 低 | convert | 写入空共享逻辑文件 |
| L5 | 低 | output | 无单元测试 |
| L6 | 低 | html-parser | 全局计数器不重置 |
| L7 | 低 | html-parser | srcset 代码重复 |
| L8 | 低 | css-parser | 扩展名 URL 分类局限 |
| L9 | 低 | parser | 无单元测试 |

---

## 四、修改方案

### H1 — CSS 选择器中的 URL 需要转义 CSS 特殊字符（而非 HTML）

**方案**: 创建 `escCssAttr` 函数，对 CSS 属性选择器中的值进行正确转义：
- 转义 `\` → `\\`
- 转义 `"` → `\"`（在双引号属性值中）
- 转义 `]` → `\]`
- 不需要转义 `&`、`<`、`>`、`'`

**涉及文件**: `single-file.ts`、`bundle.ts`

### H2 — pretty 模式改用更安全的 DOM 级别缩进

**方案**: 在 DOM 操作阶段（`document.toString()` 之前）对文本节点做缩进，而非在序列化后的 HTML 字符串上做正则替换。

或者更简单：将 `pretty` 替换限制在 HTML 标签之间，排除 `<script>` 和 `<style>` 的 textContent。

**涉及文件**: `single-file.ts`

### H3 — URL 替换按长度降序排序

**方案**: 对 `urlMap` 按键（原始 URL）长度降序排序，确保长 URL 先被替换，避免子串污染。

**涉及文件**: `single-file.ts`（`rewriteUrls` 函数和 srcset 替换）

### M1 — 统一 `esc` 函数

**方案**: 将 `single-file.ts` 的 `esc` 函数补充单引号转义，与 `bundle.ts` 保持一致。

### M2 — bundle.ts 的 CSS 选择器转义

**方案**: 同 H1，使用 `escCssAttr` 替代 `esc` 用于 CSS 选择器。

### M3 — `convert.ts` 类型安全

**方案**: 为 `assembleConvert` 定义更精确的 options 类型。

### M4 — `url-resolver.ts` 简化

**方案**: 移除 `//` 协议相对 URL 的特殊处理，直接依赖 `new URL(raw, baseUrl)` 的原生行为。

### M5 — `html-parser.ts` 深层 CSS 去重

**方案**: 在 `parseHtml` 内部使用统一 `seen` 集合，确保深层 CSS 引用也被去重。这已在 `assembler.ts` 的 `dedupe` 中有二次处理，当前可接受。

### 低优先级问题

- L1: 添加 `if (metaSource.nextSibling)` 判断
- L2: 合并 `snapshot.json` 和 `manifest.json`
- L3: 对组件名做路径穿越校验
- L4: 检查 Extractors 返回内容是否为空
- L5, L9: 逐步添加单元测试
- L6: 在 `parseHtml` 中重置计数器
- L7: 提取 `processSrcset` 共享函数
- L8: 添加 MIME 启发式分类
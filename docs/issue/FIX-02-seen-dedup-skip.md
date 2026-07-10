# FIX-02: html-parser.ts seen 去重时遗漏 data-origin-url

## 状态
已修复

## 文件
`/workspace/web-clone/src/parser/html-parser.ts`

## 根因

`parseHtml` 中资源 URL 去重逻辑导致同一 URL 在页面出现多次时，第二个及后续元素不会设置 `data-origin-url` 属性。

典型场景：
- `arrow.5e13948.svg` 在源语言和目标语言两个下拉框中各出现一次
- `voice.c25ab05.svg` 在 "原文朗读" 和 "译文朗读" 按钮中各出现一次  
- Nuxt JS 文件先被 `<link rel="preload">` 引用，再被 `<script src>` 引用

修复前逻辑：
```ts
if (!resolved || seen.has(resolved)) continue; // ← 跳过，不设置 data-origin-url
seen.add(resolved);
addSnapshotAttrs(el, resolved);                 // ← 只有第一个元素执行
assets.push({ url: resolved, ... });
```

## 修复

将 `addSnapshotAttrs` 调用提前到去重判断之前：

```ts
addSnapshotAttrs(el, resolved);        // ← 始终为元素添加标记
if (seen.has(resolved)) continue;       // ← 去重只作用于资源集合
seen.add(resolved);
assets.push({ url: resolved, ... });
```

同样修复了 `img[srcset]` 和 `source[srcset]` 的逻辑。

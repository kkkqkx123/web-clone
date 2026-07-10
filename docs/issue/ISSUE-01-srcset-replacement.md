# ISSUE-01: srcset 属性在 assembleBundle 中未处理

## 状态
待修复

## 严重程度
中

## 文件
`/workspace/web-clone/src/output/bundle.ts`

## 描述

`assembleBundle` 目前只处理 `src` 和 `href` 属性的路径替换，不支持 `<img srcset="...">` 和 `<source srcset="...">` 属性的 URL 重写。

`html-parser.ts` 中已正确解析 `srcset` 并设置 `data-origin-url`，且资源已下载并存储为 `assetMap` 中的键值对，但 `assembleBundle` 缺乏对应的替换逻辑。

## 预期行为

`srcset` 中的 URL 应被替换为本地 `assets/` 相对路径，格式如：
```
before: srcset="https://cdn.example.com/img/hero-1x.jpg 1x, https://cdn.example.com/img/hero-2x.jpg 2x"
after:  srcset="assets/img/img/hero-1x.jpg 1x, assets/img/img/hero-2x.jpg 2x"
```

## 涉及页面

Nuxt SSR 页面通常不大量使用 `srcset`，但一般 Web 页面在响应式图片中常用。

## 可能方案

参考现有 `src`/`href` 替换逻辑，遍历 `srcset` 中的每个候选 URL，通过 `data-origin-url` 匹配并替换。

# 问题清单

## 已修复

| 编号 | 标题 | 文件 | 日期 |
|------|------|------|------|
| FIX-01 | bundle.ts 路径匹配逻辑错误 | bundle.ts | 2026-07-10 |
| FIX-02 | html-parser.ts seen 去重时遗漏 data-origin-url | html-parser.ts | 2026-07-10 |
| FIX-03 | 新增 --convert-local 本地转换命令 | cli.ts, assembler.ts, types.ts | 2026-07-10 |

## 待修复 - 解析器 (Parser)

| 编号 | 标题 | 严重程度 |
|------|------|----------|
| ISSUE-01 | srcset 属性在 assembleBundle 中未处理 | 中 |
| ISSUE-02 | index.json globalStyles 错误解析 CSS 变量 | 高 |
| ISSUE-03 | index.json dynamicStyles 冗余 | 低 |

## 待修复 - 组件提取 (Component Extraction)

| 编号 | 标题 | 严重程度 |
|------|------|----------|
| ISSUE-04 | 组件提取对 SSR 页面组件识别率为零 | 高 |
| ISSUE-05 | 未利用 data-v-* 属性作为组件边界提示 | 中 |

## 待修复 - 资源处理 (Resource)

| 编号 | 标题 | 严重程度 |
|------|------|----------|
| ISSUE-06 | 下载失败资源保留原始绝对路径 | 中 |

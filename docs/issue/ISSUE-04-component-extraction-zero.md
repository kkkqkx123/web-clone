# ISSUE-04: 组件提取对 SSR 页面组件识别率为零

## 状态
待修复

## 严重程度
高

## 文件
`/workspace/web-clone/src/` (组件提取逻辑)

## 描述

对 Nuxt SSR 页面 (`fanyi.pdf365.cn`)，使用 `--extract-components` 参数后，提取器输出了 0 个组件。页面 HTML 中实际包含清晰的语义区域：

- 头部导航 (`<div class="head">`)
- 翻译功能区（源语言/目标语言选择、文本输入、图片上传）
- 功能介绍区（6 个特性卡片）
- 客户案例区
- 页脚 (`<div class="foot">`)

此外，Nuxt 的 scoped 样式通过 `data-v-xxxxxxxx` 属性天然标记了组件边界。

## 根因分析

当前组件提取依赖 LLM（带 `codegen-*` 选项时）或纯规则匹配，但对以下方面支持不足：

1. SSR 页面中不存在可见的组件 import/slot/prop 语义
2. `data-v-*` 属性（Vue scoped styles 的组件标识）未被利用
3. 大页面（~200KB HTML）可能超出 LLM 上下文窗口，导致放弃分析

CLI 输出中的 `Memory budget: CSS: head, JS: head — results may be partial` 提示内存预算超限。

## 处理建议

1. 利用 `data-v-*` 属性作为 Vue 组件边界提示，按 scoped ID 分组 DOM 节点
2. 对超大页面采用分段策略（截取代表性片段分析）
3. 将纯静态区域（如 footer 中的链接列表）也纳入组件化候选

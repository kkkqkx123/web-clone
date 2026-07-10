# ISSUE-05: 未利用 data-v-* 属性作为组件边界提示

## 状态
待修复

## 严重程度
中

## 文件
`/workspace/web-clone/src/` (组件提取逻辑)

## 描述

Nuxt/Vue 框架的 SSR 输出中，每个组件的作用域样式通过 `data-v-xxxxxxxx` 属性标记。页面中存在多个不同的 scoped ID，天然标记了组件边界：

```
data-v-06a0e4e3  → 活动弹窗组件
data-v-85b37b74  → 头部导航组件
data-v-3b4f252d  → 首页主体组件
data-v-1ed17389  → 优惠券组件
data-v-6f2c9fe3  → Tab 切换组件
data-v-0b2a9929  → 语言选择组件
data-v-14dcd0ee  → 功能介绍组件
data-v-61f56ecc  → 页脚组件
data-v-a4800606  → 广告轮播组件
```

当前组件提取逻辑未利用这些属性。

## 预期行为

1. 按 `data-v-*` ID 分组 DOM 节点，识别出候选组件
2. 对于没有 `data-v-*` 属性的节点，按结构层次聚类
3. 提取后生成对应的组件文件并填充模板内容

## 处理建议

在 HTML 解析阶段收集所有 `data-v-*` 属性名，按 scoped ID 统计节点数和嵌套关系，作为组件提取的强提示信号。

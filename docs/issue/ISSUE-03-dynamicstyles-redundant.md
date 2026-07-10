# ISSUE-03: index.json dynamicStyles 冗余

## 状态
待修复

## 严重程度
低

## 文件
`/workspace/web-clone/src/` (组件提取/样式分析逻辑)

## 描述

`components/index.json` 中 `dynamicStyles` 数组极其庞大（6668 行），但内容仅包含 CSS 属性名的重复列表，缺少对应的值。

实际输出示例：
```json
{
  "selector": ".__nuxt-error-page",
  "properties": [
    "padding", "color", "display", "display", "top", "left", "color",
    "color", "color", "left", "width", "height", ...
  ]
}
```

问题：
1. `properties` 数组中只有属性名，没有值（如 `"color"` 而不是 `"color: #333"`）
2. 大量重复的属性名（`"display"` 出现数十次）
3. 文件体积极度膨胀但无实用价值

## 预期行为

`dynamicStyles` 应输出有意义的动态样式信息（如内联 style 的计算值），或在无法提取值时保持为空数组。属性名列表无助于理解样式特征。

## 处理建议

1. 过滤重复属性名
2. 同时捕获属性值（`"color: #333"` 格式），而非仅属性名
3. 若无可用信息，输出空数组

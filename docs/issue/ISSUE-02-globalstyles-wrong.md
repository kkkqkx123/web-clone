# ISSUE-02: index.json globalStyles 错误解析 CSS 变量

## 状态
待修复

## 严重程度
高

## 文件
`/workspace/web-clone/src/` (组件提取/样式分析逻辑)

## 描述

`components/index.json` 中的 `globalStyles` 字段错误地将 CSS 伪类选择器片段作为 CSS 自定义变量的值输出。

实际输出（取自 `fanyi.pdf365.cn` 页面）：
```json
{
  "--primary": "not(:first-child):not(:last-child)",
  "--success": "not(:first-child):not(:last-child)",
  "--text": "active",
  "--picture-card": "hover,.el-upload:focus",
  "--border": "after,.el-table--group:after"
}
```

这些值对应的是 Element UI 的 BEM 修饰符选择器，而非 CSS 自定义属性的实际值。

## 预期行为

`globalStyles` 应输出页面中实际定义的 CSS 自定义属性及其值，例如：
```json
{
  "--color-primary": "#409EFF",
  "--border-radius-base": "4px"
}
```

如果没有真实的 CSS 变量定义，该字段应为空对象 `{}`。

## 根因推测

样式提取逻辑可能将 CSS 选择器中的伪类部分（如 `:first-child`、`:hover`、`.el-upload:focus`）错误匹配为 CSS 自定义属性 `--xxx` 的值。

## 影响

该字段在 `index.json` 中被标记为 `globalStyles`，误导使用者认为这些是对应 CSS 变量的值，实际并非如此。

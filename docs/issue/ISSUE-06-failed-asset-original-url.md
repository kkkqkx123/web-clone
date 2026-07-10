# ISSUE-06: 下载失败资源保留原始绝对路径

## 状态
待修复

## 严重程度
中

## 文件
`/workspace/web-clone/src/` (资源下载 & bundle 组装)

## 描述

部分资源因 HTTP 404、校验失败等原因无法下载，在最终 HTML 中保留了原始绝对路径或外链路径。

本次 fanyi.pdf365.cn 抓取中的案例：

```
src="https://fanyi.pdf365.cn/web_auto_login_v2"   (校验失败: Content validation failed)
src="/activityTimer.js"                            (HTTP 404)
```

## 影响

1. 在离线环境（本地文件）下打开页面时，这些资源加载失败
2. `/activityTimer.js` 保留相对路径，在无 Web 服务器环境下无法解析
3. 外部脚本（如 `web_auto_login_v2`）会向原服务器发请求，可能带来隐私/安全问题

## 处理建议

1. 对下载失败的资源：移除对应 HTML 元素的 `src`/`href` 属性，或替换为占位符注释
2. 可选：在 HTML 头部插入注释标注哪些资源因什么原因未下载
3. 避免在最终 HTML 中保留指向外部服务器的脚本引用

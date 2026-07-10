# FIX-01: bundle.ts 路径匹配逻辑错误

## 状态
已修复

## 文件
`/workspace/web-clone/src/output/bundle.ts`

## 根因

`assembleBundle` 函数中用解析后的绝对 URL（如 `https://fanyi.pdf365.cn/_nuxt/img/logo.8e19401.svg`）构建 CSS 选择器去定位 DOM 元素，然后修改其 `src`/`href` 属性。但 DOM 中的 `src`/`href` 属性保存的是原始相对路径（如 `/_nuxt/img/logo.8e19401.svg`）。

```ts
// 修复前 - 永远匹配不到元素
const el = document.querySelector(`link[href="${a.originUrl}"]`);
```

`a.originUrl` 是 `https://fanyi.pdf365.cn/_nuxt/img/logo.svg`，但 DOM 中元素的 `href` 属性是 `/_nuxt/img/logo.svg`。

## 修复

改用 HTML 解析阶段设置的 `data-origin-url` 属性定位元素，根据标签名自动选择目标属性：

- `link` → 更新 `href`
- `script` / `img` / `source` / `video` / `audio` → 更新 `src`

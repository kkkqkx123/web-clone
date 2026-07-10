# 09 — 组件检测覆盖度与嵌套子树提升

## 问题

当前 `data-v-*` 检测（P3）能从 Vue SSR 页面中发现 `data-v-xxxxxxxx` 属性，但测试表明仅识别出 3 个组件（`__nuxt`、`Activity`、`Index`），而页面实际包含 10+ 个 Vue scoped 组件根。缺失的组件如 `data-v-85b37b74`（导航头）、`data-v-14dcd0ee`（功能介绍）、`data-v-61f56ecc`（页脚）、`data-v-1ed17389`（优惠券）等均嵌套在 `Index` 组件内部。

## 根因分析

### 问题 1：子组件在嵌套树中被丢弃

`analyzeHtml()`（`component-analyzer.ts:498-515`）生成 `componentRoots` 时，对顶层元素的 children 映射为 `children: []`（固定空数组），丢失了孙子组件：

```typescript
children: c.children.map(child => {
  // ...
  return {
    name: child.name,
    element: childEl,
    depth: child.depth,
    // ...
    children: [],    // <-- 孙子组件在此丢失！
  };
}),
```

### 问题 2：`correlateComponents` 使用 name 作为 Map key 覆盖子组件

`correlator.ts` 中的 `components.set(root.name, comp)` 使用组件 **名称** 作为 Map key。当两个子组件根据 class 推断出同名（如都叫 `"Container"`）时，后一个覆盖前一个，导致计数丢失。

### 问题 3：单元素多 `data-v-*` 只检查第一个

`checkComponentRoot` 中的 P3 检测：

```typescript
const dataVKey = Object.keys(attrs).find(k => k.startsWith('data-v-'));
if (dataVKey) {
  const hash = dataVKey.replace('data-v-', '');
  if (hash && !this.seenDataV.has(hash)) {
    // 只处理第一个匹配的 data-v-*
  }
}
```

当 DOM 元素携带两个 `data-v-*` 属性时（Vue 嵌套组件在 SSR 渲染中常见）：
```html
<div class="container" data-v-1ed17389="" data-v-06a0e4e3="">
```

若 `find()` 先匹配到 `data-v-06a0e4e3`（已被父组件 `Activity` 占用），`seenDataV` 判定为已见，**跳过整个元素**，导致 `data-v-1ed17389` 对应的子组件被漏检。

### 问题 4：`correlateComponents` 未递归收集所有 children 到平铺列表

`correlateComponents` 递归处理子节点，但 `HtmlAnalysisResult` 的 `componentRoots` 仅包含顶层节点。子节点通过 `root.children` 嵌套传递。`convert.ts` 中 `assembleConvert` 调用 `correlateComponents` 后，`components Map` 理论上包含所有递归处理的组件，但 `stats.total` 却基于 `HtmlAnalysisResult.componentRoots` 的扁平计数：

```typescript
// convert.ts
const htmlResult = enhanceHtmlAnalysis(html, options);
// htmlResult.componentRoots 只有顶层
const correlated = correlateComponents(htmlResult, cssResult, jsResult);
// correlated Map 包含所有递归组件
```

检查 `convert.ts` 中的统计逻辑，确认 `stats.total` 的来源。

## 方案

### 1. 递归深度保留子组件树

修改 `analyzeHtml` 的输出，递归映射 children：

```typescript
function mapChildren(children: ComponentRootCandidate[], html: string, analyzer: StreamingHtmlAnalyzer): any[] {
  return children.map(child => {
    const outerHTML = analyzer.extractOuterHTML(html, child);
    const el = new LightweightElement(child.tagName, child.attrs['class'] || '', child.attrs['id'] || '', outerHTML);
    return {
      name: child.name,
      element: el,
      depth: child.depth,
      type: child.type,
      confidence: child.confidence,
      parent: null,
      children: mapChildren(child.children, html, analyzer),  // 递归
    };
  });
}

// componentRoots 中递归构建
const componentRoots = filtered.map(c => ({
  name: c.name,
  element: createElement(c, html, analyzer),
  depth: c.depth,
  type: c.type,
  confidence: c.confidence,
  parent: null,
  children: mapChildren(c.children, html, analyzer),
}));
```

### 2. P3 检测：遍历所有 `data-v-*` 属性

将单属性 `find` 改为遍历检查：

```typescript
const dataVKeys = Object.keys(attrs).filter(k => k.startsWith('data-v-'));
for (const dataVKey of dataVKeys) {
  const hash = dataVKey.replace('data-v-', '');
  if (hash && !this.seenDataV.has(hash)) {
    this.seenDataV.add(hash);
    return {
      name: this.inferComponentName(attrs, tagName, `VueComp_${hash.slice(0, 7)}`),
      // ...
    };
  }
}
```

**设计决策**：只将 **第一个未见** 的 `data-v-*` hash 作为组件根，忽略后续已见的 hash。这样保证一个元素最多被一个组件根标记，避免歧义。

### 3. `correlateComponents` 组件 Map key 改为 `name + depth` 避免覆盖

子组件可能拥有与兄弟组件相同的推断名称。改为使用唯一标识：

```typescript
function buildComponentKey(root: any): string {
  return `${root.name}_${root.depth}`;
}

function processRoot(root: any) {
  const key = buildComponentKey(root);
  // ...
  components.set(key, comp);
  // ...
}
```

或者使用 UUID：

```typescript
import { randomUUID } from 'node:crypto';
components.set(randomUUID(), { ...comp, name: root.name });
```

**设计决策**：选择 `name_depth` 方案，保持可读性，开发者能直接从 key 映射到组件。

### 4. `convert.ts` 统计修正

确保 `stats.total` 基于 `correlated Map` 的大小，而非 `htmlResult.componentRoots.length`：

```typescript
const correlated = correlateComponents(htmlResult, cssResult, jsResult);
const totalComponents = correlated.size;
```

### 5. 输出结构调整

当前子组件 template 是整个父组件 outerHTML 的子串。需要改为提取子组件自身的 outerHTML，而非依赖父组件的整体 HTML。`extractOuterHTML` 已按 `startOffset`/`endOffset` 提取，子组件可以独立提取。

## 变更文件

| 文件 | 变更 |
|------|------|
| `src/transform/component-analyzer.ts` | `analyzeHtml`: 递归子组件映射；`checkComponentRoot` P3: 遍历所有 `data-v-*` 属性 |
| `src/transform/correlator.ts` | `correlateComponents`: 改用唯一 key (`name_depth`) |
| `src/output/convert.ts` | `stats.total` 改为 `correlated.size` |

## 验收标准

- [ ] 10+ `data-v-*` 组件全部被检测，统计 ≥ 8
- [ ] 子组件 template 正确提取自身 outerHTML（不从父组件截取）
- [ ] 同名子组件不相互覆盖，全部出现在最终输出中
- [ ] 编译 `tsc --noEmit` 无错误
- [ ] `REVIEW_REQUIRED.md` 列出所有低置信度组件

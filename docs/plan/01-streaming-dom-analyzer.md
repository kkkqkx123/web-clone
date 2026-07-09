# 01 — 流式 DOM 分析器

## 问题

`component-analyzer.ts` 使用 `linkedom` 的 `parseHTML()` 将整个 HTML 解析为完整 DOM 树，然后调用 `querySelectorAll('*')` 遍历所有元素。对于大型 SPA 页面：

- **ModelScope（UmiJS）**：HTML 中包含约 5MB 的行内 JSON 数据（`__detail_data__`）和数万个 DOM 节点
- `linkedom` 将整个 HTML 加载到内存中构建 DOM 树，内存占用迅速超过 2GB
- `querySelectorAll('*')` 返回所有元素的 NodeList，进一步放大内存压力
- `getElementDepth()` 为每个元素从当前节点遍历到根节点，时间复杂度 O(n * depth)

## 根因分析

```typescript
// component-analyzer.ts:63 — 无深度限制时全量遍历
if (maxDepth !== undefined) {
    doc.querySelectorAll('*').forEach((el: any) => {  // 遍历所有元素
```

```typescript
// component-analyzer.ts:184 — 每个元素都从自身遍历到根
function getElementDepth(el: any): number {
    let depth = 0;
    let current = el;
    while (current.parentElement) { depth++; current = current.parentElement; }
    return depth;
}
```

## 方案：SAX 风格流式分析器

### 核心思路

放弃 `linkedom` 的完整 DOM 树构建，改用 **基于正则 / 状态机的流式 HTML 解析器**，只提取组件分析所需的信息，减少 90%+ 的内存占用。

### 架构设计

```
HTML 字符串 (可能很大)
    │
    ▼
StreamingHtmlAnalyzer
    │
    ├── 阶段1: 标签扫描（正则/状态机）
    │   ├── 识别语义标签 <header/footer/nav/main/section/article>
    │   ├── 识别 data-component 显式标记
    │   ├── 识别绑定/事件属性
    │   └── 维护栈深度（替代 getElementDepth）
    │
    ├── 阶段2: 组件边界推断
    │   ├── 基于栈深度和语义标签推断组件边界
    │   └── 仅输出组件的 outerHTML（而非全文）
    │
    └── 阶段3: 动态点提取
        ├── 从已扫描的标签中提取绑定/事件/条件
        └── 无需二次遍历
```

### 详细设计

```typescript
interface StreamingHtmlAnalyzerOptions {
    depth?: number;              // 组件识别深度限制
    maxTagScan?: number;         // 最大扫描标签数（防 OOM）
    sampleMode?: boolean;        // 仅分析前 N 个标签
}

interface TagInfo {
    tagName: string;
    depth: number;
    attrs: Record<string, string>;
    startOffset: number;
    endOffset: number;
    children: TagInfo[];
}

class StreamingHtmlAnalyzer {
    private stack: TagInfo[] = [];
    private tags: TagInfo[] = [];
    private depth = 0;
    private tagCount = 0;

    // 使用单个正则逐标签扫描
    private readonly TAG_REGEX = /<(\/?)(\w+)[^>]*>/g;

    feed(html: string, options: StreamingHtmlAnalyzerOptions): void {
        let match: RegExpExecArray | null;
        while ((match = this.TAG_REGEX.exec(html)) !== null) {
            if (options.maxTagScan && this.tagCount >= options.maxTagScan) break;
            this.processTag(match[1], match[2], match[0]);
            this.tagCount++;
        }
    }

    // 基于栈深度推断组件
    findComponentRoots(): ComponentRoot[] { ... }
    findDynamicPoints(): DynamicPoints { ... }
}
```

### 关键优化

1. **单遍扫描**：一次正则扫描完成所有标签信息收集，无需 O(n * depth) 的 `getElementDepth`
2. **栈式深度追踪**：维护 tag 栈，`depth = stack.length`，O(1) 获取深度
3. **可配置上限**：`maxTagScan` 控制扫描标签数，超过上限时截断
4. **采样模式**：`sampleMode` 仅分析前 N 个标签，适用于超大型页面
5. **惰性 outerHTML 提取**：仅对最终确定的组件根节点提取 outerHTML，不做全量提取

### 内存对比

| 方案 | DOM 树 | 标签信息 | 总计 |
|------|--------|---------|------|
| 当前（linkedom） | ~500MB+ | ~500MB+ | **1GB+** |
| 流式（SAX） | 0 | ~10MB | **<10MB** |

### 影响范围

| 文件 | 变更 |
|------|------|
| `src/transform/component-analyzer.ts` | 重写核心逻辑，替换 linkedom |
| `src/transform/types.ts` | 可能新增 StreamTag 等类型 |
| `src/parser/html-parser.ts` | 不变（快照流水线仍使用 linkedom） |

### 风险与注意事项

- **边界情况**：自闭合标签（`<br/>`）、不规范的 HTML 需要特殊处理
- **linkedom 保留**：`html-parser.ts` 仍然使用 linkedom 用于资源提取，仅组件分析器替换
- **CSS/JS 合并**：`assembler.ts` 中的 `extractInlineCss`/`extractInlineJs` 不受影响，仍使用正则提取
- **outerHTML 准确度**：流式分析器提取的模板片段可能与 linkedom 序列化结果略有差异，需确保标签闭合正确

### 验收标准

- [ ] 对 ModelScope 页面运行 `--extract-components` 不 OOM
- [ ] 对 B 站 412 页面结果与之前一致（0 组件）
- [ ] 对小页面（如 `example.com`）结果一致
- [ ] 内存占用降低 90%+（对比 heap snapshot）
- [ ] `maxTagScan` 参数生效，超过时优雅截断
- [ ] 所有现有测试通过
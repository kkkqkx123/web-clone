# 03 — CSS 增量解析

## 问题

`css-analyzer.ts` 使用 `postcss` 解析完整的 CSS 文本。对于大型 SPA 页面：

- **ModelScope（UmiJS）**：`umi.css` 约 109KB
- 虽然不是特别大，但 `postcss` 会构建完整的 AST 树
- `groupStylesByComponent()` 对每条规则做正则匹配，复杂度 O(n)
- 在多页面场景下，多个 CSS 合并后可能更大

## 方案

### 1. 基于行数的流式解析

对 CSS 进行逐行扫描，而不是完整 AST 解析：

```typescript
function analyzeCssStreaming(css: string): CssAnalysisResult {
    const variables: Record<string, string> = {};
    const rules: Array<{ selector: string; source: string }> = [];
    const componentStyles: Record<string, string[]> = {};

    // 状态机：SELECTOR / BODY / DECL
    let state: 'SELECTOR' | 'BODY' | 'DECL' = 'SELECTOR';
    let currentSelector = '';
    let currentBlock = '';
    let braceDepth = 0;

    for (const line of css.split('\n')) {
        const trimmed = line.trim();

        if (state === 'SELECTOR' && trimmed.includes('{')) {
            currentSelector = trimmed.split('{')[0].trim();
            currentBlock = trimmed + '\n';
            state = 'BODY';
            braceDepth = (trimmed.match(/\{/g) || []).length - (trimmed.match(/\}/g) || []).length;
        } else if (state === 'BODY') {
            currentBlock += line + '\n';
            braceDepth += (trimmed.match(/\{/g) || []).length;
            braceDepth -= (trimmed.match(/\}/g) || []).length;

            if (braceDepth <= 0) {
                // 完整的规则块
                processRule(currentSelector, currentBlock, variables, rules, componentStyles);
                state = 'SELECTOR';
                currentSelector = '';
                currentBlock = '';
            }
        }
    }

    // 从规则中提取全局样式和动态样式
    const { globalStyles, componentStyles: grouped } = groupStylesByComponent(rules);
    const dynamicStyles = detectDynamicStyles(rules);

    return { variables, rules, globalStyles, componentStyles: grouped, dynamicStyles };
}
```

### 2. 选择性解析 — 仅关注与组件相关的规则

```typescript
function processRule(
    selector: string,
    block: string,
    variables: Record<string, string>,
    rules: any[],
    componentStyles: Record<string, string[]>,
): void {
    // 提取 CSS 变量
    const varMatch = block.match(/--[\w-]+\s*:\s*[^;]+/g);
    if (varMatch) {
        varMatch.forEach(v => {
            const [key, value] = v.split(':').map(s => s.trim());
            variables[key] = value;
        });
    }

    // 只保留与组件分析相关的规则
    rules.push({ selector, source: block });

    // 基于 BEM 模式分组
    const bemMatch = selector.match(/\.([a-z0-9][a-z0-9-]*?)(?:__|--|[^\w-]|$)/i);
    if (bemMatch) {
        const name = bemMatch[1];
        if (!componentStyles[name]) componentStyles[name] = [];
        if (!componentStyles[name].includes(block)) {
            componentStyles[name].push(block);
        }
    }
}
```

### 3. 大小分级的策略

| CSS 大小 | 策略 | 说明 |
|---------|------|------|
| < 100KB | 完整 postcss 解析 | 质量最高 |
| 100KB - 1MB | 流式解析 + BEM 分组 | 选择性解析 |
| > 1MB | 仅提取 CSS 变量 | 最小工作量 |

### 变更文件

| 文件 | 变更 |
|------|------|
| `src/transform/css-analyzer.ts` | 新增流式解析，保留 postcss 作为后备 |

### 验收标准

- [ ] 大型 CSS 文件不会导致内存问题
- [ ] CSS 变量提取在任何策略下都正确
- [ ] BEM 组件分组在小/中型 CSS 下与原有结果一致
- [ ] 所有现有测试通过
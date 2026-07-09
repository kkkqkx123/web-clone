# 08 — 内存预算与降级策略

## 问题

当前系统没有任何内存保护机制。当处理大型 SPA 页面时，组件提取阶段会：

1. 用 `linkedom` 解析整个 HTML → 内存膨胀
2. 用 `postcss` 解析整个 CSS Bundle → 内存膨胀
3. 用 `@babel/parser` 解析整个 JS Bundle → 内存爆炸
4. 最终 `FATAL ERROR: Ineffective mark-compacts near heap limit`

**核心问题**：没有内存预算，没有优雅降级，只有进程崩溃。

## 方案：三层降级保护

### 第一层：轻量预检（Cheap Precheck）

在进入组件提取前，快速评估页面大小，决定是否启用降级：

```typescript
interface MemoryBudget {
    // 各阶段内存预算（字节）
    htmlParseBudget: number;    // HTML 解析预算
    cssParseBudget: number;     // CSS 解析预算
    jsParseBudget: number;      // JS 解析预算
    // 降级策略
    htmlStrategy: 'full' | 'streaming' | 'skip';
    cssStrategy: 'full' | 'head' | 'skip';
    jsStrategy: 'full' | 'head' | 'skip';
}

function assessMemoryBudget(html: string, css: string, js: string): MemoryBudget {
    const budget: MemoryBudget = {
        htmlParseBudget: 200 * 1024 * 1024,  // 200MB
        cssParseBudget: 100 * 1024 * 1024,   // 100MB
        jsParseBudget: 100 * 1024 * 1024,    // 100MB
        htmlStrategy: 'full',
        cssStrategy: 'full',
        jsStrategy: 'full',
    };

    // HTML 评估：基于原始大小估算
    if (html.length > 2 * 1024 * 1024) {       // >2MB
        budget.htmlStrategy = 'streaming';
    }
    if (html.length > 10 * 1024 * 1024) {      // >10MB
        budget.htmlStrategy = 'skip';
    }

    // CSS 评估
    if (css.length > 500 * 1024) {              // >500KB
        budget.cssStrategy = 'head';            // 仅分析前 5000 条规则
    }
    if (css.length > 5 * 1024 * 1024) {        // >5MB
        budget.cssStrategy = 'skip';
    }

    // JS 评估
    if (js.length > 1 * 1024 * 1024) {          // >1MB
        budget.jsStrategy = 'head';             // 仅分析前 1000 个 AST 节点
    }
    if (js.length > 5 * 1024 * 1024) {          // >5MB
        budget.jsStrategy = 'skip';
    }

    return budget;
}
```

### 第二层：运行时监控（Runtime Watchdog）

```typescript
class MemoryWatchdog {
    private readonly maxMemoryMB: number;
    private readonly warningThreshold: number;
    private warningLogged = false;

    constructor(maxMemoryMB: number = 1536) { // 默认 1.5GB
        this.maxMemoryMB = maxMemoryMB;
        this.warningThreshold = maxMemoryMB * 0.8;
    }

    check(): 'ok' | 'warning' | 'critical' {
        const usage = process.memoryUsage().heapUsed / 1024 / 1024;
        if (usage > this.maxMemoryMB) return 'critical';
        if (usage > this.warningThreshold) {
            if (!this.warningLogged) {
                console.warn(`⚠ Memory warning: ${Math.round(usage)}MB used`);
                this.warningLogged = true;
            }
            return 'warning';
        }
        return 'ok';
    }

    // 在关键操作间调用，检查是否接近极限
    async guard(operation: () => Promise<void>): Promise<boolean> {
        const status = this.check();
        if (status === 'critical') {
            console.warn('⚠ Memory budget exceeded, skipping remaining analysis');
            return false;
        }
        await operation();
        return true;
    }
}
```

### 第三层：流水线降级（Pipeline Degradation）

在 `assembler.ts` 中集成降级逻辑：

```typescript
// assembler.ts — 组件提取阶段
if (options.extractComponents) {
    // 1. 快速评估
    const css = extractInlineCss(html) + extractCssFromAssets(assets);
    const js = extractInlineJs(html) + extractJsFromAssets(assets);
    const budget = assessMemoryBudget(html, css, js);

    // 2. 记录降级决策
    const degradations: string[] = [];
    if (budget.htmlStrategy !== 'full') degradations.push(`HTML: ${budget.htmlStrategy}`);
    if (budget.cssStrategy !== 'full') degradations.push(`CSS: ${budget.cssStrategy}`);
    if (budget.jsStrategy !== 'full') degradations.push(`JS: ${budget.jsStrategy}`);

    if (degradations.length > 0) {
        console.warn(`⚠ Memory budget: ${degradations.join(', ')} — results may be partial`);
    }

    // 3. 按降级策略执行
    const converted = await convertWithBudget(html, css, js, options, budget);
    // ... 写入输出 ...
}
```

### 降级策略矩阵

| 资源 | Full | Head | Streaming | Skip |
|------|------|------|-----------|------|
| HTML | 完整 linkedom 解析 | — | 流式 SAX 分析 | 跳过组件提取 |
| CSS | 完整 postcss 解析 | 仅前 5000 条规则 | — | 跳过 CSS 分析 |
| JS | 完整 Babel 解析 | 仅前 1000 个 AST 节点 | — | 跳过 JS 分析 |

### 与 CLI 的集成

```typescript
// 新增 CLI 选项
.option('--memory-limit <mb>', 'Memory budget in MB for component extraction', '1536')
.option('--aggressive-skip', 'Skip expensive analysis (CSS/JS) on large pages')
```

### 变更文件

| 文件 | 变更 |
|------|------|
| 新增 `src/memory-budget.ts` | 内存预算评估和降级逻辑 |
| `src/assembler.ts` | 集成降级保护 |
| `src/cli.ts` | 新增 `--memory-limit` 选项 |

### 验收标准

- [ ] 对 ModelScope 页面运行 `--extract-components` 不会 OOM
- [ ] 降级时输出清晰的警告信息
- [ ] 降级后的组件提取仍能输出部分结果（而非完全失败）
- [ ] 小页面不受影响，功能完整
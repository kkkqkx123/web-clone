# 组件转换实现原理

## 概述

`convert` 模式通过三阶段分析管道将网页分解为可复用组件：
1. **分析**: 独立分析 HTML、CSS、JavaScript 结构
2. **关联**: 将三维数据关联，推断组件
3. **生成**: 生成组件规范和迁移指南

## 阶段 1: 分析

### 1.1 HTML 分析 (`component-analyzer.ts`)

**目标**: 识别组件根节点和动态绑定点

**3 级优先级识别**:
1. **显式标记** (`data-component` 属性)
   - 置信度: 0.99
   - 示例: `<header data-component="Header">`

2. **语义标签** (HTML5 结构标签)
   - 标签: header, footer, nav, main, section, article
   - 置信度: 0.85
   - 原理: 这些标签天生具有组件边界语义

3. **深度兜底** (DOM 深度超过阈值)
   - 置信度: 0.65
   - 原理: 深层嵌套元素可能是重用单元
   - 动态调整: 深度越深，置信度越低

**嵌套检测**: 通过 `contains()` 检查元素包含关系，避免重复识别，构建树形结构

**动态点提取**:
```
数据绑定:  v-model, data-bind, data-binding
事件处理:  onclick, onchange, 所有 on* 属性
自定义:    data-event, data-click
条件:      v-if, v-show, data-if, data-show
```

### 1.2 CSS 分析 (`css-analyzer.ts`)

**目标**: 提取样式规则并按组件分组

**流程**:
1. PostCSS 解析 CSS 树
2. 提取 CSS 自定义属性 (`--var-name`)
3. 按选择器收集规则
4. BEM 命名规则识别组件

**选择器分组示例**:
```css
.card { ... }           → component: 'card'
.card__header { ... }   → component: 'card' (BEM)
.card--active { ... }   → component: 'card' (BEM)
```

### 1.3 JavaScript 分析 (`js-analyzer.ts`)

**目标**: 识别状态变量、事件处理器、生命周期方法

**Babel AST 遍历**:
- `VariableDeclarator`: 提取变量声明
- `ObjectProperty`: 提取对象属性（如 `data: {...}`)
- `FunctionDeclaration`: 提取函数定义
- `ArrowFunctionExpression`: 提取箭头函数
- `AssignmentExpression`: 检测状态变化
- `CallExpression`: 提取事件监听和 DOM 查询

**启发式规则库**:

| 类别 | 模式 | 示例 |
|------|------|------|
| 状态 | state, data, model, form, count, value, visible, show, active, open, current, items, list, selected | `let count = 0` |
| 事件处理 | handle, on, click, submit, change, toggle, update, delete, add, remove, fetch, load, close, open | `function handleClick()` |
| 生命周期 | init, mount, unmount, destroy, create, setup, ready, render, update | `function onMount()` |

**置信度计算**:
```javascript
baseScore = 0.3
patternMatches = 多少个模式匹配
confidence = min(1.0, baseScore + patternMatches * 0.2)
```

**状态变化检测**:
- 直接赋值: `state.count = 5`
- 增量: `state.count++`
- 复合赋值: `state.count += 1`

## 阶段 2: 关联 (`correlator.ts`)

**目标**: 将 HTML、CSS、JS 数据关联为组件

### 2.1 CSS 匹配

**策略**（从高到低优先级）:
1. 精确 class 匹配
2. BEM block 名称匹配
3. ID 匹配
4. Tag 名称匹配
5. 选择器组合匹配

**置信度计算**:
```
每种匹配类型: +0.2 ~ 0.3 置信度
最终: min(1.0, 所有匹配的置信度之和)
```

### 2.2 JS 匹配

**策略**:
1. 按元素 id/class/tag 查找相关的状态、方法、事件
2. 名称相似性匹配（例如 `counter` 元素与 `count` 变量）
3. 如无精确匹配，包含所有 JS 逻辑

### 2.3 组件类型推断

```javascript
if (有状态 && 有事件处理) → 'stateful'
else if (有状态 || 有事件处理) → 'presentational'
else → 'unknown'
```

### 2.4 最终置信度

```javascript
matchConfidence = (
  HTML识别置信度 +
  CSS匹配置信度 +
  逻辑匹配分数
) / 3
```

## 阶段 3: 生成 (`generator.ts`)

**目标**: 生成组件规范 (ComponentSpec) 和迁移元数据 (ComponentManifest)

### 3.1 优先级计算

```javascript
if (组件类型 === 'stateful' && 状态数 > 3) → 'high'
else if (组件类型 === 'stateful') → 'medium'
else if (组件类型 === 'presentational') → 'medium'
else → 'low'
```

### 3.2 工作量估计

```javascript
复杂度 = 状态数 * 0.5 + 方法数 * 0.3 + 事件数 * 0.2

if (复杂度 ≤ 1) → '1h'
else if (复杂度 ≤ 2.5) → '2h'
else if (复杂度 ≤ 5) → '4h'
else → '8h+'
```

### 3.3 迁移建议

根据组件类型和复杂度生成的建议示例：

**有状态组件**:
- "提取 N 个状态变量为响应式引用"
- "映射事件处理器到组件方法"
- "考虑使用计算属性"

**展示组件**:
- "转换为纯函数组件"
- "使用 Props 接收数据"

## 数据流

```
HTML ──┐
       ├→ 分析 ──→ 关联 ──→ 生成 ──→ 输出
CSS  ──┤       (三维)
       │
JS ───┘

输入: HTML/CSS/JS 文本
处理: 并行分析 + 串行关联 + 串行生成
输出: 组件目录结构 + 清单元数据
```

## 性能优化

| 优化策略 | 效果 |
|---------|------|
| 去重处理 | 避免重复处理相同 URL |
| 树形存储 | 避免平面列表中的重复 |
| 缓存关联 | 避免重复遍历匹配 |
| 增量分析 | (可选) 仅处理变化的部分 |

**基准**: 50 个组件 < 30ms

## 容错机制

- **Babel 错误恢复**: `errorRecovery: true` 启用容错模式
- **CSS 解析失败**: 返回空结果，继续流程
- **类型推断失败**: 记录为 TODO，不中断流程
- **低置信度告警**: < 0.6 置信度时添加警告

## 扩展性

### 添加新的识别模式

1. **状态模式** (js-analyzer.ts):
   ```javascript
   patterns: ['state', 'data', ...新模式...]
   ```

2. **事件模式** (js-analyzer.ts):
   ```javascript
   patterns: ['handle', 'on', ...新模式...]
   ```

3. **CSS 匹配** (correlator.ts):
   ```javascript
   // 添加新的选择器匹配策略
   if (selector.includes(...)) { ... }
   ```

### 添加新的分析器

1. 创建 `src/transform/xxx-analyzer.ts`
2. 实现分析函数，返回标准结果
3. 在 `converter.ts` 中集成
4. 在 `correlator.ts` 中关联

## 配置选项

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `componentDepth` | 4 | DOM 深度兜底阈值 |
| `frameworkHint` | - | 框架提示 (vue/react/svelte) |
| `extractLogic` | true | 是否提取 JS 逻辑 |

## 常见问题

**Q: 如何提高识别精度?**
A: 
- 在 HTML 中使用 `data-component` 显式标记
- 使用语义 HTML5 标签
- 遵循命名规范 (BEM)

**Q: 如何定制识别规则?**
A: 修改 `js-analyzer.ts` 中的模式数组，或通过 CLI 选项传递框架提示

**Q: 低置信度组件怎么办?**
A: 检查 manifest.json 中的 migration.todos，手动审查并补充注释

**Q: 嵌套组件如何处理?**
A: 自动检测并构建树形结构，每个组件在单独目录中，支持递归包含

## 参考

- Babel AST: https://babel.dev/docs/babel-types
- PostCSS: https://postcss.org/
- linkedom: https://github.com/WebReflection/linkedom

# Codegen 模块改进方案

> 基于对 `packages/codegen` 模块的完整审查，列出所有缺陷、改进建议，并评估是否需要引入模板渲染引擎。

---

## 现状总览

### 模块结构

```
packages/codegen/
  index.ts                  ← FrameworkCodeGenerator（主调度器）
  base-generator.ts         ← BaseFrameworkGenerator（抽象基类）
  framework-rules.ts        ← 框架规则（转换函数、CSS 策略、依赖映射）
  config-generator.ts       ← 构建配置生成（Vite、tsconfig、index.html）
  shared-logic-extractor.ts ← 跨组件共享逻辑抽取（API/工具/常量）
  vue-generator.ts          ← Vue 3 Composition API 生成器
  react-generator.ts        ← React 18 FC + hooks 生成器
  angular-generator.ts      ← Angular 17 standalone 组件生成器
  svelte-generator.ts       ← Svelte 4 SFC 生成器
  jquery-generator.ts       ← jQuery 类组件生成器
```

### 框架差异处理矩阵

| 维度 | 方案 | 评价 |
|------|------|------|
| 模板绑定 | `data-binding` → 正则替换为各框架语法 | ✅ 可工作，但正则脆弱 |
| 事件绑定 | `data-event` → 正则替换 | ✅ 可工作 |
| 条件渲染 | `data-condition` → 正则替换 | ⚠️ 部分框架（React）为占位符 |
| 状态声明 | 各 Generator 独立实现 | ✅ 正确区分 |
| CSS 处理 | `cssStrategies` 对象分发 | ✅ 合理抽象 |
| 构建配置 | `ConfigGenerator` 独立类 | ✅ 合理分离 |
| 共享逻辑 | `SharedLogicExtractor` 框架无关 | ✅ 正确 |

---

## 一、需要修复的缺陷（按严重程度排序）

### B1: `GeneratedFramework.shared` 类型缺少 `constants` 字段

**位置**：`packages/types/src/index.ts:104`

```typescript
// 当前类型定义
export interface GeneratedFramework {
  shared?: {
    api?: string;       // ✓ 有
    utils?: string;     // ✓ 有
    // constants 缺失！← bug
  };
}
```

但 `FrameworkCodeGenerator.extractSharedLogic()` 实际生成并返回 `constants`：

```typescript
// packages/codegen/src/index.ts:121
result.constants = SharedLogicExtractor.extractConstants(specs);
```

**影响**：TypeScript 类型隐藏了运行时存在的字段，消费者无法安全访问 `constants`。

**修复**：在 `GeneratedFramework.shared` 中添加 `constants?: string`。

---

### B2: React 条件渲染为伪实现

**位置**：`packages/codegen/src/framework-rules.ts:62-63`

```typescript
conditionalBinding: (condition: string): string =>
  `{${condition} && /* content */}`
```

**问题**：`data-condition="count > 0"` 被替换为 `{count > 0 && /* content */}`，只替换了属性名，没有包裹元素内容。实际生成的 JSX 中元素结构被破坏。

**对比其他框架**：

| 框架 | 当前处理 | 是否正确 |
|------|----------|----------|
| Vue | `v-if="cond"`（属性替换，Vue 在元素级处理条件） | ✅ 正确 |
| Angular | `*ngIf="cond"`（属性替换） | ✅ 正确 |
| Svelte | 正则包裹为 `{#if cond}...{/if}` | ✅ 正确（但正则脆弱） |
| React | 占位符 | ❌ 不可用 |

**修复**：React 的条件渲染需要在 `mapTemplate` 中像 Svelte 一样包裹元素，生成 `{condition && (<div>...</div>)}` 或三元表达式。

---

### B3: Svelte `data-condition` 正则匹配错误

**位置**：`packages/codegen/src/svelte-generator.ts:101`

```javascript
// 当前正则（错误）
/<([\w-]+)(\s[^>]*?)data-condition="([^"]*)"([^>]*?)>((?:(?:<\/\1>)[\s\S])*)<\/\1>/g
```

**问题**：
1. `((?:(?:<\/\1>)[\s\S])*)` 是贪婪的，会跨越到最远的相同标签闭合
2. 对于 `<div data-condition="x"><div>inner</div></div>`，会匹配到错误的 `</div>`
3. 不支持嵌套的相同标签

**修复方法（二选一）**：

- **方案 A**：用栈结构逐字符解析，找到正确的匹配闭合位置
- **方案 B**：引入简易 DOM 解析，遍历节点树处理 `data-condition`

---

### B4: JSON.stringify(s.initial) 对 undefined 异常

**位置**：全部 5 个 Generator 的 `mapState` 方法

```typescript
return `const ${s.name} = ref<${s.type}>(${JSON.stringify(s.initial)})`;
```

当 `s.initial === undefined` 时，`JSON.stringify(undefined)` 返回 `undefined`（非字符串），导致生成：

```javascript
const count = ref<number>(undefined)  // 语法错误！
```

**修复**：在所有 Generator 的 `mapState` 中添加兜底处理：

```typescript
const initialValue = s.initial !== undefined ? JSON.stringify(s.initial) : 'undefined';
```

---

### B5: Angular 缺少 `app.config.ts`

**位置**：`packages/codegen/src/index.ts:381-387`

```typescript
// generateMainEntry 中 Angular 分支引用 appConfig
import { appConfig } from './app.config';
```

但 `ConfigGenerator` 没有任何方法生成 `app.config.ts`。Angular 17 standalone 应用需要此文件来配置 `bootstrapApplication`。

**修复**：在 `ConfigGenerator` 中添加 `generateAngularAppConfig()` 方法，生成：

```typescript
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';

export const appConfig: ApplicationConfig = {
  providers: [
    // Add your providers here
  ],
};
```

并在 `writeApplicationDrafts`（`convert.ts`）中写入该文件。

---

### B6: Vue 生命周期导入不完整

**位置**：`packages/codegen/src/vue-generator.ts:146-149`

```typescript
const lifecycleMethods = new Set(['mounted', 'unmounted', 'created', 'destroyed', 'init', 'destroy']);
if (spec.logic?.methods?.some((m) => lifecycleMethods.has(m.name))) {
  imports.add('onMounted');
  imports.add('onUnmounted');
}
```

**问题**：
1. 缺失：`onBeforeMount`, `onBeforeUnmount`, `onUpdated`, `onBeforeUpdate`, `onActivated`, `onDeactivated`
2. `created`/`destroyed` 在 Vue 3 `<script setup>` 中不存在（Options API 才有）
3. 检测到任意生命周期方法就同时添加 `onMounted` + `onUnmounted`，而不是按需导入

**修复**：建立完整的生命周期方法映射表：

```typescript
const lifecycleMap: Record<string, string> = {
  mounted: 'onMounted',
  beforeMount: 'onBeforeMount',
  unmounted: 'onUnmounted',
  beforeUnmount: 'onBeforeUnmount',
  updated: 'onUpdated',
  beforeUpdate: 'onBeforeUpdate',
  activated: 'onActivated',
  deactivated: 'onDeactivated',
};
// 按实际出现的生命周期导入
```

---

### B7: React `generateImports` 与 `collectImports` 逻辑重复

**位置**：`packages/codegen/src/react-generator.ts`

`collectImports` 已经判断了需要的导入（`useState`, `useEffect`, `useMemo`），但 `generateImports` 不直接使用收集结果，而是再判断一遍：

```typescript
// collectImports 收集了 ['React', 'useState', ...]
// generateImports 又检查一遍：
if (imports.some((i) => i.includes('useState'))) {
  reactImports.add('useState');
}
```

**修复**：让 `generateImports` 直接使用 `collectImports` 返回的名称来构造 import 语句，消除重复判断。

---

### B8: JSX 属性转换不完整

**位置**：`packages/codegen/src/framework-rules.ts:327-328`

```typescript
htmlToJsx: (html: string): string => {
  return html.replace(/class=/g, 'className=');
},
```

仅处理了 `class` → `className`，缺失：

| HTML 属性 | JSX 属性 |
|-----------|----------|
| `class` | `className` | ✅ 已处理 |
| `for` | `htmlFor` | ❌ 缺失 |
| `tabindex` | `tabIndex` | ❌ 缺失 |
| `style="..."` | `style={{...}}` | ❌ 缺失 |
| SVG 属性如 `stroke-width` | `strokeWidth` | ❌ 缺失 |
| `checked/selected/disabled` | 保持一致但需 boolean 处理 | ❌ 缺失 |

**修复**：扩充 `htmlToJsx` 中的转换映射表。

---

### B9: Angular 组件名称转选择器逻辑脆弱

**位置**：`packages/codegen/src/index.ts:236-237`

```typescript
// generateAngularApp 中
c.name.replace(/([A-Z])/g, '-$1').toLowerCase().slice(1)
```

对于驼峰命名如 `MyComponent` 正确 → `my-component`。但对于：
- 已经包含连字符的名称 → 双连字符（`my--component`）
- 单字符组件名 → 空字符串（`X` → `.slice(1)` 为空）

**修复**：使用 `pascalToKebab` 工具函数：

```typescript
function pascalToKebab(str: string): string {
  return str.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '');
}
```

---

## 二、架构改进建议

### P1: 引入 Options API 生成选项（Vue）

**需求**：当前仅支持 Vue 3 `<script setup>`（Composition API），需要支持 Options API。

**实现方案**：

1. **扩展类型**：在 `FrameworkCodeGenOptions` 中新增字段：
   ```typescript
   export interface FrameworkCodeGenOptions {
     framework?: CodegenFramework;
     typescript?: boolean;
     cssModules?: boolean;
     generateDrafts?: boolean;
     extractSharedLogic?: boolean;
     // 新增
     vueApi?: 'composition' | 'options';  // 默认 'composition'
   }
   ```

2. **创建 `VueOptionsGenerator`**：继承 `BaseFrameworkGenerator`，在 `vue-generator.ts` 中新增类，或直接扩展 `VueGenerator`。

Options API 与 Composition API 的主要差异：

| 维度 | `<script setup>` | Options API |
|------|------------------|-------------|
| 状态声明 | `const count = ref(0)` | `data() { return { count: 0 } }` |
| 方法 | `const fn = () => {}` | `methods: { fn() {} }` |
| 生命周期 | `onMounted(() => {})` | `mounted() {}` |
| 计算属性 | `const double = computed(...)` | `computed: { double() {} }` |
| 模板 | 同 | 同 |

建议实现为 `VueGenerator` 的内部选项，在 `generate()` 中根据 `vueApi` 分支：

```typescript
class VueGenerator extends BaseFrameworkGenerator {
  generate(spec, options) {
    if (options.vueApi === 'options') {
      return this.generateOptionsAPI(spec, options);
    }
    return this.generateCompositionAPI(spec, options);
  }
}
```

---

### P2: 是否引入正式的模板渲染引擎

#### 现状分析

当前使用 **正则替换** 处理模板转换。主要痛点：

| 痛点 | 影响程度 |
|------|----------|
| 嵌套标签的条件渲染（Svelte） | ❌ 功能性 bug |
| React 条件渲染占位符 | ❌ 不可用 |
| 属性值中的特殊字符（引号、尖括号） | ⚠️ 潜在 bug |
| 自定义元素 / Web Component | ⚠️ 可能匹配错误 |
| 维护复杂度（正则难于理解和调试） | ⚠️ 开发效率 |

#### 选项对比

| 方案 | 复杂度 | 可靠性 | 构建体积增加 | 维护性 |
|------|--------|--------|-------------|--------|
| **A. 维持正则，修补缺陷** | 低 | 中 | 0 | 低 |
| **B. 使用 `parse5` 做 DOM 遍历替换** | 中 | 高 | ~50KB | 高 |
| **C. 使用 `@babel/parser` 做 JSX AST** | 高 | 高 | ~200KB | 中 |
| **D. 使用 `jsdom` 构建 DOM 树** | 中 | 高 | ~500KB | 高 |

#### 推荐方案：**方案 B（parse5）**

**理由**：
1. `parse5` 是纯 TypeScript HTML 解析器，<50KB gzip，无依赖
2. 它已经在 `@web-clone/core` 的依赖链中（`jsdom` 依赖 `parse5`）
3. 可以精确构建 DOM 树，支持遍历节点、修改属性、包裹删除节点
4. 与正则相比，根本解决了嵌套匹配问题

**替换范围**：

```
正则替换 → parse5 遍历（仅在 codegen 的 template 转换中使用）
├── data-binding   → 设置属性/插值
├── data-event     → 设置事件绑定属性
├── data-condition → 包裹节点（React/Svelte）或替换属性（Vue/Angular）
└── cleanAttributes→ 删除 data-* 属性
```

**引入成本**：
- 在 `packages/codegen` 中添加 `parse5` 依赖
- 改写 `mapTemplate` 方法为：`parse5.parseFragment(html)` → 树遍历 → `parse5.serialize(node)`
- 新增 `packages/codegen/src/template-converter.ts`，封装 DOM 树转换逻辑
- 各 Generator 的 `mapTemplate` 注入框架特定的转换规则

**不需要切换的路径**：
- `ConfigGenerator`：生成的是全新代码，没有模板转换需求
- `SharedLogicExtractor`：处理的是 JS 代码分析，使用 `@babel/parser` 已经正确
- 各 Generator 的 `mapState`/`mapEvents`：生成的是代码字符串，不需要 DOM 解析

#### 不推荐方案说明

| 方案 | 不推荐理由 |
|------|-----------|
| C（Babel AST） | 模板是 HTML，不是 JSX/JS；Babel 解析 JSX 需要配置，且 SVG/自定义元素处理复杂 |
| D（jsdom） | 太重，codegen 不应依赖浏览器运行时模拟 |

---

## 三、分阶段实施计划

### 阶段 1：修复 Bug（高优先级，1-2天）

| 编号 | 任务 | 风险 | 工作量 |
|------|------|------|--------|
| B1 | `GeneratedFramework.shared` 添加 `constants` 字段 | 低 | 10min |
| B2 | React 条件渲染完整实现 | 中 | 4h |
| B3 | Svelte data-condition 正则修复 | 中 | 4h |
| B4 | 所有 Generator 的 `JSON.stringify` 添加 `undefined` 兜底 | 低 | 30min |
| B5 | Angular 添加 `app.config.ts` 生成 | 低 | 1h |
| B6 | Vue 生命周期导入映射表补全 | 低 | 30min |
| B7 | React `generateImports` 简化 | 低 | 1h |
| B8 | JSX 属性转换补全 | 中 | 2h |
| B9 | Angular 选择器生成修复 | 低 | 30min |

### 阶段 2：引入 Vue Options API（中优先级）

| 编号 | 任务 | 工作量 |
|------|------|--------|
| P1-1 | `FrameworkCodeGenOptions` 添加 `vueApi` 字段 | 10min |
| P1-2 | 在 `VueGenerator` 中添加 Options API 分支 | 4h |
| P1-3 | 补充测试（`__tests__/vue-options-generator.test.ts`） | 2h |

### 阶段 3：引入 parse5 模板转换引擎（中优先级）

| 编号 | 任务 | 工作量 |
|------|------|--------|
| P3-1 | 新增 `packages/codegen/src/template-converter.ts` | 6h |
| P3-2 | 实现 `parse5` 树遍历 + 框架规则注入 | 4h |
| P3-3 | 重构 5 个 Generator 的 `mapTemplate` 使用新引擎 | 4h |
| P3-4 | 补充测试（复杂嵌套、边界情况） | 3h |
| P3-5 | 验证所有现有测试仍然通过 | 1h |

---

## 四、执行顺序建议

```
阶段 1 (Bug 修复) ───── → 阶段 3 (parse5) ───── → 阶段 2 (Vue Options)
     │
     └── 建议先做 B1/B4/B5/B6/B7/B9（低风险快速修复）
     └── B2/B3/B8 可拆入阶段 3 前做
```

**建议**：
- **立即执行**：B1（类型修复）、B4（undefined 兜底）、B5（Angular config）、B6（Vue 生命周期）、B7（React 重复逻辑）、B9（Angular 选择器）
- **阶段 1 剩余**：B2（React 条件）、B3（Svelte 正则）、B8（JSX 属性）— 涉及逻辑改动，建议先写测试再改
- **阶段 3（parse5）** 是投入最大但收益最高的架构改进，可以一次性解决正则替换的所有问题，建议与 B2/B3 合并规划
- **阶段 2（Vue Options）** 独立，可以随时插入

---

## 五、验收标准

### 阶段 1 验收

- [ ] `pnpm build` 通过
- [ ] `pnpm test` 全部通过（codegen + core）
- [ ] React 条件渲染生成正确的 JSX 条件结构
- [ ] Svelte 嵌套 `data-condition` 正确处理
- [ ] Angular 生成项目可 `npm install && npm run dev`
- [ ] 所有生成器正确处理 `undefined` 初始值
- [ ] Vue 生命周期 import 按需生成

### 阶段 3 验收

- [ ] `parse5` 替代所有模板转换中的正则
- [ ] 复杂嵌套标签正确处理
- [ ] 所有现有测试通过（不需要修改测试期望值）
- [ ] 构建体积增量不超过 80KB（gzip ~15KB）

### 阶段 2 验收

- [ ] `vueApi: 'options'` 生成标准的 Options API 组件
- [ ] `vueApi: 'composition'`（默认）行为不变
- [ ] 测试覆盖两种模式

---

## 六、相关文件索引

| 文件 | 行数 | 说明 |
|------|------|------|
| `packages/codegen/src/base-generator.ts` | 214 | 抽象基类 |
| `packages/codegen/src/framework-rules.ts` | 371 | 框架转换规则 + CSS 策略 |
| `packages/codegen/src/vue-generator.ts` | 154 | Vue 生成器 |
| `packages/codegen/src/react-generator.ts` | 235 | React 生成器 |
| `packages/codegen/src/angular-generator.ts` | 128 | Angular 生成器 |
| `packages/codegen/src/svelte-generator.ts` | 147 | Svelte 生成器 |
| `packages/codegen/src/jquery-generator.ts` | 141 | jQuery 生成器 |
| `packages/codegen/src/index.ts` | 576 | 主调度器 |
| `packages/codegen/src/config-generator.ts` | 208 | 构建配置生成 |
| `packages/codegen/src/shared-logic-extractor.ts` | 457 | 共享逻辑抽取 |
| `packages/types/src/index.ts` | 107 | 共享类型定义 |

---

**文档状态**：初稿  
**编写日期**：2026-07-15  
**关联文档**：[10-framework-module-gap-analysis.md](./10-framework-module-gap-analysis.md)
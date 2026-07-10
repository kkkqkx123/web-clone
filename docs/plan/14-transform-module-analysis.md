# Transform 模块深层分析报告

## 概述

对 `src/transform/` 模块（component-analyzer.ts、css-analyzer.ts、js-analyzer.ts、correlator.ts、generator.ts、framework-codegen/）进行全面的逻辑、性能、安全分析。

---

## 高严重性（3 个）

### L9.1 Angular `collectImports` — 错误导入 FormsModule

**文件**: [angular-generator.ts:128](file:///workspace/web-clone/src/transform/framework-codegen/angular-generator.ts#L128)

```typescript
if (spec.template.includes('data-binding')) {
  imports.push("import { FormsModule } from '@angular/core';");
}
```

**问题**: Angular 的 `{{ variable }}` 插值绑定是内置行为，无需 `FormsModule`。`FormsModule` 仅用于 `[(ngModel)]` 双向绑定。这会导致生成的 Angular 组件包含不必要的 import。

**修复**: 移除该条件，或仅在检测到 `[(ngModel)]` 模式时添加。

### L9.2 Angular `collectImports` — 运算符优先级 bug

**文件**: [angular-generator.ts:132](file:///workspace/web-clone/src/transform/framework-codegen/angular-generator.ts#L132)

```typescript
if (spec.logic?.state?.length ?? 0 > 0) {
```

**问题**: `??` 优先级低于 `>`，实际解析为 `spec.logic?.state?.length ?? (0 > 0)`，即 `spec.logic?.state?.length ?? false`。当 `length` 为 `0` 时，`0 ?? false` 返回 `0`（falsy），条件永远不成立。导致 Angular 组件即使有状态也认为没有状态。

**修复**: 改为 `(spec.logic?.state?.length ?? 0) > 0`。

### L9.3 Svelte `data-condition` 正则脆弱

**文件**: [svelte-generator.ts:88](file:///workspace/web-clone/src/transform/framework-codegen/svelte-generator.ts#L88)

```typescript
template = template.replace(
  /<([\w-]+)(\s[^>]*?)data-condition="([^"]*)"([^>]*?)>([\s\S]*?)<\/\1>/g,
  (_, tag, pre, condition, post, content) => {
    return `{#if ${condition.trim()}}<${tag}${pre}${post}>${content}</${tag}> {/if}`;
  }
);
```

**问题**:
1. `[\s\S]*?` 懒惰量词在嵌套同标签元素时匹配到错误的闭合标签
2. 不支持自闭合标签（如 `<img data-condition="show">`）
3. 正则写死标签名匹配，对 Vue 式 `data-condition` 使用场景过于局限

**修复**: 改用更稳健的基于属性的匹配，或拆分多步处理。

---

## 中严重性（4 个）

### M9.1 `extractConstants` 提取所有字符串字面量为常量

**文件**: [shared-logic-extractor.ts:110](file:///workspace/web-clone/src/transform/framework-codegen/shared-logic-extractor.ts#L110)

```typescript
const stringMatches = code.match(/'[^']*'|"[^"]*"/g) || [];
stringMatches.forEach((match: string, idx: number) => {
  if (match.length > 10 && !match.includes(' ')) {
    const name = `CONFIG_${idx}`;
    constants.set(name, match);
  }
});
```

**问题**: 提取所有长度 > 10 且无空格的字符串字面量作为配置常量，包括错误消息、CSS 类名、API 路径等。生成无意义的常量名 `CONFIG_0`、`CONFIG_1`，对用户无实际帮助。

**修复**: 缩小范围，仅提取明确符合配置模式的字符串（如 URL 路径、环境变量名），或生成更有意义的常量名。

### M9.2 `cleanAttributes` 遗漏多个 data-* 属性

**文件**: [framework-rules.ts:290](file:///workspace/web-clone/src/transform/framework-codegen/framework-rules.ts#L290)

```typescript
cleanAttributes: (html: string): string => {
  return html.replace(/\s*(data-binding|data-event|data-condition)="[^"]*"/g, '');
},
```

**问题**: 只清理了 `data-binding`、`data-event`、`data-condition`，但 HTML 解析器还使用了 `data-text`、`data-if`、`data-show`、`data-click`、`data-bind` 等属性。这些属性会泄露到生成代码中。

**修复**: 使用通用匹配 `data-[\w-]+` 清理所有 data-* 属性。

### M9.3 `cssStrategies` 类型安全绕过

**文件**: [base-generator.ts:51](file:///workspace/web-clone/src/transform/framework-codegen/base-generator.ts#L51)

```typescript
const strategy = (cssStrategies as any)[this.framework];
return strategy.wrapStyles(css, options.cssModules);
```

**问题**: 使用 `as any` 绕过类型检查。React 的 `wrapStyles` 接受两个参数，其他框架只接受一个。第二个参数被静默忽略，潜在的类型错误无法被编译器发现。

**修复**: 统一 `wrapStyles` 签名，或根据 framework 类型安全分发。

### M9.4 React `convertCssToObject` 是占位符

**文件**: [framework-rules.ts:278](file:///workspace/web-clone/src/transform/framework-codegen/framework-rules.ts#L278)

```typescript
function convertCssToObject(css: string): string {
  return `/* CSS Rules (convert to inline styles as needed) */\n${css}`;
}
```

**问题**: React 的 CSS 处理是一个占位符，生成的输出只是注释加原始 CSS，不是真正的内联样式对象或 CSS Modules 导入。

**修复**: 实现真正的 CSS 到 JS 对象转换，或至少生成正确的 CSS Modules import 语句。

---

## 低严重性（4 个）

### L9.5 Vue `collectImports` 生命周期检查过于宽泛

**文件**: [vue-generator.ts:163](file:///workspace/web-clone/src/transform/framework-codegen/vue-generator.ts#L163)

只要任一方法 `kind === 'lifecycle'` 就添加 `onMounted` + `onUnmounted` 导入，但不检查具体是哪个生命周期方法名。

### L9.6 React `generateImports` 存在死代码

**文件**: [react-generator.ts:70](file:///workspace/web-clone/src/transform/framework-codegen/react-generator.ts#L70)

`collectImports` 从不添加 `'useCallback'` 或 `'useMemo'`，但 `generateImports` 中检查它们是否存在的代码永远不会匹配。

### L9.7 Angular `mapTemplate` 无操作 class 替换

**文件**: [angular-generator.ts:102](file:///workspace/web-clone/src/transform/framework-codegen/angular-generator.ts#L102)

```typescript
template = template.replace(/class="([^"]*)"/g, (_, classes) => `class="${classes}"`);
```

将 `class="..."` 替换为自身，完全无意义。

### L9.8 `matchLogic` 在 correlator 中 O(n²) 匹配

**文件**: [correlator.ts:119](file:///workspace/web-clone/src/transform/correlator.ts#L119)

`matchLogic` 对每个 state/method/event 遍历所有 refs 进行字符串 inclusion 检查。在大页面（数百组件）时可能成为瓶颈，但当前场景下影响有限。

---

## 摘要

| 问题 | 严重性 | 模块 | 描述 |
|------|--------|------|------|
| L9.1 | **高** | angular-generator | 错误导入 FormsModule |
| L9.2 | **高** | angular-generator | 运算符优先级导致状态检查永远为假 |
| L9.3 | **高** | svelte-generator | data-condition 正则脆弱 |
| M9.1 | 中 | shared-logic-extractor | 提取所有字符串为常量 |
| M9.2 | 中 | framework-rules | cleanAttributes 遗漏 data-* 属性 |
| M9.3 | 中 | base-generator | cssStrategies 类型安全绕过 |
| M9.4 | 中 | framework-rules | React CSS 转换是占位符 |
| L9.5 | 低 | vue-generator | 生命周期导入过于宽泛 |
| L9.6 | 低 | react-generator | 死代码（useCallback/useMemo） |
| L9.7 | 低 | angular-generator | 无操作 class 替换 |
| L9.8 | 低 | correlator | O(n²) 匹配 |
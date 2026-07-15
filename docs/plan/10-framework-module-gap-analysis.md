# 框架模块缺口分析与分阶段改进方案

> 基于当前 `packages/core/src/framework/` 模块的完整审查，列出所有已发现的缺口（dead code、缺失功能、测试缺失），按风险等级分阶段给出修改方案。

---

## 状态总览

### 当前框架模块结构

```
framework/
  detector.ts       ← 框架检测器（5 维度，9 种框架）
  injector.ts       ← 水合脚本注入器（CLI 层调用）
  types.ts          ← FrameworkType + FrameworkDetection + HydrationStrategy
  index.ts          ← 模块导出入口
  strategies/
    index.ts        ← 策略注册表（9 个策略，按优先级排序）
    nuxt3.ts        ← ✓ Nuxt 3
    nextjs.ts       ← ✓ Next.js
    vitepress.ts    ← ✓ VitePress
    astro.ts        ← ✓ Astro
    nuxt2.ts        ← ✓ Nuxt 2
    vue3.ts         ← ✓ Vue 3
    react18.ts      ← ✓ React 18
    angular.ts      ← ✓ Angular
    static.ts       ← ✓ 降级（静态页面）
```

### 已实现的功能矩阵

| 功能 | 状态 |
|------|------|
| 框架检测（detector.ts） | ✓ 9 种框架检测 |
| 水合脚本注入（injector.ts） | ✓ CLI 层调用 |
| 路径修复（rewritePaths） | ✓ Nuxt 3 路径修复 |
| 策略注册表 | ✓ 9 个策略，按优先级排序 |
| 公开 API 导出 | ✓ 通过 `framework/index.ts` 导出 |

---

## 缺口清单

### 类型 1：死代码（可安全移除）

#### G1: `sveltekit` 在 `FrameworkType` 中，但无检测路径、无策略

| 位置 | 详情 |
|------|------|
| `framework/types.ts:13` | `FrameworkType` 包含 `\| 'sveltekit'` |
| `framework/detector.ts` | 没有任何检测路径返回 `sveltekit` |
| `framework/strategies/` | 无对应的策略文件 |
| 状态 | **纯死代码**，从未被生产、从未被消费 |

**影响**：类型系统噪音，给维护者造成"支持 SvelteKit"的错觉。

#### G2: `ssrData` 在 `FrameworkDetection` 中，但无策略消费

| 位置 | 详情 |
|------|------|
| `framework/types.ts:28` | `ssrData: boolean` |
| `framework/detector.ts` | 5 处设置 `ssrData: true/false` |
| 所有策略 | 0 处读取 `ssrData` |
| 状态 | **死字段**，无任何策略使用 |

**影响**：字段占用空间（微小），误导阅读者以为"SSR 数据可用性"会影响行为。

#### G3: `hasAngularApp` 在 `detector.ts` 中声明但未使用

| 位置 | 详情 |
|------|------|
| `framework/detector.ts:54` | `const hasAngularApp = /ng-version\|=.../.test(html)` |
| 后续 | 该变量从未出现在任何 `return` 语句中 |
| 状态 | **死变量**，声明后从未读取 |

**根因**：Dimension 2 中声明了 `hasAngularApp`，但 Dimension 4 和 Dimension 5 都没有利用它。Angular 检测仅通过 JS 内容扫描（Dimension 4）。

---

### 类型 2：设计不一致（需统一处理）

#### G4: `angular-ssr` 在 `FrameworkType` 中，但检测器从不返回

| 位置 | 详情 |
|------|------|
| `framework/types.ts:12` | `FrameworkType` 包含 `\| 'angular-ssr'` |
| `framework/detector.ts` | 只返回 `'angular'` |
| `framework/strategies/angular.ts:25` | `matches` 中检查 `d.framework === 'angular-ssr'`，但从不发生 |
| 状态 | **半死代码**：strategy 的 matches 覆盖了它，但没有任何检测路径产生它 |

**两种修复方向**：
- A) 从 `FrameworkType` 移除 `angular-ssr`，让 angular 策略统一处理
- B) 在 detector 中添加 `angular-ssr` 检测路径（如 `ng-version` 属性 + 特定 SSR 标记）

---

### 类型 3：缺失检测路径（需补充实现）

#### G5: 缺少 `sveltekit` 检测路径

| 位置 | 详情 |
|------|------|
| `framework/types.ts` | `FrameworkType` 包含 `sveltekit` |
| `framework/detector.ts` | 无任何检测路径返回 `sveltekit` |
| 状态 | **缺失实现**：有类型无检测 |

**建议检测信号**：
- `window.__SVELTEKIT__` 或 `window.__svelte` (如有)
- `<meta generator="SvelteKit">`
- JS 内容中的 `adapter` 相关字符串
- `#svelte` 挂载点

#### G6: 缺少 `angular-ssr` 检测路径（如选方案 B）

| 位置 | 详情 |
|------|------|
| `framework/detector.ts` | 已有 `hasAngularApp` 变量但未使用 |
| 状态 | **缺失实现**：数据已收集但未接入检测 |

**建议检测信号**：
- `hasAngularApp`（`ng-version` 或 `ng-app` 属性）→ 返回 `angular`（低置信度）
- `html.includes('ng-server-context')` → 返回 `angular-ssr`（SSR 特有标记）

---

### 类型 4：测试缺失（需补充）

#### G7: 无 `detectFramework` 直接测试

| 位置 | 详情 |
|------|------|
| 当前测试 | 仅通过 `cli-hydration.test.ts` 间接测试 |
| 覆盖的框架 | 3/9（nuxt2, nuxt3, vue3） |
| 未覆盖的框架 | 6/9（nextjs, vitepress, astro, react18, angular, static） |
| 状态 | **严重缺失** |

**建议测试用例**：
- 每个框架类型的标准 HTML 输入 → 验证正确的 `framework` 输出
- 无框架的纯 HTML → 验证 `unknown`
- 多个框架标记同时存在 → 验证优先级正确
- `jsContents` 参数传递 → 验证 JS 扫描检测

#### G8: 无策略单元测试

| 位置 | 详情 |
|------|------|
| 当前测试 | 0 个策略有直接单元测试 |
| `matches` 函数 | 9/9 未测试 |
| `generateScript` 输出 | 9/9 未直接测试（仅通过集成测试间接覆盖 3 个） |
| 状态 | **缺失** |

**建议测试用例**：
- 每个策略的 `matches` 正确识别/拒绝检测结果
- `generateScript` 输出包含正确的框架标识字符串
- `generateScript` 输出包含正确的挂载点选择器

#### G9: 无 `rewritePaths` 测试

| 位置 | 详情 |
|------|------|
| 当前测试 | 0 个测试覆盖路径修复逻辑 |
| `nuxt3Strategy.rewritePaths` | 无测试验证 Unicode 编码和字面量的替换 |
| 状态 | **缺失** |

**建议测试用例**：
- 包含 `window.__NUXT__` 和 `assetsPath:"/_nuxt/"` 的 DOM → 验证替换为 `"./assets/_nuxt/"`
- 包含 Unicode 编码的 `assetsPath:"\\u002F_nuxt\\u002F"` → 验证替换
- 不包含 `assetsPath` 的 `window.__NUXT__` → 验证无替换
- 非 Nuxt 框架的 Document → 验证无改动

---

### 类型 5：集成边界问题（需确认）

#### G10: `injector.ts` 中检测框架时不传递 `jsContents`

| 位置 | 详情 |
|------|------|
| `injector.ts:42` | `detectFramework(html)` 未传 `jsContents` |
| `cli.ts` | 调用 `injectHydrationScript({ htmlPath, jsContents })` 时传了 |
| 风险 | 部分检测（如 Vue 3 的 `createSSRApp`）依赖 JS 内容扫描，无 `jsContents` 时精度下降 |

**影响**：CLI 中已正确传递 `jsContents`，但若其他调用者直接使用 `injector.ts` 而不传 `jsContents`，Vue 3 和 React 18 检测可能失败。这不是 bug，但应在文档中注明。

---

## 分阶段修改方案

### 阶段 1：安全清理（立即执行，无风险）

**目标**：移除死代码，消除类型系统噪音。

| 任务 | 文件 | 改动 | 风险 |
|------|------|------|------|
| 1.1 | `framework/types.ts` | 从 `FrameworkType` 移除 `'sveltekit'` | 低 — 无任何代码路径产生此值 |
| 1.2 | `framework/detector.ts` | 删除 `hasAngularApp` 变量声明 | 低 — 声明后从未读取 |
| 1.3 | `framework/types.ts` | 从 `FrameworkDetection` 移除 `ssrData` 字段 | 低 — 无策略消费 |
| 1.4 | `framework/detector.ts` | 移除所有 `ssrData: true/false` 返回值 | 低 — 与 1.3 配套 |

**清理前**：

```typescript
// FrameworkType 11 个有效值 + 1 个死代码
type FrameworkType = 'nuxt2' | 'nuxt3' | 'vitepress' | 'vue3'
  | 'nextjs' | 'react18'
  | 'angular' | 'angular-ssr'    // ← angular-ssr 待定
  | 'sveltekit'                   // ← 死代码
  | 'astro'
  | 'static' | 'unknown';

// FrameworkDetection 4 个字段 + 1 个死字段
interface FrameworkDetection {
  framework: FrameworkType;
  confidence: number;
  appElement: string | null;
  ssrData: boolean;               // ← 死字段
  markers: string[];
}
```

**清理后**：

```typescript
type FrameworkType = 'nuxt2' | 'nuxt3' | 'vitepress' | 'vue3'
  | 'nextjs' | 'react18'
  | 'angular' | 'angular-ssr'    // ← 待阶段 2 决定
  | 'astro'
  | 'static' | 'unknown';

interface FrameworkDetection {
  framework: FrameworkType;
  confidence: number;
  appElement: string | null;
  markers: string[];
}
```

---

### 阶段 2：设计统一（低风险，需决策）

**目标**：解决 `angular-ssr` 半死代码问题，统一 Angular 检测。

**选项 A（推荐）**：从 `FrameworkType` 移除 `angular-ssr`，Angular 策略统一处理所有 Angular 变体。

- 改动：`framework/types.ts` 移除 `'angular-ssr'`
- 改动：`framework/strategies/angular.ts` 更新 `matches` 移除 `d.framework === 'angular-ssr'`
- 理由：Angular 检测当前只有一条路径（JS 内容扫描），返回 `'angular'`。Angular SSR 和 Client-side Angular 在水合监测上没有区别。
- 后续可加：如果未来需要区分，可以重新添加 `angular-ssr` 并实现检测路径。

**选项 B**：保留 `angular-ssr`，在 detector 中实现检测路径。

- 改动：`framework/detector.ts` 在 Dimension 5 中添加 `hasAngularApp` 检查 → 返回 `angular`
- 改动：`framework/detector.ts` 中添加 `html.includes('ng-server-context')` → 返回 `angular-ssr`
- 理由：完整的 Angular SSR 支持，但 Angular SSR 站点在现实中极少见。

---

### 阶段 3：补充测试（中等风险，需投入时间）

**目标**：为框架模块建立完整的测试覆盖。

| 优先级 | 任务 | 覆盖范围 | 预估工作量 |
|--------|------|---------|-----------|
| P0 | 3.1 `detectFramework` 单元测试 | 9 种框架 + unknown + 多标记优先级 | 2 小时 |
| P0 | 3.2 策略 `matches` 测试 | 9 个策略，每个 2-3 个用例 | 1 小时 |
| P1 | 3.3 策略 `generateScript` 输出测试 | 9 个策略，验证输出内容 | 1 小时 |
| P1 | 3.4 `rewritePaths` 测试 | Nuxt 3 路径修复（Unicode + 字面量） | 1 小时 |
| P2 | 3.5 `injectHydrationScript` 集成测试 | 所有策略 + 边界情况 | 2 小时 |
| P2 | 3.6 `hydrateStrategies` 注册表顺序测试 | 验证优先级排序正确 | 0.5 小时 |

**测试文件位置**：

```
packages/core/src/framework/__tests__/
  detector.test.ts       ← 检测器测试
  strategies.test.ts     ← 策略测试（matches + generateScript）
  rewrite-paths.test.ts  ← 路径修复测试
  injector.test.ts       ← 注入器集成测试
```

---

### 阶段 4：补充 SvelteKit 支持（未来，低优先级）

**目标**：实现 SvelteKit 的检测路径和策略。

| 任务 | 说明 |
|------|------|
| 4.1 SvelteKit 检测 | 在 `detector.ts` 中添加 SvelteKit 检测（meta generator、特定标记等） |
| 4.2 SvelteKit 策略 | 创建 `strategies/sveltekit.ts`，实现水合监测脚本 |
| 4.3 注册 | 在 `strategies/index.ts` 中注册 |
| 4.4 测试 | 补充 SvelteKit 检测和策略测试 |

**优先级**：低。SvelteKit 站点数量远少于 Nuxt/VitePress/Next.js，且 SvelteKit 的静态输出模式（SSR + 水合）与 Vue 3 类似，水合监测脚本通用。

---

## 执行顺序建议

```
阶段 1（安全清理）──→ 阶段 2（设计统一）──→ 阶段 3（补充测试）
                                              │
                                              └──→ 阶段 4（SvelteKit 支持）
```

- **阶段 1**：立即执行，5 分钟完成，无风险
- **阶段 2**：需 Review 确认方案，30 分钟
- **阶段 3**：持续投入，建议分配 2-3 天分批完成
- **阶段 4**：按需执行，非紧急

---

## 验收标准

### 阶段 1 验收

- [ ] `FrameworkType` 不再包含 `'sveltekit'`
- [ ] `FrameworkDetection` 不再包含 `ssrData` 字段
- [ ] `detector.ts` 不再有 `hasAngularApp` 变量
- [ ] `detector.ts` 的 `return` 语句不再包含 `ssrData`
- [ ] `pnpm build` 通过

### 阶段 2 验收

- [ ] `angular-ssr` 已从 `FrameworkType` 移除（选 A）或检测器已实现（选 B）
- [ ] `angularStrategy.matches` 正确匹配所有返回的 Angular 检测结果
- [ ] `pnpm build` 通过

### 阶段 3 验收

- [ ] `detectFramework` 测试覆盖所有 9 种框架 + unknown + 多标记场景
- [ ] 每个策略的 `matches` 有独立测试
- [ ] `nuxt3Strategy.rewritePaths` 有路径修复测试
- [ ] `injectHydrationScript` 集成测试覆盖所有策略
- [ ] 测试全部通过
- [ ] `pnpm build` 通过

---

## 附录：当前测试覆盖详情

| 框架 | detector 测试 | matches 测试 | generateScript 测试 | rewritePaths 测试 |
|------|:---:|:---:|:---:|:---:|
| Nuxt 3 | 间接 | 无 | 间接 | **无** |
| Next.js | 无 | 无 | 无 | 无 |
| VitePress | 无 | 无 | 无 | 无 |
| Astro | 无 | 无 | 无 | 无 |
| Nuxt 2 | 间接 | 无 | 间接 | 无 |
| Vue 3 | 间接 | 无 | 间接 | 无 |
| React 18 | 无 | 无 | 无 | 无 |
| Angular | 无 | 无 | 无 | 无 |
| Static | 无 | 无 | 无 | 无 |

> "间接" = 通过 `cli-hydration.test.ts` 的集成测试覆盖，非直接单元测试。

---

## 相关文件索引

| 文件 | 行数 | 说明 |
|------|------|------|
| `packages/core/src/framework/detector.ts` | 99 | 框架检测器 |
| `packages/core/src/framework/types.ts` | 53 | 类型定义 |
| `packages/core/src/framework/injector.ts` | 59 | 水合注入器 |
| `packages/core/src/framework/strategies/index.ts` | 47 | 策略注册表 |
| `packages/core/src/framework/strategies/nuxt3.ts` | 63 | Nuxt 3 策略（含 rewritePaths） |
| `packages/core/src/framework/strategies/nextjs.ts` | 54 | Next.js 策略 |
| `packages/core/src/framework/strategies/angular.ts` | 64 | Angular 策略 |
| `apps/cli/src/__tests__/cli-hydration.test.ts` | 143 | 现有集成测试 |

---

**文档状态**：草案  
**编写日期**：2026-07-15  
**预期审查**：阶段 1 可立即执行；阶段 2 需确认方案方向；阶段 3 按 sprint 排期
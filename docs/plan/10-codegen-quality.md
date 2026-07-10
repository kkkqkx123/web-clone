# 10 — 框架代码生成质量改进

## 问题

当前 `--codegen-framework react/vue` 生成的组件代码存在以下质量问题：

1. **方法体为空 stub**：所有方法生成 `const fn = () => { // TODO: Implement fn // Original: ... }`，完全没有实际代码内容
2. **状态变量仅 `unknown`**：状态声明为 `const [data, setData] = useState<unknown>(undefined)`，未与实际的 DOM 绑定或初始值关联
3. **事件处理函数与模板脱节**：`mapTemplate` 虽然替换了 `data-event` 伪属性，但页面的真实事件（如 `onclick`、`addEventListener`）没有被提取或关联
4. **JS 解析错误导致逻辑丢失**：`js-analyzer.ts` 使用 Babel 解析大型 JS Bundle（Nuxt 62KB+ 压缩包）时出错 `"Unexpected token"`，导致整个 JS 分析结果为兜底空数据
5. **生成的组件接口中 props 为空**：`interface ComponentProps {}` 且 `// TODO: Define component props`

## 根因分析

### 1. 方法体为空

`base-generator.ts` 的 `generateEventHandlerStubs()` 和 `extractMethods()` 硬编码为生成 TODO 注释，而非从 `spec.logic` 中提取真实代码体。这是因为：

```typescript
// extractMethods 中：
const ${method.name} = () => {
  // TODO: Implement ${method.name}
  // Original: ${method.code?.substring(0, 50)}...
}
```

`method.code` 来自 `js-analyzer.ts` 的输出，当 JS 解析失败时，`code` 字段为空或 undefined。

### 2. 状态变量仅有 `unknown`

`reactGenerator.collectImports()` 和 `mapState()` 在 `state` 数组为空时，仅生成一个占位的 `data` 状态：

```typescript
// component-analyzer.ts 的 collectDynamicPoints 中
if (!this.stateVars.has('data')) {
  this.stateVars.set('data', {
    name: 'data',
    type: 'unknown',
    initial: undefined,
    confidence: 0.3,
  });
}
```

当动态点收集器检测不到任何状态变量时，它添加一个默认的 `data: unknown` 兜底，导致所有组件的状态都相同。

### 3. JS 解析错误

`js-analyzer.ts` 使用 Babel 的 `parse()` 直接解析整个 JS bundle，对以下情况失败：

- **压缩代码**：Nuxt/Webpack 打包后的生产代码被压缩成单行，包含 ES2015+ 语法
- **大型文件**：62KB+ 的 bundle 包含大量 `eval()` 和动态注入
- **Source Map 缺失**：无法还原原始代码结构

Babel 报错 `"Unexpected token, expected \",\" (68:719380)"` 后，整个 js-analyzer 降级为空输出。

### 4. 无 Props 推断

当前代码完全不尝试从模板或 JS 中推断组件 props。仅仅生成空接口。

## 方案

### 1. JS 分析分阶段降级

不再期望 Babel 能完美解析生产环境的压缩 bundle。改为多阶段降级：

```
阶段 1: Babel full parse → 完整 AST 分析
  ↓ (失败/超时)
阶段 2: Babel 宽松模式 parse (allowImportExportEverywhere, errorRecovery)
  ↓ (失败/超时)
阶段 3: 正则启发式扫描 (function/const/var 声明提取)
  ↓ (失败/超时)
阶段 4: 基础命名提取 (仅提取方法名和事件绑定)
```

```typescript
export function analyzeJavaScript(
  js: string,
  spec: ComponentSpec
): JsAnalysisResult {
  // 阶段 1-2: Babel 解析
  let ast: any;
  try {
    ast = parse(js, {
      sourceType: 'unambiguous',
      errorRecovery: true,
      allowImportExportEverywhere: true,
    });
    return analyzeAst(ast);
  } catch {
    // 忽略，进入阶段 3
  }

  // 阶段 3: 正则启发式
  try {
    return analyzeRegexHeuristic(js);
  } catch {
    // 忽略，进入阶段 4
  }

  // 阶段 4: 基础提取
  return analyzeBasic(js, spec);
}
```

### 2. 正则启发式分析器

在 Babel 失效时，通过正则从 JS bundle 中提取有价值的信息：

```typescript
function analyzeRegexHeuristic(js: string): JsAnalysisResult {
  const result: JsAnalysisResult = {
    state: [],
    methods: [],
    events: [],
    todos: [],
  };

  // 提取函数声明: function fnName() { ... }
  const fnRegex = /function\s+(\w+)\s*\([^)]*\)\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = fnRegex.exec(js)) !== null) {
    result.methods.push({
      name: m[1],
      kind: 'method',
      pattern: 'regex',
    });
  }

  // 提取变量赋值: var/let/const name = ...
  const varRegex = /(?:var|let|const)\s+(\w+)\s*=\s*(?:function|\([^)]*\)\s*=>)/g;
  while ((m = varRegex.exec(js)) !== null) {
    result.methods.push({
      name: m[1],
      kind: 'method',
      pattern: 'regex',
    });
  }

  // 检测 Vue/Nuxt 特有模式: data(), methods: { ... }, etc.
  // 在 Nuxt bundle 中提取 data() 返回的键
  const dataRegex = /data\s*\(\s*\)\s*\{[^}]*return\s*\{([^}]+)\}/;
  const dataMatch = js.match(dataRegex);
  if (dataMatch) {
    const keys = dataMatch[1].match(/(\w+)\s*:/g);
    if (keys) {
      keys.forEach(k => {
        result.state.push({
          name: k.replace(':', '').trim(),
          type: 'inferred',
          initial: undefined,
          confidence: 0.5,
        });
      });
    }
  }

  return result;
}
```

### 3. 状态变量与真实 DOM 绑定关联

`component-analyzer.ts` 的 `collectDynamicPoints` 已收集 `data-binding` 等属性。在代码生成时，应该将这些绑定与状态变量关联，而非生成独立的 `data` 状态。

改进 `reactGenerator.mapState()`：

```typescript
protected mapState(state: StateVariable[], options: FrameworkCodeGenOptions): string {
  if (state.length === 0) {
    // 从 spec 的模板中扫描 data-binding 属性
    const bindings = this.extractBindingsFromTemplate(spec.template);
    if (bindings.length > 0) {
      return bindings.map(b => `const [${b.name}, set${this.pascalCase(b.name)}] = useState<${b.type || 'string'}>(${b.initial || "''"})`).join('\n');
    }
    return '// TODO: Define component state';
  }
  // ... 正常逻辑
}
```

### 4. Props 类型推断

从模板中分析外部传入的 props：

```typescript
function inferProps(template: string): Record<string, string> {
  const props: Record<string, string> = {};
  // 匹配 data-prop-* 属性
  const propRegex = /data-prop-(\w+)=["']([^"']*)["']/g;
  let m;
  while ((m = propRegex.exec(template)) !== null) {
    props[m[1]] = m[2];
  }
  return props;
}
```

对于 Nuxt 页面，从 asyncData/fetch 中提取参数作为 props：

```typescript
// 匹配 Nuxt 的 asyncData({ params, query })
const asyncDataRegex = /asyncData\s*\(\s*\{([^}]*)\}/;
```

### 5. 方法体注入

当 `method.code` 存在且非空时，generator 应直接输出原始代码作为方法体（加注释标注来源）：

```typescript
private generateMethod(method: MethodSpec): string {
  if (method.code && method.code.length > 5) {
    // 原始代码可用
    return `// Source: ${method.name}
const ${method.name} = ${method.code}`;
  }
  // 回退到 stub
  return `const ${method.name} = () => {
  // TODO: Implement ${method.name}
}`;
}
```

## 变更文件

| 文件 | 变更 |
|------|------|
| `src/transform/js-analyzer.ts` | 新增多阶段降级（Babel → 正则 → 基础）、新增正则启发式分析器 |
| `src/transform/framework-codegen/base-generator.ts` | `generateEventHandlerStubs`: 有 code 时直接输出；新增 `extractBindingsFromTemplate` |
| `src/transform/framework-codegen/react-generator.ts` | `mapState`: 从模板提取绑定时推断类型；`collectImports`: 关联绑定变量 |
| `src/transform/framework-codegen/vue-generator.ts` | 同上 |
| `src/transform/component-analyzer.ts` | `collectDynamicPoints`: 不再注入默认 `data: unknown`；改为收集真实绑定 |

## 验收标准

- [ ] 生成的 React/Vue 方法体包含 `// Source: functionName` + 原始代码片段，而非纯空 TODO
- [ ] 状态变量从模板绑定中推断，而非硬编码 `data: unknown`
- [ ] Props 接口包含从模板中推断的属性名
- [ ] Babel 解析失败时，正则启发式至少提取 5+ 方法
- [ ] `tsc --noEmit` 编译无错误

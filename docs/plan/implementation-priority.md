# 路径兼容性改进 - 执行优先级

## 优先级评分标准

| 维度 | 权重 |
|-----|------|
| 用户影响（框架覆盖率） | 30% |
| 实现复杂度 | 25% |
| 风险等级 | 20% |
| 快速价值交付 | 15% |
| 技术债务 | 10% |

---

## 任务优先级表

### 🔴 P0 - 立即执行（当前 Sprint）

#### P0.1: Nuxt cdnURL 与 basePath 处理
- **优先级分数**: 95/100
- **覆盖率**: Nuxt 应用 100%
- **复杂度**: ⭐ 低
- **工作量**: 2-4 小时
- **关键原因**: 当前快照修复不完整

**实现**:
```typescript
// src/core/path-fixer.ts - 扩展现有函数

export function fixNuxtConfig(document: Document): void {
  const scripts = Array.from(document.querySelectorAll('script'));

  for (const script of scripts) {
    const content = script.textContent || '';
    if (!content.includes('window.__NUXT__')) continue;

    let fixed = content;

    // 1. 处理 assetsPath (已有)
    fixed = fixed.replace(/assetsPath:"\\u002F_nuxt\\u002F"/g, 
      'assetsPath:".\\u002Fassets\\u002Fjs\\u002F_nuxt\\u002F"');

    // 2. 新增：处理 cdnURL
    // 模式: cdnURL: "https://..." 或 cdnURL: "/_cdn/"
    // 仅转换相对路径，完整 URL 保持不变
    fixed = fixed.replace(/cdnURL:"(\/[^"]*\/?)"/g, (match, path) => {
      if (!path.includes('://')) {
        const relative = absoluteToRelative(path, 'assets');
        return `cdnURL:"${relative}"`;
      }
      return match;
    });

    // 3. 新增：处理 basePath  
    // 规则：basePath: "/" 保持，basePath: "/app/" 转换
    fixed = fixed.replace(/basePath:"([^"]*)"(?=[},])/g, (match, path) => {
      if (path !== '/' && isAbsolutePath(path)) {
        const relative = absoluteToRelative(path, 'assets');
        return `basePath:"${relative}"`;
      }
      return match;
    });

    if (fixed !== content) {
      script.textContent = fixed;
    }
  }
}
```

**验证方法**:
```bash
grep -E "cdnURL|basePath" snapshot/index.html
# 验证相对路径转换
```

---

### 🟠 P1 - 本周完成

#### P1.1: 通用框架配置扫描器
- **优先级分数**: 85/100
- **覆盖率**: Vue/React/Angular
- **复杂度**: ⭐⭐ 中
- **工作量**: 6-8 小时
- **关键原因**: 支持更多框架，一次性解决类似问题

**新文件**: `src/core/framework-config-scanner.ts`

**核心功能**:
```typescript
export interface DetectedConfig {
  framework: 'nuxt' | 'vue' | 'react' | 'angular' | 'vite' | 'unknown';
  objectName: string;     // '__NUXT__', '__VUE__', etc.
  pathFields: string[];   // ['assetsPath', 'publicPath']
  scriptIndex: number;
}

export function detectFrameworkConfigs(document: Document): DetectedConfig[];

export function fixFrameworkPathsUniversally(
  document: Document,
  configs: DetectedConfig[]
): number; // 返回修复数量
```

**支持的框架/字段**:
| 框架 | 对象名 | 字段 |
|-----|-------|------|
| Nuxt | `__NUXT__` | assetsPath, cdnURL, basePath |
| Vue 3 | `__VUE__` | assetsPath, publicPath |
| React | `__REACT_` | publicPath, __webpack_public_path__ |
| Angular | ng.probe | baseHref |
| Vite | `__VITE_MANIFEST__` | manifest keys |

#### P1.2: 内联 CSS URL 替换
- **优先级分数**: 80/100
- **覆盖率**: 所有框架
- **复杂度**: ⭐⭐ 中
- **工作量**: 4-6 小时
- **关键原因**: 修复背景图、字体等资源加载失败

**新文件**: `src/core/css-url-fixer.ts`

**核心实现**:
```typescript
export function fixCssUrls(cssText: string): string {
  // 修复三种 CSS URL 形式:
  // 1. url('/_path/...') 
  // 2. url("/_path/...")
  // 3. url(/_path/...)
  
  const patterns = [
    /url\s*\(\s*['"]?(\/[^'")]*\/?)['""]?\s*\)/g,
    /@import\s+['"]?(\/[^'"]*\/?)['""]?;/g,
  ];
  
  let fixed = cssText;
  for (const pattern of patterns) {
    fixed = fixed.replace(pattern, (match, path) => {
      const relative = absoluteToRelative(path, 'assets');
      return match.replace(path, relative);
    });
  }
  return fixed;
}
```

**集成位置**: `src/assembler.ts` - `fixPathsForFileProtocol()` 中添加

---

### 🟡 P2 - 下周完成

#### P2.1: 修复诊断与报告
- **优先级分数**: 70/100
- **覆盖率**: 所有模式
- **复杂度**: ⭐⭐ 中
- **工作量**: 4-5 小时
- **关键原因**: 提高用户透明度和可调试性

**新文件**: `src/core/path-fix-reporter.ts`

**输出样例**:
```
Path Compatibility Report:
  Framework detected: Nuxt v3
  Fixes applied:
    ✓ assetsPath: /_nuxt/ → ./assets/js/_nuxt/
    ✓ cdnURL: /_cdn/ → ./assets/_cdn/
    ✓ CSS urls: 12 fixed in <style> tags
    ✓ Script srcs: 4 fixed
  
  Skipped (safe):
    • /api/... (4 occurrences - API routes, not modified)
    
  Summary: 21 paths fixed, 4 skipped
  File size: +0.5KB (reports and metadata)
```

**集成**: 作为可选的 `--path-fix-report` 标志

#### P2.2: React/Vue 应用测试与验证
- **优先级分数**: 65/100
- **测试覆盖**: React + Vite, Vue 3 + Vite
- **工作量**: 3-4 小时

---

### 🟢 P3 - 可选优化（下个周期）

#### P3.1: 启发式 JavaScript 路径修复
- **优先级分数**: 50/100
- **覆盖率**: 高级应用
- **复杂度**: ⭐⭐⭐ 高
- **风险等级**: 中等
- **工作量**: 8-10 小时
- **条件**: 仅在用户明确启用时激活（`--fix-js-paths`）

**实现要点**:
- 仅修复 `import()`、`require()` 中的资源导入
- 保留 API 路由不修改
- 记录所有修改以供审查

---

## 当前状态（已完成）

✅ **P0.0**: Nuxt assetsPath 基础修复
- 实现文件: `src/core/path-fixer.ts`
- 覆盖: `assetsPath: "/_nuxt/" → "./assets/js/_nuxt/"`
- 测试: ✅ 快照生成验证通过

✅ **编译问题修复**
- Babel 版本兼容性 (v7 vs v8 类型定义)
- TypeScript 配置优化

---

## 每周任务分配

### Week 1 (本周)

**周一-周二**: P0.1 - Nuxt cdnURL/basePath
- [ ] 更新 `src/core/path-fixer.ts`
- [ ] 添加单元测试
- [ ] 验证 Nuxt 应用修复完整性

**周三**: P1.1 初期 - 框架检测设计
- [ ] 设计框架检测逻辑
- [ ] 创建 `framework-config-scanner.ts`

**周四-周五**: P1.2 - CSS URL 修复
- [ ] 创建 `css-url-fixer.ts`
- [ ] 集成到修复流程
- [ ] 手动测试 CSS 背景图等

### Week 2

**周一-周二**: P1.1 完成 - 通用框架修复
- [ ] 完成扫描器实现
- [ ] 支持 Vue/React/Angular
- [ ] 单元测试

**周三-周四**: P2.1 - 诊断报告
- [ ] 实现报告生成
- [ ] CLI 集成输出

**周五**: 集成测试
- [ ] 完整应用快照生成
- [ ] file:// 协议验证

---

## 技术债务清单

### 现有问题
- [ ] P0.1 cdnURL/basePath 不完整
- [ ] 框架检测不够通用
- [ ] CSS 中的 URL 未处理

### 预防措施
- [ ] 添加快照修复集成测试
- [ ] 建立框架兼容性测试套件
- [ ] 路径修复覆盖率报告

---

## 验收标准

### P0 完成标准
```
npm run dev -- <nuxt-url> --max-assets 500
# 验证：
# 1. snapshot/index.html 中 assetsPath 为相对路径
# 2. cdnURL（如存在）为相对路径
# 3. basePath 正确处理
# 4. 文件大小无显著增长
```

### P1 完成标准
```
# 支持的框架快照测试通过
npm test -- src/core/__tests__/path-fixer.test.ts
npm test -- src/core/__tests__/css-url-fixer.test.ts

# 真实应用验证
# - Nuxt 3 应用
# - Vue 3 + Vite
# - React + Vite
# - 控制台无 404 错误
```

---

## 预计时间表

| 任务 | 优先级 | 工作量 | 预计完成 |
|-----|-------|--------|---------|
| P0.1 Nuxt 优化 | P0 | 2-4h | 本周五 |
| P1.1 通用框架 | P1 | 6-8h | 下周三 |
| P1.2 CSS 修复 | P1 | 4-6h | 下周五 |
| P2.1 诊断报告 | P2 | 4-5h | 下下周一 |
| **总计** | - | **16-23h** | **下下周一** |

---

## 风险与缓解

### 风险 1: 框架配置检测不完整
- **风险等级**: 中等
- **缓解**: 添加诊断模式，报告未检测的配置对象
- **回退**: 用户可手工编辑 HTML

### 风险 2: CSS URL 替换误伤动态内容
- **风险等级**: 低
- **缓解**: 仅替换绝对路径，相对路径保持不变
- **测试**: 生成报告显示所有替换

### 风险 3: 跨浏览器兼容性
- **风险等级**: 低（文本修改，与浏览器无关）
- **验证**: 在 Chrome/Firefox/Safari 验证


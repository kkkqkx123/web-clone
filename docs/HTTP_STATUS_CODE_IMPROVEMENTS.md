# HTTP 状态码处理改进总结

## 问题背景

当前项目在拉取时对 HTTP 状态码的处理过于严格。当访问 404 页面、登录页面或某些返回错误状态码但有有效内容的资源时，会直接拒绝下载。

**症状**：
- 404 页面返回 HTTP 404，但内容是有效 HTML → 拒绝
- 登录重定向返回 HTTP 401/302，内容是登录表单 → 拒绝  
- 反向代理返回 4xx 但有有效 CSS/JS 内容 → 拒绝

## 解决方案三阶段实现

### 短期修改 ✅ 完成

**目标**：实施内容优先验证策略，区别对待 CSS/JS 和其他资源

**关键改动**：`src/fetcher.ts` 的 `downloadSingleAsset()` 函数

```typescript
// 改进前：仅看状态码
if (!result.ok) {
  asset.status = 'failed';
  return asset;
}

// 改进后：内容优先验证
const isAcceptableStatus = 
  result.ok ||  // 2xx 总是接受
  (asset.type === 'css' && isContentValid && !result.isHtmlLike) ||
  (asset.type === 'js' && isContentValid && !result.isHtmlLike);
```

**行为变化**：
- **CSS/JS**：接受 4xx/5xx 如果内容验证通过且不是 HTML
- **图片/字体等**：保持严格要求（2xx only）
- **HTML**：已有专门处理（已支持）

**示例**：
- `HTTP 404 + 有效 CSS` → ✅ 接受（标记为 warning）
- `HTTP 404 + HTML 错误页` → ❌ 拒绝
- `HTTP 200 + 有效 JS` → ✅ 接受

---

### 中期修改 ✅ 完成

**目标**：增加日志记录和追踪，让用户了解那些被宽松接受的资源

**关键改动**：

1. **Asset 类型扩展** (`src/types.ts`)
   ```typescript
   interface Asset {
     statusCode?: number;           // 追踪原始 HTTP 状态码
     acceptedWithWarning?: boolean; // 标记宽松接受
   }
   ```

2. **下载后日志输出** (`src/assembler.ts`)
   ```
   ✓ Lenient acceptance (4xx/5xx with valid content):
     ⚠ HTTP 404 → CSS (23.5 KB) https://example.com/missing.css
     ⚠ HTTP 500 → JS (10.2 KB) https://example.com/error.js
   ```

**使用效果**：
- 用户可以看到哪些资源被以宽松模式接受
- 易于调试和检查资源拉取结果
- 清晰的警告标记区分正常(200)和宽松(4xx/5xx)接受

---

### 长期修改 ✅ 完成

**目标**：提供命令行选项让用户选择行为模式

**关键改动**：

1. **配置 Schema** (`src/config/schema.ts`)
   ```typescript
   interface SnapshotOptions {
     strictStatusCodes?: boolean;  // 默认 false (宽松模式)
   }
   ```

2. **CLI 选项** (`src/cli.ts`)
   ```bash
   --strict-status-codes  # 恢复严格模式（要求所有资源 2xx）
   ```

3. **使用逻辑** (`src/fetcher.ts`)
   ```typescript
   const isAcceptableStatus = options.strictStatusCodes
     ? result.ok  // 严格：仅 2xx
     : (result.ok || (CSS/JS 宽松规则))  // 宽松：4xx/5xx 也可以
   ```

**使用场景**：
```bash
# 默认宽松模式 - 捕获所有有效内容
npm run dev -- https://example.com

# 严格模式 - 仅接受 2xx（用于安全或合规要求）
npm run dev -- https://example.com --strict-status-codes
```

---

## 架构特性

### 内容优先验证（Content-First Validation）

```
请求资源
  ↓
获取响应 (headers + body)
  ↓
┌─ 检查状态码
├─ 检查 MIME 类型
├─ 检查内容魔数 (magic bytes)
├─ 检查内容结构 (JSON parse, etc)
└─ 综合判定：是否是期望的资源类型
  ↓
决定是否接受
  ├─ 严格模式：状态码不是 2xx → 拒绝
  └─ 宽松模式：CSS/JS 内容有效 → 接受，否则拒绝
```

### 三层防线

1. **HTTP 状态码** - 初步筛选（宽松模式可跳过）
2. **内容 MIME 类型** - 验证返回类型是否匹配请求
3. **内容有效性** - 针对特定类型的深层检查

---

## 测试覆盖

创建了两个测试套件：

### 1. `lenient-status-acceptance.test.ts`
验证短期改动的细节行为：
- ✅ CSS/JS 接受 4xx/5xx + 有效内容
- ✅ CSS/JS 拒绝 4xx/5xx + HTML 错误页
- ✅ 图片严格要求 2xx
- ✅ 2xx 资源不标记 warning

### 2. `strict-lenient-integration.test.ts`
验证长期改动的选项控制：
- ✅ 宽松模式：接受 4xx CSS/JS
- ✅ 严格模式：拒绝所有 4xx/5xx
- ✅ 两种模式混合场景

---

## 影响分析

### 向后兼容性 ✅
- 默认启用宽松模式，但不改变成功资源的行为
- 之前失败的 4xx/5xx 资源现在可能成功（改进）
- 提供 `--strict-status-codes` 选项回到旧行为

### 性能 ✅
- 不增加额外请求（状态码检查已在 fetch 阶段）
- 只增加内存中的验证逻辑（可忽略）

### 安全性 ✅
- 内容验证确保返回的不是错误页面
- 严格模式选项满足合规需求

---

## 使用指南

### 场景 1：拉取包含 404 页面的网站
```bash
npm run dev -- https://mysite.com/404
# 默认宽松模式，404 页面 HTML 会被拉取
```

### 场景 2：拉取需要认证的网站（Playwright）
```bash
npm run dev -- https://internal.company.com
# 登录重定向(401)返回登录表单 → 被宽松接受
```

### 场景 3：确保严格合规
```bash
npm run dev -- https://example.com --strict-status-codes
# 仅接受 2xx 资源，符合某些安全政策
```

### 场景 4：查看宽松接受的资源
```bash
npm run dev -- https://example.com 2>&1 | grep "Lenient acceptance"
# ⚠ HTTP 404 → CSS ...
# ⚠ HTTP 500 → JS ...
```

---

## 代码改动总结

| 文件 | 改动 | 阶段 |
|------|------|------|
| `src/fetcher.ts` | 实施内容优先验证 | 短期 |
| `src/types.ts` | 添加 statusCode, acceptedWithWarning | 中期 |
| `src/assembler.ts` | 输出宽松接受日志 | 中期 |
| `src/config/schema.ts` | 添加 strictStatusCodes 字段 | 长期 |
| `src/config/cli-adapter.ts` | 处理 CLI 选项 | 长期 |
| `src/cli.ts` | 添加 --strict-status-codes 选项 | 长期 |

---

## 下一步（可选增强）

1. **配置文件支持**：在 `.snapshotrc.json` 中持久化 `strictStatusCodes` 设置
2. **细粒度控制**：按资源类型或 URL 模式配置（e.g., `--strict-for="*.api.js"`)
3. **指标收集**：统计多少资源被宽松接受（用于监控）
4. **重试策略增强**：4xx/5xx 时是否应该重试，而不仅仅接受第一个响应


# 改进计划快速参考

基于 ANALYSIS_PLAYWRIGHT_DESIGN.md 的深度分析，以下是分三个阶段的改进方案。

## 执行概览

```
Phase 0: CLI Playwright集成 (P0, 2.5小时)
  ├─ 扩展类型定义
  ├─ 新建CLI helper
  ├─ 修改CLI入口
  ├─ 完整测试
  └─ 文档示例

Phase 1: ResourceFilter重构 (P1, 1.5小时) [可与P2并行]
  ├─ 新建ResourceFilter类
  ├─ 集成到assembler
  └─ 单元测试

Phase 2: State保存/恢复 (P2, 1.5小时) [可与P1并行]
  ├─ 扩展PlaywrightFetcherAdapter
  ├─ CLI集成save/load
  └─ 单元测试

总计: ~4小时开发时间
```

## Phase 0：CLI Playwright集成 (优先级🔴 最高)

### 问题
- CLI目前硬编码HTTP adapter，用户无法通过CLI使用Playwright
- 无法快照需要登录或JS执行的网站

### 解决方案
- 新增 `--use-playwright` 等CLI选项
- 支持通过 `--auth-script` 指定登录脚本
- 新建 `src/config/cli-helper.ts` 处理Playwright流程

### 核心代码文件
```
src/types.ts                    (扩展SnapshotOptions)
src/config/cli-helper.ts        (新建，处理Playwright逻辑)
src/cli.ts                      (新增选项，修改action)
docs/PLAYWRIGHT_CLI.md          (新建使用文档)
```

### CLI选项速览
```bash
--use-playwright              # 启用Playwright
--headless <bool>            # 是否无头模式 (默认true)
--proxy <url>                # HTTP代理
--auth-script <path>         # 登录脚本文件
--auth-timeout <ms>          # 登录超时 (默认30000)
--save-state <path>          # 保存状态 (P2)
--load-state <path>          # 加载状态 (P2)
--user-agent <string>        # 自定义User-Agent
--viewport <WxH>             # 视口大小，如 1920x1080
```

### 使用示例
```bash
# 基础使用
npm run dev -- https://example.com --use-playwright

# 需要登录
npm run dev -- https://app.example.com \
  --use-playwright \
  --auth-script ./login.js

# 带代理和自定义User-Agent
npm run dev -- https://example.com \
  --use-playwright \
  --proxy http://proxy:8080 \
  --user-agent "Mozilla/5.0"
```

### 测试验证
- [ ] 新增单元测试（选项解析、脚本加载）
- [ ] 集成测试（完整login flow）
- [ ] 回归测试（现有HTTP功能无变化）

---

## Phase 1：ResourceFilter重构 (优先级🟠 中等)

### 问题
- 资源过滤逻辑分散在 `validators.ts`、`assembler.ts`、`fetcher.ts`
- 无统一的过滤策略管理类
- 难以扩展和维护

### 解决方案
- 新建 `src/core/resource-filter.ts` 集中管理所有过滤逻辑
- 支持多层过滤：用户自定义 → 内置黑名单 → 类型检查 → 大小限制
- 提供过滤统计用于日志输出

### 核心代码文件
```
src/core/resource-filter.ts                (新建，ResourceFilter类)
src/core/__tests__/resource-filter.test.ts (新建，单元测试)
src/assembler.ts                           (修改，集成过滤器)
src/types.ts                               (扩展，过滤选项)
```

### ResourceFilter功能
```typescript
// 创建过滤器
const filter = new ResourceFilter({
  skipExtensions: ['.zip', '.pdf'],    // 跳过的扩展名
  maxFileSize: 50 * 1024 * 1024,       // 最大文件大小
  customFilter: (url) => !url.includes('ads'),  // 自定义过滤函数
  enableDefaultBlacklist: true,        // 启用默认黑名单
});

// 检查单个资源
if (filter.shouldInclude({url, type, size})) {
  // 包含这个资源
}

// 批量过滤
const filtered = filter.filter(allResources);

// 获取统计信息
const stats = filter.getStats(resources);
// { total: 100, included: 80, filtered: 20, filterReasons: {...} }
```

### 默认黑名单（示例）
```
google-analytics.com
facebook.com/tr
doubleclick.net
hotjar.com
clarity.ms
...
```

### 默认跳过的扩展名
```
压缩包:     .zip, .rar, .7z, .tar, .gz, .bz2
安装器:     .exe, .msi, .dmg, .apk, .deb, .rpm
文档:       .pdf, .doc, .docx, .xls, .xlsx, .ppt, .pptx
视频:       .mp4, .webm, .mkv, .avi, .mov, .flv
音频:       .mp3, .wav, .aac, .flac, .ogg, .wma
其他:       .iso, .torrent, .wasm, .bin, .ts, .m3u8
```

### 测试验证
- [ ] 黑名单过滤正确
- [ ] 扩展名过滤正确
- [ ] 文件大小限制有效
- [ ] 自定义过滤器生效
- [ ] 统计信息准确

---

## Phase 2：State保存/恢复 (优先级🟡 低等)

### 问题
- 每次快照都需要重新登录，浪费时间
- 无法复用已保存的认证状态

### 解决方案
- 在PlaywrightFetcherAdapter中添加 `saveState()` 和 `loadState()`
- CLI支持 `--save-state` 和 `--load-state` 选项
- 保存cookies、localStorage、sessionStorage

### 核心代码文件
```
src/adapters/playwright-fetcher-adapter.ts  (扩展，save/load方法)
src/config/cli-helper.ts                    (扩展，state操作)
src/cli.ts                                  (修改，集成state流程)
src/adapters/__tests__/playwright-fetcher-adapter.test.ts (新增测试)
```

### 使用示例
```bash
# 第一次运行：登录并保存状态
npm run dev -- https://app.example.com \
  --use-playwright \
  --auth-script ./login.js \
  --save-state ~/.app-state.json

# 后续运行：直接使用已保存的状态（无需重新登录）
npm run dev -- https://app.example.com \
  --use-playwright \
  --load-state ~/.app-state.json
```

### 状态文件格式
```json
{
  "cookies": [
    {
      "name": "session_id",
      "value": "abc123",
      "domain": "app.example.com",
      "path": "/",
      "expires": 1700000000,
      "secure": true
    }
  ],
  "origins": [
    {
      "origin": "https://app.example.com",
      "localStorage": [
        {"name": "user_token", "value": "xyz789"}
      ]
    }
  ]
}
```

### PlaywrightFetcherAdapter API
```typescript
// 保存状态到文件
await adapter.saveState('./state.json');

// 从文件加载状态
await adapter.loadState('./state.json');

// 获取状态摘要（用于调试）
const summary = await adapter.getStateSummary();
// { cookieCount: 5, localStorageCount: 3, origins: [...] }
```

### 安全提示
```bash
# 限制文件权限
chmod 600 ~/.app-state.json

# 不提交到git
echo "*.state.json" >> .gitignore
```

### 测试验证
- [ ] 状态保存完整
- [ ] 状态加载成功
- [ ] localStorage恢复有效
- [ ] 缺失文件处理正确
- [ ] 权限验证正确

---

## 并行执行策略

### 推荐顺序
```
Day 1: Phase 0 (2.5h)
Day 2-3: Phase 1 + Phase 2 并行 (3h)

总计: 3-4天工作时间
```

### P0后可立即开始P1和P2
- P1和P2没有相互依赖
- P0完成后，库API已稳定
- 可以同时进行，无冲突

---

## 验收标准

### Phase 0完成条件
- [ ] CLI新选项可用
- [ ] 登录脚本可执行
- [ ] 需要登录的网站可快照
- [ ] 单元测试覆盖≥80%
- [ ] 现有HTTP功能无退化
- [ ] 文档示例完整可运行

### Phase 1完成条件
- [ ] ResourceFilter类完整
- [ ] 过滤逻辑集中化
- [ ] 过滤结果正确
- [ ] 单元测试覆盖≥85%
- [ ] 代码可维护性提升

### Phase 2完成条件
- [ ] saveState/loadState实现
- [ ] CLI选项可用
- [ ] 状态文件格式正确
- [ ] 单元测试覆盖≥80%
- [ ] 安全最佳实践文档化

---

## 风险防控

| 风险 | 影响度 | 缓解方案 |
|------|-------|--------|
| Auth脚本执行出错 | 高 | 完善错误提示，明确指出失败原因 |
| 过滤器排除有用资源 | 中 | 支持禁用默认黑名单 |
| 状态文件包含敏感信息 | 中 | 文档强调安全最佳实践 |
| localStorage恢复失败(SOP) | 低 | 仅打印警告，不中止流程 |

---

## 快速启动清单

### 开发环境准备
```bash
# 安装依赖（确保有Playwright）
npm install

# 运行现有测试
npm test

# 构建项目
npm run build
```

### Phase 0启动
1. [ ] 创建 `src/config/cli-helper.ts`
2. [ ] 扩展 `src/types.ts` 中的SnapshotOptions
3. [ ] 修改 `src/cli.ts` 添加选项和逻辑
4. [ ] 创建 `docs/PLAYWRIGHT_CLI.md`
5. [ ] 编写单元测试
6. [ ] 本地验证

### Phase 1启动
1. [ ] 创建 `src/core/resource-filter.ts`
2. [ ] 创建测试文件
3. [ ] 修改 `src/assembler.ts` 集成
4. [ ] 运行测试验证

### Phase 2启动
1. [ ] 扩展 `src/adapters/playwright-fetcher-adapter.ts`
2. [ ] 更新 `src/config/cli-helper.ts`
3. [ ] 编写测试
4. [ ] 验证状态save/load

---

**详细计划**: 见 PHASED_IMPROVEMENT_PLAN.md  
**设计分析**: 见 ANALYSIS_PLAYWRIGHT_DESIGN.md

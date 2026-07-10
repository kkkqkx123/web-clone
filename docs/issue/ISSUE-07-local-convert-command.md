# ISSUE-07: 缺少本地转换命令，转换调试需要每次重新拉取

## 状态
已完成

## 严重程度
中

## 文件
- `src/cli.ts`
- `src/assembler.ts`
- `src/types.ts`
- `docs/commands.md`
- `SKILLS.md`
- `README.md`
- `README_zh.md`

## 描述

当前工作流中，要执行组件提取和代码生成（component extraction + codegen），必须在一次完整的 `snapshot` 执行中完成，即：拉取页面 → 下载资源 → 组装输出 → 组件提取 → 代码生成。这带来两个问题：

1. 调试转换逻辑时，每次都要重新拉取 URL 和下载资源，耗时且浪费带宽
2. 同一个页面无法用不同 codegen-framework 参数反复测试转换效果

## 解决

新增 `--convert-local <path>` 标志，使转换步骤完全独立于拉取步骤。该标志：

- 读取已有 bundle 目录（包含 `index.html` + `assets/css/` + `assets/js/`）或 single HTML 文件
- 从本地文件收集 HTML/CSS/JS，跳过 URL 拉取和资源下载
- 运行完整的组件提取 + 代码生成流水线
- 隐含 `--extract-components`（无需重复指定）
- 未指定 `-o` 时，默认输出到本地路径
- 支持所有组件提取和代码生成选项（`--codegen-framework`、`--component-depth`、`--codegen-generate-drafts` 等）

## 实现要点

`convertLocalSnapshot()` 在 `assembler.ts` 中：

1. 检测本地路径类型（目录 = bundle，文件 = single）
2. 从 `index.html` 提取内联 CSS/JS，从 `assets/css/` 和 `assets/js/` 加载外部文件
3. 运行 `convert()` → `assembleConvert()` 流水线
4. 输出组件数量和类型统计

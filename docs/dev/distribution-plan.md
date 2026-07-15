npm login

# 先在 monorepo 根目录构建所有包
pnpm build

# 逐个发布子包（pnpm 会自动替换 workspace:* 为实际版本）
pnpm --filter @web-clone/types publish
pnpm --filter @web-clone/codegen publish
pnpm --filter @web-clone/core publish
pnpm --filter @web-clone/adapter-common publish
pnpm --filter @web-clone/adapter-playwright publish
pnpm --filter @web-clone/adapter-puppeteer publish
pnpm --filter @kkkqkx123/web-clone-cli publish

cli包为个人作用域，其余为web-clone组织作用域

npm login

cd packages/types && npm publish
cd packages/core && npm publish
cd packages/adapter-common && npm publish
cd packages/codegen && npm publish
cd packages/adapter-playwright && npm publish
cd packages/adapter-puppeteer && npm publish
cd apps/cli && npm publish

cli包为个人作用域，其余为web-clone组织作用域

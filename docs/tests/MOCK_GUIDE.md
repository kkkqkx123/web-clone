# Mock 对象使用指南

## 概述

本指南说明如何在 Playwright 集成的单元测试中高效地使用 Mock 对象，避免依赖真实浏览器和网络。

---

## 1. Mock 的作用

### 1.1 为什么使用 Mock？

| 场景 | Mock | 真实浏览器 |
|------|------|---------|
| **单个方法测试** | ✅ 最佳 | ❌ 过度 |
| **快速反馈** | ✅ < 1秒 | ❌ 30秒+ |
| **隔离测试** | ✅ 完全隔离 | ❌ 相互影响 |
| **错误场景** | ✅ 易于模拟 | ❌ 难以复现 |
| **完整交互验证** | ❌ 不够真实 | ✅ 最准确 |

### 1.2 何时使用 Mock？

✅ **必须用 Mock**：
- 单个方法逻辑测试
- 参数验证
- 错误处理路径
- 边界情况

⚠️ **可选用 Mock**：
- 方法间交互
- 返回值处理

❌ **不适合用 Mock**：
- 与浏览器的完整交互
- 快照输出文件结构
- JavaScript 执行验证

---

## 2. Mock 对象工厂

### 2.1 PlaywrightFetcherAdapter Mock

#### createMockPage() - 模拟 Page 对象

```typescript
import { createMockPage } from './fixtures/mock-factories';
import { vi } from 'vitest';

// 基础使用
const mockPage = createMockPage();

// 配置 goto 的返回值
mockPage.goto = vi.fn().mockResolvedValueOnce({
  status: () => 200,
  ok: () => true,
  allHeaders: async () => ({ 'content-type': 'text/html' }),
});

// 验证被调用
expect(mockPage.goto).toHaveBeenCalledWith('https://example.com', {
  timeout: 5000,
  waitUntil: 'networkidle',
});

// 覆盖特定属性
const mockPage2 = createMockPage({
  url: vi.fn(() => 'https://example.com/page'),
});
```

#### createMockContext() - 模拟 BrowserContext 对象

```typescript
import { createMockContext } from './fixtures/mock-factories';
import { vi } from 'vitest';

// 基础使用
const mockContext = createMockContext();

// 配置 cookies 的返回值
mockContext.cookies = vi.fn().mockResolvedValueOnce([
  { name: 'session', value: 'token123', url: '', domain: '', path: '' },
]);

// 配置 storageState 的返回值
mockContext.storageState = vi.fn().mockResolvedValueOnce({
  origins: [
    {
      origin: 'https://example.com',
      localStorage: [{ name: 'auth_token', value: 'jwt...' }],
    },
  ],
});

// 配置 request.fetch 的返回值
mockContext.request.fetch = vi.fn().mockResolvedValueOnce({
  status: () => 200,
  ok: () => true,
  headers: () => ({ 'content-type': 'text/css' }),
  body: async () => Buffer.from('body {}'),
  url: () => 'https://example.com/style.css',
});

// 配置 request.head 的返回值
mockContext.request.head = vi.fn().mockResolvedValueOnce({
  ok: () => true,
});
```

#### MOCK_RESULTS - 预设结果模板

```typescript
import { MOCK_RESULTS } from './fixtures/mock-factories';

// HTML 响应
const htmlResult = MOCK_RESULTS.html();
// {
//   buffer: Buffer.from('<html>...'),
//   mime: 'text/html; charset=utf-8',
//   status: 200,
//   ok: true,
//   isHtmlLike: true,
// }

// CSS 响应
const cssResult = MOCK_RESULTS.css();
// {
//   buffer: Buffer.from('body { color: red; }'),
//   mime: 'text/css',
//   status: 200,
//   ok: true,
//   isHtmlLike: false,
// }

// 图片响应
const imageResult = MOCK_RESULTS.image();
// {
//   buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]), // PNG
//   mime: 'image/png',
//   status: 200,
//   ok: true,
//   isHtmlLike: false,
// }

// 404 错误
const errorResult = MOCK_RESULTS.error404();
// {
//   buffer: Buffer.from('Not Found'),
//   mime: 'text/html',
//   status: 404,
//   ok: false,
//   isHtmlLike: true,
// }
```

### 2.2 自定义 Mock 结果

#### 创建自定义 MOCK_RESULTS

```typescript
// fixtures/mock-factories.ts
export const CUSTOM_MOCK_RESULTS = {
  // 大文件
  largeFile: () => ({
    buffer: Buffer.alloc(50 * 1024 * 1024), // 50 MB
    mime: 'application/octet-stream',
    status: 200,
    ok: true,
    isHtmlLike: false,
  }),
  
  // 重定向响应
  redirect: () => ({
    buffer: Buffer.from('Moved'),
    mime: 'text/html',
    status: 301,
    ok: false,
    isHtmlLike: true,
    headers: { 'location': 'https://example.com/new' },
    url: 'https://example.com/new',
  }),
  
  // 无效内容
  malformed: () => ({
    buffer: Buffer.from('<!DOCTYPE html><html><body>Unclosed'),
    mime: 'text/html',
    status: 200,
    ok: true,
    isHtmlLike: true,
  }),
};
```

#### 在测试中使用自定义结果

```typescript
it('should handle large files', async () => {
  mockContext.request.fetch = vi.fn()
    .mockResolvedValueOnce(CUSTOM_MOCK_RESULTS.largeFile());
  
  const result = await adapter.fetch('https://example.com/large.zip', {});
  
  expect(result.buffer.length).toBe(50 * 1024 * 1024);
});
```

---

## 3. 测试数据集

### 3.1 使用 TEST_URLS

```typescript
import { TEST_URLS } from './fixtures/test-data';

// 简单 URL
it('should fetch simple URL', async () => {
  await adapter.fetch(TEST_URLS.simple, {}); // https://example.com
});

// 带路径的 URL
it('should handle URL with path', async () => {
  await adapter.fetch(TEST_URLS.withPath, {}); // https://example.com/page
});

// 带查询参数的 URL
it('should handle URL with query', async () => {
  await adapter.fetch(TEST_URLS.withQuery, {}); // https://example.com/search?q=test
});

// 同源 URL
it('should identify same-origin resources', async () => {
  const isMainDoc = TEST_URLS.sameOrigin.main === TEST_URLS.sameOrigin.main;
  expect(isMainDoc).toBe(true);
});

// 跨域 URL
it('should identify cross-origin resources', async () => {
  const isCrossOrigin = 
    new URL(TEST_URLS.crossOrigin.main).origin !== 
    new URL(TEST_URLS.crossOrigin.cdn).origin;
  expect(isCrossOrigin).toBe(true);
});
```

### 3.2 使用 TEST_HEADERS

```typescript
import { TEST_HEADERS } from './fixtures/test-data';

// 认证头
it('should include auth header', async () => {
  const adapter = new PlaywrightFetcherAdapter(
    mockPage,
    mockContext,
    { customHeaders: TEST_HEADERS.auth }
  );
  
  mockContext.request.fetch = vi.fn();
  await adapter.fetch('https://api.example.com/data', {});
  
  expect(mockContext.request.fetch)
    .toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining(TEST_HEADERS.auth),
      })
    );
});

// 自定义头
it('should include custom header', async () => {
  const adapter = new PlaywrightFetcherAdapter(
    mockPage,
    mockContext,
    { customHeaders: TEST_HEADERS.custom }
  );
  
  // ... 测试逻辑
});

// 多个头的合并
it('should merge multiple headers', async () => {
  const adapter = new PlaywrightFetcherAdapter(
    mockPage,
    mockContext,
    { customHeaders: TEST_HEADERS.combined }
  );
  
  // ... 测试逻辑
});
```

### 3.3 使用 TEST_COOKIES

```typescript
import { TEST_COOKIES } from './fixtures/test-data';

// 单个 Cookie
it('should extract session cookie', async () => {
  mockContext.cookies = vi.fn()
    .mockResolvedValueOnce([TEST_COOKIES[0]]); // session
  
  const authCtx = await adapter.getAuthContext();
  
  expect(authCtx.cookies).toContainEqual({
    name: 'session',
    value: 'abc123',
  });
});

// 多个 Cookie
it('should extract multiple cookies', async () => {
  mockContext.cookies = vi.fn()
    .mockResolvedValueOnce(TEST_COOKIES);
  
  const authCtx = await adapter.getAuthContext();
  
  expect(authCtx.cookies).toHaveLength(3);
  expect(authCtx.cookies[0].name).toBe('session');
  expect(authCtx.cookies[1].name).toBe('tracking');
  expect(authCtx.cookies[2].name).toBe('preferences');
});
```

### 3.4 使用 TEST_AUTH_TOKENS

```typescript
import { TEST_AUTH_TOKENS } from './fixtures/test-data';

// JWT 令牌
it('should handle JWT token', async () => {
  mockContext.storageState = vi.fn()
    .mockResolvedValueOnce({
      origins: [
        {
          origin: 'https://example.com',
          localStorage: [
            { name: 'auth_token', value: TEST_AUTH_TOKENS.jwt },
          ],
        },
      ],
    });
  
  const authCtx = await adapter.getAuthContext();
  
  expect(authCtx.token).toBe(TEST_AUTH_TOKENS.jwt);
});

// Bearer 令牌
it('should handle Bearer token', async () => {
  const customHeaders = {
    'Authorization': TEST_AUTH_TOKENS.bearer,
  };
  
  const adapter = new PlaywrightFetcherAdapter(
    mockPage,
    mockContext,
    { customHeaders }
  );
  
  const authCtx = await adapter.getAuthContext();
  
  expect(authCtx.headers).toEqual({ 'Authorization': TEST_AUTH_TOKENS.bearer });
});
```

---

## 4. Mock 模式和最佳实践

### 4.1 模式 1：简单返回值 Mock

```typescript
// 最基础的 Mock 用法
it('should fetch HTML', async () => {
  // 设置 Mock 返回值
  mockPage.goto = vi.fn().mockResolvedValueOnce({
    status: () => 200,
    ok: () => true,
    allHeaders: async () => ({ 'content-type': 'text/html' }),
  });
  
  mockPage.content = vi.fn()
    .mockResolvedValueOnce('<html></html>');
  
  // 执行
  const result = await adapter.fetch('https://example.com', {});
  
  // 验证
  expect(result.status).toBe(200);
  expect(result.buffer.toString()).toContain('html');
});
```

### 4.2 模式 2：条件 Mock

```typescript
// 根据参数返回不同值
it('should handle different URLs differently', async () => {
  mockContext.request.fetch = vi.fn()
    .mockImplementation((url: string) => {
      if (url.includes('style.css')) {
        return Promise.resolve({
          status: () => 200,
          ok: () => true,
          headers: () => ({ 'content-type': 'text/css' }),
          body: async () => Buffer.from('body {}'),
        });
      }
      
      if (url.includes('script.js')) {
        return Promise.resolve({
          status: () => 200,
          ok: () => true,
          headers: () => ({ 'content-type': 'application/javascript' }),
          body: async () => Buffer.from('console.log("hello")'),
        });
      }
      
      throw new Error(`Unexpected URL: ${url}`);
    });
  
  // 验证不同 URL 的处理
  await adapter.fetch('https://example.com/style.css', {});
  await adapter.fetch('https://example.com/script.js', {});
  
  expect(mockContext.request.fetch).toHaveBeenCalledTimes(2);
});
```

### 4.3 模式 3：副作用 Mock（Track 调用）

```typescript
// 追踪 Mock 被调用的参数和次数
it('should call goto with correct parameters', async () => {
  const gotoSpy = vi.spyOn(mockPage, 'goto')
    .mockResolvedValueOnce({ status: () => 200, ok: () => true });
  
  await adapter.fetch('https://example.com', { timeout: 5000 });
  
  // 验证调用参数
  expect(gotoSpy).toHaveBeenCalledWith(
    'https://example.com',
    expect.objectContaining({
      timeout: 5000,
      waitUntil: 'networkidle',
    })
  );
  
  // 验证调用次数
  expect(gotoSpy).toHaveBeenCalledTimes(1);
});
```

### 4.4 模式 4：错误 Mock

```typescript
// 模拟错误情况
it('should handle network timeout', async () => {
  mockPage.goto = vi.fn()
    .mockRejectedValueOnce(new Error('Timeout after 5000ms'));
  
  await expect(
    adapter.fetch('https://example.com', { timeout: 5000 })
  ).rejects.toThrow('Playwright fetch failed');
});

it('should handle navigation failure', async () => {
  mockPage.goto = vi.fn()
    .mockResolvedValueOnce(null); // 导航失败
  
  await expect(
    adapter.fetch('https://example.com', {})
  ).rejects.toThrow('Failed to navigate');
});
```

### 4.5 模式 5：Sequential Mock（按顺序返回不同值）

```typescript
// 同一个 Mock 多次调用返回不同值
it('should handle multiple requests', async () => {
  mockContext.request.fetch = vi.fn()
    .mockResolvedValueOnce(MOCK_RESULTS.css())      // 第一次调用
    .mockResolvedValueOnce(MOCK_RESULTS.image())    // 第二次调用
    .mockResolvedValueOnce(MOCK_RESULTS.html());    // 第三次调用
  
  const result1 = await adapter.fetch('https://example.com/style.css', {});
  const result2 = await adapter.fetch('https://example.com/logo.png', {});
  const result3 = await adapter.fetch('https://example.com/page.html', {});
  
  expect(result1.mime).toBe('text/css');
  expect(result2.mime).toBe('image/png');
  expect(result3.mime).toBe('text/html');
});
```

---

## 5. 常见测试场景

### 5.1 测试主文档获取 (page.goto)

```typescript
describe('Main document fetch via page.goto', () => {
  it('should use page.goto for main document', async () => {
    // 设置 Mock
    mockPage.goto = vi.fn().mockResolvedValueOnce({
      status: () => 200,
      ok: () => true,
      allHeaders: async () => ({}),
    });
    
    mockPage.content = vi.fn()
      .mockResolvedValueOnce('<html><body>Test</body></html>');
    
    const adapter = new PlaywrightFetcherAdapter(mockPage, mockContext);
    
    // 执行
    const result = await adapter.fetch('https://example.com', {});
    
    // 验证
    expect(mockPage.goto).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({ waitUntil: 'networkidle' })
    );
    
    expect(result.buffer.toString()).toContain('Test');
  });

  it('should wait for load state', async () => {
    mockPage.goto = vi.fn().mockResolvedValueOnce({
      status: () => 200,
      ok: () => true,
      allHeaders: async () => ({}),
    });
    
    mockPage.content = vi.fn().mockResolvedValueOnce('<html></html>');
    
    const adapter = new PlaywrightFetcherAdapter(mockPage, mockContext);
    
    await adapter.fetch('https://example.com', {});
    
    // 验证 waitForLoadState 被调用
    expect(mockPage.waitForLoadState).toHaveBeenCalledWith('networkidle');
  });
});
```

### 5.2 测试子资源获取 (context.request)

```typescript
describe('Sub-resource fetch via context.request', () => {
  it('should use context.request for sub-resources', async () => {
    // 设置页面已加载
    mockPage.url = vi.fn(() => 'https://example.com/page');
    
    // 设置 CSS 请求 Mock
    mockContext.request.fetch = vi.fn()
      .mockResolvedValueOnce(MOCK_RESULTS.css());
    
    const adapter = new PlaywrightFetcherAdapter(mockPage, mockContext);
    
    // 执行：获取子资源（不同域）
    const result = await adapter.fetch('https://cdn.example.com/style.css', {});
    
    // 验证
    expect(mockContext.request.fetch).toHaveBeenCalledWith(
      'https://cdn.example.com/style.css',
      expect.objectContaining({ timeout: expect.any(Number) })
    );
    
    expect(result.mime).toBe('text/css');
  });

  it('should inherit custom headers', async () => {
    mockPage.url = vi.fn(() => 'https://example.com/page');
    
    mockContext.request.fetch = vi.fn()
      .mockResolvedValueOnce(MOCK_RESULTS.css());
    
    const adapter = new PlaywrightFetcherAdapter(mockPage, mockContext, {
      customHeaders: { 'Authorization': 'Bearer token' },
    });
    
    await adapter.fetch('https://api.example.com/data', {});
    
    // 验证自定义头被传递
    expect(mockContext.request.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer token',
        }),
      })
    );
  });
});
```

### 5.3 测试认证信息提取

```typescript
describe('Authentication context extraction', () => {
  it('should extract cookies and localStorage', async () => {
    mockContext.cookies = vi.fn().mockResolvedValueOnce(
      TEST_COOKIES
    );
    
    mockContext.storageState = vi.fn().mockResolvedValueOnce({
      origins: [
        {
          origin: 'https://example.com',
          localStorage: [
            { name: 'auth_token', value: 'jwt123' },
            { name: 'user_id', value: '12345' },
          ],
        },
      ],
    });
    
    const adapter = new PlaywrightFetcherAdapter(mockPage, mockContext);
    const authCtx = await adapter.getAuthContext();
    
    // 验证 cookies
    expect(authCtx.cookies).toHaveLength(3);
    expect(authCtx.cookies[0].name).toBe('session');
    
    // 验证 token
    expect(authCtx.token).toBe('jwt123');
  });
});
```

### 5.4 测试错误处理

```typescript
describe('Error handling', () => {
  it('should handle page.goto failure', async () => {
    mockPage.goto = vi.fn()
      .mockRejectedValueOnce(new Error('Connection refused'));
    
    const adapter = new PlaywrightFetcherAdapter(mockPage, mockContext);
    
    await expect(
      adapter.fetch('https://example.com', {})
    ).rejects.toThrow('Playwright fetch failed');
  });

  it('should handle HTTP errors gracefully', async () => {
    mockPage.goto = vi.fn().mockResolvedValueOnce(null); // 导航失败
    
    const adapter = new PlaywrightFetcherAdapter(mockPage, mockContext);
    
    await expect(
      adapter.fetch('https://example.com', {})
    ).rejects.toThrow('Failed to navigate');
  });

  it('should handle missing headers', async () => {
    mockContext.request.fetch = vi.fn()
      .mockResolvedValueOnce({
        status: () => 200,
        ok: () => true,
        headers: () => ({}), // 无 content-type
        body: async () => Buffer.from('data'),
        url: () => 'https://example.com/file',
      });
    
    mockPage.url = vi.fn(() => 'https://example.com/page');
    
    const adapter = new PlaywrightFetcherAdapter(mockPage, mockContext);
    const result = await adapter.fetch('https://example.com/file', {});
    
    // 应该使用默认 MIME 类型
    expect(result.mime).toBe('application/octet-stream');
  });
});
```

---

## 6. 高级技巧

### 6.1 Mock 链式调用

```typescript
// ✅ 推荐：使用工厂函数创建可配置的 Mock
export function createMockResponse(overrides = {}) {
  return {
    status: () => 200,
    ok: () => true,
    headers: () => ({ 'content-type': 'text/html' }),
    allHeaders: async () => ({ 'content-type': 'text/html' }),
    ...overrides,
  };
}

// 在测试中使用
mockPage.goto = vi.fn().mockResolvedValueOnce(
  createMockResponse({ headers: () => ({ 'content-type': 'application/json' }) })
);
```

### 6.2 验证 Mock 调用顺序

```typescript
it('should call methods in correct order', async () => {
  const callOrder = [];
  
  mockPage.goto = vi.fn(async () => {
    callOrder.push('goto');
    return { status: () => 200, ok: () => true, allHeaders: async () => ({}) };
  });
  
  mockPage.waitForLoadState = vi.fn(async () => {
    callOrder.push('waitForLoadState');
  });
  
  mockPage.content = vi.fn(async () => {
    callOrder.push('content');
    return '<html></html>';
  });
  
  const adapter = new PlaywrightFetcherAdapter(mockPage, mockContext);
  await adapter.fetch('https://example.com', {});
  
  // 验证调用顺序
  expect(callOrder).toEqual(['goto', 'waitForLoadState', 'content']);
});
```

### 6.3 部分 Mock（spy on real implementation）

```typescript
// 当需要部分 Mock 真实实现时
it('should use real implementation for some methods', async () => {
  const realAdapter = new HttpFetcherAdapter();
  
  // 仅 Mock 特定方法
  vi.spyOn(realAdapter, 'fetch').mockResolvedValueOnce(MOCK_RESULTS.html());
  
  const result = await realAdapter.fetch('https://example.com', {});
  
  expect(result.buffer).toBeDefined();
});
```

---

## 7. 调试 Mock 问题

### 7.1 检查 Mock 是否被调用

```typescript
// ❌ 调试模式 1：直接打印
console.log(mockPage.goto.mock.calls);

// ✅ 调试模式 2：使用 expect 验证
expect(mockPage.goto).toHaveBeenCalled();
expect(mockPage.goto).toHaveBeenCalledTimes(1);
expect(mockPage.goto).toHaveBeenCalledWith(...args);

// ✅ 调试模式 3：打印详细信息
const calls = mockPage.goto.mock.calls;
calls.forEach((call, index) => {
  console.log(`Call ${index + 1}:`, call);
});
```

### 7.2 检查 Mock 返回值

```typescript
it('should return correct value', async () => {
  const mockResult = MOCK_RESULTS.html();
  
  mockPage.content = vi.fn().mockResolvedValueOnce(mockResult.buffer.toString());
  
  // 验证返回值
  const result = await mockPage.content();
  
  expect(result).toContain('<html>');
});
```

### 7.3 测试 Mock 链

```typescript
it('should chain mock calls correctly', async () => {
  // Step 1：设置 goto Mock
  const gotoResponse = {
    status: () => 200,
    ok: () => true,
    allHeaders: async () => ({}),
  };
  
  // Step 2：设置 content Mock
  const content = '<html></html>';
  
  // Step 3：设置 waitForLoadState Mock
  
  mockPage.goto = vi.fn().mockResolvedValueOnce(gotoResponse);
  mockPage.content = vi.fn().mockResolvedValueOnce(content);
  mockPage.waitForLoadState = vi.fn().mockResolvedValueOnce(undefined);
  
  // 执行和验证
  const adapter = new PlaywrightFetcherAdapter(mockPage, mockContext);
  const result = await adapter.fetch('https://example.com', {});
  
  expect(mockPage.goto).toHaveBeenCalled();
  expect(mockPage.waitForLoadState).toHaveBeenCalled();
  expect(mockPage.content).toHaveBeenCalled();
  expect(result.buffer.toString()).toBe(content);
});
```

---

## 8. 快速参考

### 创建基础 Mock

```typescript
import { createMockPage, createMockContext, MOCK_RESULTS } from './fixtures/mock-factories';
import { TEST_URLS, TEST_HEADERS, TEST_COOKIES } from './fixtures/test-data';

// 创建 Mock 对象
const mockPage = createMockPage();
const mockContext = createMockContext();

// 配置 Mock 返回值
mockPage.goto = vi.fn().mockResolvedValueOnce(/* ... */);
mockContext.cookies = vi.fn().mockResolvedValueOnce(TEST_COOKIES);

// 执行测试
const adapter = new PlaywrightFetcherAdapter(mockPage, mockContext);

// 验证调用
expect(mockPage.goto).toHaveBeenCalledWith(TEST_URLS.simple);
```

---

## 9. 总结

✅ **Mock 的优势**
- 快速反馈（< 1 秒）
- 完全隔离（无依赖）
- 易于控制（100% 可预测）

⚠️ **Mock 的局限**
- 不够真实
- 需要维护
- 可能存在盲点

✓ **最佳实践**
- 使用统一的工厂函数
- 集中管理测试数据
- 明确的命名和注释
- 定期更新 fixtures

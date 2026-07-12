# Playwright API 快速参考

## 三层 API 对比

| 特性 | snapshotWithPlaywright() | snapshotWithBrowserContext() | snapshot() + adapter |
|------|---------------------------|-------------------------------|----------------------|
| **启用方式** | 最简单 | 中等 | 最复杂 |
| **浏览器管理** | web-clone 管理 | 你负责 | 你负责 |
| **Context 管理** | web-clone 管理 | 你负责 | 你负责 |
| **最适合** | 一次性脚本 | 既有项目集成 | 完全自定义 |
| **认证支持** | ✅ 内联/脚本 | ✅ pre-auth | ✅ pre-auth |
| **性能** | ⚡⚡ | ⚡⚡⚡ | ⚡⚡ |
| **灵活性** | ★★☆ | ★★★ | ★★★★★ |

---

## 速查表

### 一行代码快照

```typescript
import { snapshotWithPlaywright } from 'web-clone';
await snapshotWithPlaywright('https://example.com', { output: './snapshot' });
```

### 添加认证

```typescript
import { snapshotWithPlaywright } from 'web-clone';

await snapshotWithPlaywright('https://example.com', options, {
  setupAuth: async (page) => {
    await page.goto('https://example.com/login');
    await page.fill('input[name="email"]', 'user@example.com');
    await page.fill('input[name="password"]', 'password');
    await page.click('button[type="submit"]');
    await page.waitForNavigation();
  }
});
```

### 集成既有 Playwright 项目

```typescript
import { snapshotWithBrowserContext } from 'web-clone';
import { chromium } from 'playwright';

const browser = await chromium.launch();
const context = await browser.newContext();
// ... 你的设置逻辑 ...
const result = await snapshotWithBrowserContext('https://example.com', options, context);
await context.close();
await browser.close();
```

### CLI 用法

```bash
# 基础
npx web-clone https://example.com --use-playwright

# 带认证脚本
npx web-clone https://example.com --use-playwright --auth-script ./login.js

# 保存状态
npx web-clone https://example.com --use-playwright --auth-script ./login.js --save-state ./state.json

# 加载状态
npx web-clone https://example.com --use-playwright --load-state ./state.json
```

---

## 常用配置

### 等待页面加载

```typescript
// 最可靠（默认）
waitForLoadState: 'networkidle'

// 对于不需要加载所有资源的页面
waitForLoadState: 'domcontentloaded'

// 最快（不推荐）
waitForLoadState: 'load'
```

### 自定义请求头

```typescript
const adapter = new PlaywrightFetcherAdapter(page, context, {
  customHeaders: {
    'Authorization': 'Bearer token123',
    'X-API-Key': 'key456'
  }
});
```

### 代理配置

```typescript
const result = await snapshotWithPlaywright(url, options, {
  browserLaunchOptions: {
    proxy: { server: 'http://proxy.example.com:8080' }
  }
});
```

### 视口大小

```typescript
const result = await snapshotWithPlaywright(url, options, {
  contextOptions: {
    viewport: { width: 1920, height: 1080 }
  }
});
```

---

## 错误处理

```typescript
try {
  const result = await snapshotWithPlaywright(url, options, {
    setupAuth: async (page) => { /* ... */ }
  });
  console.log('✓ Success:', result.stats);
} catch (error) {
  if (error.message.includes('Cannot find module')) {
    console.error('Playwright not installed. Run: npm install playwright');
  } else if (error.message.includes('Timeout')) {
    console.error('Page load timeout. Try increasing timeout option');
  } else {
    console.error('Error:', error.message);
  }
  process.exit(1);
}
```

---

## 性能调优

```typescript
const result = await snapshotWithPlaywright(url, {
  // 并发下载资源
  concurrency: 12,
  
  // 单个资源超时
  timeout: 20000,
  
  // 限制资源数
  maxAssets: 300,
  
  // 不内联（更快）
  inline: false,
  
  // 不美化HTML（更快）
  pretty: false
}, {
  // 等待网络空闲
  adapterOptions: {
    waitForLoadState: 'networkidle'
  }
});
```

---

## 调试

```typescript
// 保存调试截图
const adapter = new PlaywrightFetcherAdapter(page, context, {
  debugScreenshot: './debug.png'
});

// 查看认证状态
const auth = await adapter.getAuthContext();
console.log('Cookies:', auth.cookies.length);
console.log('Token:', auth.token);

// 检查资源访问
const accessible = await adapter.canAccess('https://api.example.com/data');
console.log('API accessible:', accessible);
```

---

## 常见问题

**Q: 如何保存和复用认证状态？**
```typescript
// 首次快照并保存状态
npx web-clone https://example.com --use-playwright --auth-script ./login.js --save-state ./auth.json

// 后续快照使用已保存的状态
npx web-clone https://example.com --use-playwright --load-state ./auth.json
```

**Q: 如何处理多步认证？**
```typescript
setupAuth: async (page) => {
  // 第1步：邮件验证
  await page.goto('https://example.com/login');
  await page.fill('input[name="email"]', 'user@example.com');
  await page.click('button:has-text("Next")');
  
  // 第2步：密码
  await page.fill('input[name="password"]', 'password');
  await page.click('button:has-text("Sign in")');
  
  // 第3步：2FA
  if (await page.$('input[name="mfa"]')) {
    await page.fill('input[name="mfa"]', '123456');
    await page.click('button:has-text("Verify")');
  }
  
  await page.waitForNavigation();
}
```

**Q: 快照 SPA 应该用哪个模式？**
```typescript
// 对于 Single Page Applications：
// - 使用 executeJs: true（默认）- 执行 JavaScript
// - 使用 waitForLoadState: 'networkidle' - 等待所有资源加载
// - 模式选择：
//   - single: 单个 HTML 文件（所有 CSS/JS 内联）
//   - bundle: 分离资源目录（推荐）
```

**Q: 如何处理反爬虫检测？**
```typescript
const result = await snapshotWithPlaywright(url, options, {
  browserLaunchOptions: {
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
    ]
  },
  contextOptions: {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  },
  adapterOptions: {
    customHeaders: {
      'Accept-Language': 'en-US,en;q=0.9'
    }
  }
});
```

---

## 资源

- 📖 [完整集成指南](./PLAYWRIGHT_INTEGRATION_GUIDE.md)
- 🎬 [Playwright 官网](https://playwright.dev)
- 📦 [web-clone NPM](https://npmjs.com/package/web-clone)

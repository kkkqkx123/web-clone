# Puppeteer Adapter Implementation Analysis

## 1. Current Architecture Overview

The project already has a clean, framework-agnostic **FetcherAdapter** interface at `src/adapters/fetcher-adapter.ts`, designed specifically to support multiple automation backends:

```
FetcherAdapter (interface)
├── fetch(url, options) → FetchResult
├── canAccess(url) → boolean        (optional)
├── getAuthContext() → AuthContext   (optional)
└── dispose()                        (optional)

Implementations:
├── HttpFetcherAdapter           — Default HTTP (src/adapters/http-fetcher-adapter.ts)
└── PlaywrightFetcherAdapter     — Production (src/adapters/automation/playwright/adapter.ts)
```

## 2. Existing Puppeteer Artifacts

| Artifact | Location | Status |
|---|---|---|
| Simplified example | `examples/puppeteer-adapter.ts` | Exists, but naive (no error handling, uses `page.goto()` for **all** resources) |
| Architecture docs | `docs/architecture/ARCHITECTURE_ANALYSIS.md` | References Puppeteer as a design target |
| Plan docs | `docs/plan/*.md`, `docs/architecture/CORRECT_IMPLEMENTATION_PLAN.md` | Lists Puppeteer as future work |

## 3. Key Differences: Playwright vs Puppeteer APIs

This is the critical analysis — a Puppeteer adapter **cannot** simply copy the Playwright adapter's implementation because of fundamental API differences.

| Capability | Playwright | Puppeteer |
|---|---|---|
| **Sub-resource fetch** | `context.request.fetch(url)` — built-in API request factory, inherits cookies/headers automatically | No equivalent. Must use `page.evaluate()` + `fetch()` in-page, or raw HTTP with cookie forwarding |
| **Cookie access** | `context.cookies()` — context-level | `page.cookies()` — page-level only |
| **Storage state** | `context.storageState()` — built-in export | No built-in. Must manually extract `localStorage` via `page.evaluate()` |
| **HEAD request** | `context.request.head()` | No equivalent. Must use `page.evaluate(() => fetch(url, {method:'HEAD'}))` |
| **Response headers** | `response.headers()` / `response.allHeaders()` — full header access | `response.headers()` — available but less ergonomic |
| **Network interception** | Built-in `page.route()` pattern | Must use `page.setRequestInterception()` with manual handler |

### Critical Gap: Sub-resource Fetching

**Playwright** has `context.request.fetch(url)` — a standalone API that:
- Makes HTTP requests through the browser context's cookie jar
- Returns full headers, status, and body
- Works without navigating the page
- Automatically respects context-level settings

**Puppeteer** has **no equivalent**. The options are:

1. **Option A: Raw HTTP with cookie forwarding** (recommended for production)
   - Extract cookies from `page.cookies()` before each fetch
   - Use Node.js `http`/`https` to make the request with those cookies
   - This is what Playwright does internally, but we must implement it manually
   
2. **Option B: `page.evaluate()` + in-page `fetch()`** (simpler but fragile)
   - Execute `fetch(url)` inside the browser page
   - Risks: CORS restrictions, content security policies, can't get raw binary for large assets
   
3. **Option C: `page.goto()` for everything** (what the example does — **wrong**)
   - Destroys current page state for each sub-resource
   - Extremely slow
   - Cannot fetch non-HTML resources cleanly

**Recommendation: Option A** — it's the only production-viable approach, matching Playwright's architecture.

## 4. Implementation Plan

### 4.1 Directory Structure

```
src/adapters/automation/
├── options.ts                          ← Already exists (AutomationAdapterOptions)
├── playwright/
│   ├── index.ts
│   ├── adapter.ts                      ← Already exists
│   └── options.ts                      ← Already exists (PlaywrightAdapterOptions)
└── puppeteer/                          ← NEW
    ├── index.ts                        ← Public re-exports
    ├── adapter.ts                      ← PuppeteerFetcherAdapter implementation
    └── options.ts                      ← PuppeteerAdapterOptions interface
```

### 4.2 PuppeteerAdapterOptions

```typescript
export interface PuppeteerAdapterOptions {
  /** Wait state for page.goto() — maps to Puppeteer's waitUntil */
  waitForLoadState?: 'load' | 'domcontentloaded' | 'networkidle';
  
  /** Whether to execute JavaScript for main document */
  executeJs?: boolean;
  
  /** Custom headers for all requests */
  customHeaders?: Record<string, string>;
  
  /** Validate SSL certificates */
  validateSSL?: boolean;
  
  /** Debug screenshot path */
  debugScreenshot?: string;
}
```

Nearly identical to Playwright's options, but notice:
- No `waitForNavigation` (Puppeteer's `page.goto` already returns when navigation completes)
- The `waitForLoadState` values match Puppeteer's `waitUntil` exactly

### 4.3 Core Implementation Strategy

```
fetch(url, options)
  ├── isMainDocument == true
  │   └── fetchWithPage(url, options, pwOptions)
  │       ├── page.goto(url, { waitUntil, timeout })
  │       ├── [SPA hydration wait loop]  ← Same logic as Playwright adapter
  │       ├── [debug screenshot]
  │       └── page.content() → buffer
  │
  └── isMainDocument == false/undefined
      └── fetchWithHttp(url, options, pwOptions)
          ├── page.cookies() → cookie header
          ├── http.get() / https.get() with cookies + custom headers
          └── buffer + headers + status → FetchResult
```

### 4.4 Sub-resource Fetcher with Cookie Inheritance

```typescript
private async fetchWithHttp(
  url: string,
  options: FetchOptions,
  pwOptions: PuppeteerAdapterOptions
): Promise<FetchResult> {
  // 1. Extract cookies from browser page
  const cookies = await this.page.cookies(url);
  const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
  
  // 2. Build HTTP request with cookies
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeout ?? 15000);
  
  try {
    const response = await fetch(url, {
      headers: {
        'Cookie': cookieHeader,
        ...options.headers,
        ...pwOptions.customHeaders,
      },
      signal: controller.signal,
      redirect: 'follow',
    });
    
    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    
    return {
      buffer,
      mime: contentType,
      status: response.status,
      ok: response.ok,
      isHtmlLike: contentType.includes('text/html'),
      headers: Object.fromEntries(response.headers.entries()),
      url: response.url,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
```

### 4.5 SPA Hydration Detection

The Playwright adapter has sophisticated Vue/Nuxt hydration detection. **This logic is cross-framework and should be extracted** — the Puppeteer adapter needs the same capability.

However, the current implementation is inline in the Playwright adapter. Two options:

1. **Extract a shared helper** — move `waitForSpaHydration()` to a common utility
2. **Duplicate** — simpler but violates DRY

**Recommendation**: Extract into `src/adapters/automation/spa-detector.ts` as a shared utility.

## 5. Integration Points

### 5.1 Dynamic Loader (like Playwright)

Add to `src/adapters/index.ts`:

```typescript
export async function loadPuppeteerAdapter() {
  try {
    const module = await import('./automation/puppeteer/adapter.js');
    return module.PuppeteerFetcherAdapter;
  } catch (err) {
    throw new Error(
      'PuppeteerFetcherAdapter requires "puppeteer" package. ' +
      'Install it in your project with: npm install puppeteer'
    );
  }
}
```

### 5.2 Public Exports

Update `src/adapters/automation/index.ts`:

```typescript
export { PuppeteerFetcherAdapter } from './puppeteer/adapter.js';
export type { PuppeteerAdapterOptions } from './puppeteer/options.js';
```

### 5.3 Type Exports

Update `src/adapters/index.ts` to export the new types, always optional (no hard dependency).

### 5.4 Compliance Tests

Add to `src/adapters/__tests__/adapter-interface-compliance.test.ts`:

```typescript
const implementations = [
  { name: 'HttpFetcherAdapter', create: () => new HttpFetcherAdapter() },
  // Puppeteer test would need a mock page — skipped here since it requires puppeteer package
];
```

## 6. Files to Create

| File | Purpose | Lines (est.) |
|---|---|---|
| `src/adapters/automation/puppeteer/adapter.ts` | Main adapter implementation | ~280 |
| `src/adapters/automation/puppeteer/options.ts` | Options interface | ~35 |
| `src/adapters/automation/puppeteer/index.ts` | Public re-exports | ~5 |
| `src/adapters/__tests__/puppeteer-fetcher-adapter.test.ts` | Unit tests | ~400 |
| `src/adapters/automation/spa-detector.ts` | Shared SPA hydration logic | ~60 |

## 7. Files to Modify

| File | Change |
|---|---|
| `src/adapters/index.ts` | Add `loadPuppeteerAdapter()`, export types |
| `src/adapters/automation/index.ts` | Re-export Puppeteer module |
| `docs/PLAYWRIGHT_INTEGRATION_GUIDE_V2.md` | Add Puppeteer section |
| `examples/puppeteer-adapter.ts` | Replace with production-quality example or point to the real adapter |

## 8. Backward Compatibility

- The existing `examples/puppeteer-adapter.ts` uses `page.goto()` for all resources — this should be replaced with the proper implementation
- No breaking changes to existing adapters or interfaces
- Puppeteer remains an optional dependency (like Playwright), loaded via dynamic import

## 9. Testing Strategy

| Test Level | What to Test | Approach |
|---|---|---|
| **Unit** | PuppeteerFetcherAdapter with mock Page | Mock Puppeteer Page/HTTP objects (similar to `playwright-fetcher-adapter.test.ts`) |
| **Integration** | End-to-end with real website | Requires Puppeteer browser installed — conditional skip (same pattern as `snapshot-with-playwright.test.ts`) |
| **Compliance** | Interface compliance | Add to `adapter-interface-compliance.test.ts` |
| **Load** | Dynamic import works | Similar to `load-playwright-adapter.test.ts` |

## 10. Risk Assessment

| Risk | Impact | Mitigation |
|---|---|---|
| No `context.request.fetch()` equivalent | High — core design difference | Use raw HTTP with cookie forwarding (Option A) |
| Cookie sync between pages | Medium — cookies may change after initial login | Expose `syncCookies()` method; suggest user calls it after auth flows |
| SPA hydration diverging from Playwright | Low — same `waitForFunction` concept exists | Extract shared SPA detector utility |
| Puppeteer version compatibility | Medium — API surface changes over versions | Pin tested version range in docs; use `peerDependencies` |

## 11. Summary

Implementing a Puppeteer adapter is **architecturally straightforward** because the `FetcherAdapter` interface was designed for this purpose. The main challenge is the **missing `context.request.fetch()` equivalent** in Puppeteer, which requires implementing raw HTTP requests with manual cookie forwarding.

**Total new code**: ~350 lines of adapter + ~400 lines of tests
**Modified existing code**: ~30 lines across 3 files
**No breaking changes** to existing API

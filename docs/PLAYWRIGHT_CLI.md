# CLI Playwright Support

Complete guide for using Playwright browser automation with the web-clone CLI tool.

## Overview

The CLI supports Playwright for advanced scenarios:
- **Authentication** - Login to protected websites
- **JavaScript Execution** - Snapshot dynamic/SPA websites
- **State Management** - Save and reuse authentication state
- **Custom Configuration** - Proxy, User-Agent, viewport settings

## Quick Start

### Basic Playwright Snapshot

```bash
npm run dev -- https://example.com --use-playwright
```

### With Authentication

```bash
# 1. Create auth script
cat > auth.js << 'EOF'
// page: Playwright Page object
// context: Playwright BrowserContext object
await page.goto('https://app.example.com/login');
await page.fill('input[name="email"]', 'user@example.com');
await page.fill('input[name="password"]', 'secret');
await page.click('button[type="submit"]');
await page.waitForURL('**/dashboard');
EOF

# 2. Run snapshot with auth
npm run dev -- https://app.example.com/dashboard \
  --use-playwright \
  --auth-script ./auth.js
```

## State Management

### Phase 2: Save and Restore State

Avoid repeated logins by saving and reusing authentication state.

#### Save State After Login

```bash
npm run dev -- https://app.example.com/dashboard \
  --use-playwright \
  --auth-script ./auth.js \
  --save-state ~/.app-state.json
```

Output:
```
✓ State saved to: ~/.app-state.json
  Cookies: 5
  LocalStorage items: 3
  Origins: https://app.example.com
```

#### Reuse Saved State

Fast snapshot without re-login:

```bash
npm run dev -- https://app.example.com/data \
  --use-playwright \
  --load-state ~/.app-state.json
```

#### State File Format

State files are JSON containing cookies and localStorage:

```json
{
  "cookies": [
    {
      "name": "session_id",
      "value": "abc123xyz",
      "domain": "app.example.com",
      "path": "/",
      "expires": 1700000000,
      "secure": true,
      "httpOnly": true,
      "sameSite": "Lax"
    }
  ],
  "origins": [
    {
      "origin": "https://app.example.com",
      "localStorage": [
        {
          "name": "user_token",
          "value": "eyJhbGci..."
        },
        {
          "name": "user_id",
          "value": "12345"
        }
      ]
    }
  ]
}
```

## Options Reference

### Basic Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--use-playwright` | flag | false | Enable Playwright browser |
| `--headless <bool>` | bool | true | Run in headless mode |
| `--proxy <url>` | string | - | HTTP proxy URL |
| `--user-agent <string>` | string | - | Custom User-Agent |
| `--viewport <widthxheight>` | string | - | Viewport size (e.g., 1920x1080) |

### Authentication Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--auth-script <path>` | path | - | Login script file (JavaScript) |
| `--auth-timeout <ms>` | number | 30000 | Auth script timeout |

### State Management (Phase 2)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--save-state <path>` | path | - | Save state (cookies, localStorage) |
| `--load-state <path>` | path | - | Load state before snapshot |

## Usage Patterns

### Pattern 1: Public Website (No Auth)

```bash
npm run dev -- https://example.com --use-playwright
```

Use when:
- Website requires JavaScript execution
- Default HTTP doesn't work properly

### Pattern 2: Protected Website (First Run)

```bash
npm run dev -- https://app.example.com/dashboard \
  --use-playwright \
  --auth-script ./auth.js \
  --save-state ./state.json
```

Use when:
- Website requires login
- You want to save credentials for reuse

### Pattern 3: Protected Website (Subsequent Runs)

```bash
npm run dev -- https://app.example.com/data \
  --use-playwright \
  --load-state ./state.json
```

Use when:
- State was previously saved
- Want to skip login flow

### Pattern 4: Complex Configuration

```bash
npm run dev -- https://app.example.com \
  --use-playwright \
  --headless false \
  --proxy http://proxy:8080 \
  --user-agent "Mozilla/5.0 (Custom)" \
  --viewport 1920x1080 \
  --auth-script ./auth.js \
  --auth-timeout 60000 \
  --save-state ./state.json \
  --extract-components \
  -o ./snapshot
```

Use when:
- Special proxy or user-agent needed
- Custom viewport for testing responsive design
- Want component extraction alongside snapshot

## Authentication Script Guide

### Script Basics

Authentication scripts are JavaScript functions that run in the browser context:

```javascript
// page: Playwright Page object
// context: Playwright BrowserContext object

// Navigate to login page
await page.goto('https://app.example.com/login');

// Fill form
await page.fill('#email', 'user@example.com');
await page.fill('#password', 'secret');

// Submit form
await page.click('button[type="submit"]');

// Wait for redirect
await page.waitForURL('**/dashboard');
```

### Common Patterns

#### Simple Form Login

```javascript
await page.goto('https://example.com/login');
await page.fill('input[name="username"]', 'user');
await page.fill('input[name="password"]', 'pass');
await page.click('button[type="submit"]');
await page.waitForURL('**/home');
```

#### OAuth/Redirect

```javascript
// Navigate to OAuth provider
await page.goto('https://example.com/login');
await page.click('a:has-text("Login with Google")');

// Fill Google login
await page.waitForURL('**/accounts.google.com/**');
await page.fill('#email', 'user@gmail.com');
await page.click('button:has-text("Next")');
await page.fill('#password', 'password');
await page.click('button:has-text("Next")');

// Wait for redirect back
await page.waitForURL('**/example.com/callback');
```

#### Wait for Dynamic Content

```javascript
await page.goto('https://app.example.com/login');
await page.fill('#username', 'user');
await page.fill('#password', 'pass');
await page.click('button[type="submit"]');

// Wait for specific element to appear
await page.waitForSelector('.dashboard-ready');

// Or wait for network idle
await page.waitForLoadState('networkidle');
```

### Error Handling

```javascript
// Check if login failed
await page.goto('https://app.example.com/login');
await page.fill('#email', 'user@example.com');
await page.fill('#password', 'secret');
await page.click('button[type="submit"]');

// Wait for either success or error
try {
  await Promise.race([
    page.waitForURL('**/dashboard'),
    page.waitForSelector('.error-message', { timeout: 5000 })
  ]);
} catch (err) {
  throw new Error('Login failed: ' + err.message);
}
```

## Security Considerations

### State Files

State files contain sensitive authentication tokens. Treat them like passwords:

```bash
# Good: Restrict permissions
chmod 600 ~/.app-state.json

# Good: Don't commit to git
echo "*.state.json" >> .gitignore
echo "state.json" >> .gitignore

# Good: Store securely
# - Use encrypted storage for production
# - Don't share state files
# - Rotate regularly
```

### Auth Scripts

Auth scripts are executed locally and have access to page/context:

```javascript
// ✓ Safe: Click, fill, navigate
await page.fill('#password', 'secret');
await page.click('button[type="submit"]');

// ⚠ Careful: Accessing sensitive data
const cookies = await context.cookies();
// Only store if needed for later

// ✗ Unsafe: Logging credentials
console.log('Password:', 'secret'); // Don't do this
```

## Troubleshooting

### Auth Script Times Out

```bash
# Increase timeout (default: 30000ms)
npm run dev -- https://app.example.com \
  --use-playwright \
  --auth-script ./auth.js \
  --auth-timeout 60000  # 60 seconds
```

Common causes:
- Slow network
- Multi-step authentication
- Waiting for email verification

### State Load Fails

```bash
# Check if state file exists
ls -la ~/.app-state.json

# State might be expired
# Solution: Re-login and save fresh state
npm run dev -- https://app.example.com \
  --use-playwright \
  --auth-script ./auth.js \
  --save-state ~/.app-state.json --overwrite
```

### Browser Hangs

```bash
# Run in visible mode for debugging
npm run dev -- https://app.example.com \
  --use-playwright \
  --headless false \
  --auth-script ./auth.js

# Check if page is waiting for interaction
# Add explicit waits in auth script
await page.waitForLoadState('networkidle');
```

### Different Snapshots with Same State

State includes:
- Cookies (persistent)
- localStorage (persistent)
- Not included: sessionStorage, IndexedDB, Service Worker cache

If snapshot differs after state reload, check:
- Does website use sessionStorage?
- Does website check IP/headers?
- Use `--user-agent` to match original if needed

## Advanced Topics

### Multi-Site Authentication

Save separate state files for different sites:

```bash
# Site A
npm run dev -- https://site-a.com \
  --use-playwright \
  --auth-script ./auth-a.js \
  --save-state ./state-a.json

# Site B
npm run dev -- https://site-b.com \
  --use-playwright \
  --auth-script ./auth-b.js \
  --save-state ./state-b.json

# Later: use respective state
npm run dev -- https://site-a.com --use-playwright --load-state ./state-a.json
npm run dev -- https://site-b.com --use-playwright --load-state ./state-b.json
```

### Proxied Authentication

Use proxy with authentication:

```bash
npm run dev -- https://internal.example.com \
  --use-playwright \
  --proxy http://user:pass@proxy:8080 \
  --auth-script ./auth-internal.js \
  --save-state ./internal-state.json
```

### Custom Headers + State

Combine custom headers with saved state:

```bash
npm run dev -- https://api.example.com \
  --use-playwright \
  --load-state ./api-state.json \
  --user-agent "MyBot/1.0" \
  --extract-components
```

## Examples

See complete examples in `docs/plan/examples.md`.

---

**Note**: Phase 2 (State Management) added `--save-state` and `--load-state` options.  
For Phase 0 features (basic Playwright, auth scripts), see earlier versions.

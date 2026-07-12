# Process Hang After Snapshot Complete

## Symptom

After `Snapshot complete!` is printed (typically within 2-3s), the terminal hangs for ~30 seconds with no output before the process silently exits.

## Root Cause

The 30-second delay is caused by **Node.js 19+ default HTTP Agent** behavior:

| Change | Node.js 18 | Node.js 19+ |
|--------|-----------|-------------|
| `http.globalAgent.keepAlive` | `false` | `true` |
| `freeSocketTimeout` | N/A | **30000ms** |

When `keepAlive: true`, idle sockets remain in the Agent's free socket pool for 30 seconds (`freeSocketTimeout`). Each idle socket holds an event loop reference, preventing the Node.js process from exiting.

Additional contributing factors:

1. **AbortController timer** (`setTimeout`) in `fetchWithTimeout` — keeps the event loop alive even if the request completed successfully (timer not cleared properly in edge cases)
2. **Socket timeout** (`req.setTimeout`) — a separate internal timer that also holds the event loop

## Fixes Applied

### 1. Custom HTTP Agent with `keepAlive: false` (`src/fetcher.ts`)

Instead of relying on the default agent (or `agent: false` which still creates a new Agent with Node.js 21+ defaults), create a dedicated Agent with `keepAlive: false`:

```typescript
const AgentClass = isHttps ? HttpsAgent : HttpAgent;
const httpAgent = proxyAgent || new AgentClass({ keepAlive: false, maxSockets: Infinity });
```

This ensures sockets are destroyed immediately after each request completes.

### 2. `timer.unref()` on AbortController timer (`src/fetcher.ts`)

```typescript
const timer = setTimeout(() => controller.abort(), timeout);
timer.unref(); // Don't let the abort timer keep the event loop alive
```

Prevents the `setTimeout` timer from holding the event loop. The `unref()` method allows the process to exit even if the timer is still pending.

### 3. Socket timeout handler (`src/fetcher.ts`)

```typescript
req.on('timeout', () => {
    clearTimeout(timer);
    req.destroy(new Error(`Socket timeout after ${timeout}ms for ${url}`));
});
```

The `timeout` option in `http.request` only sets the socket timeout timer — it does NOT destroy the socket. The `req.on('timeout')` handler explicitly destroys the socket and clears the abort timer.

### 4. `res.on('close')` guard (`src/fetcher.ts`)

If the server closes the connection without firing `res.on('end')`, the promise would hang forever. Added a `close` handler to reject the promise and clean up the timer.

### 5. `process.exit(0)` (`src/cli.ts`)

Forces the Node.js process to exit immediately after the workflow completes, bypassing any remaining event loop handles.

## Related Files

- `src/fetcher.ts` — `fetchWithTimeout()`: Agent creation, timer handling, socket timeout
- `src/cli.ts` — Action handler: `process.exit(0)` after snapshot completes
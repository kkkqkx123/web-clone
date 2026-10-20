/**
 * CLI End-to-End Tests (Phase 3)
 *
 * Verifies that the CLI can be invoked via tsx and produces output.
 *
 * Scenarios covered:
 * - Bundle mode
 * - Single file mode
 * - Pretty flag
 *
 * Uses a local Python HTTP server + local tsx binary to work in
 * network-restricted environments without depending on npm registry
 * or external URLs.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Path to cli.ts: apps/cli/src/__tests__/integration/ → apps/cli/src/cli.ts
const CLI_PATH = resolve(__dirname, '../../cli.ts');
// tsx binary at monorepo root
const TSX_PATH = resolve(__dirname, '../../../../../node_modules/.bin/tsx');
// Fixtures served by the local HTTP server
const FIXTURES_DIR = resolve(__dirname, 'fixtures');

let serverProc: ChildProcess;
let serverPort: number;

function startServer(): Promise<number> {
  return new Promise((resolveFn, reject) => {
    // Start Python HTTP server on a random port, serving the fixtures dir.
    // -u flag disables output buffering so we can parse the port immediately.
    serverProc = spawn('python3', ['-u', '-m', 'http.server', '0', '--bind', '127.0.0.1'], {
      cwd: FIXTURES_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let resolved = false;
    const onData = (chunk: Buffer) => {
      const text = chunk.toString();
      const match = text.match(/port (\d+)/);
      if (match && !resolved) {
        resolved = true;
        resolveFn(parseInt(match[1], 10));
      }
    };
    serverProc.stderr?.on('data', onData);
    serverProc.stdout?.on('data', onData);

    serverProc.on('error', reject);
    serverProc.on('exit', (code) => {
      if (!resolved) reject(new Error(`Python server exited with code ${code}`));
    });
  });
}

function stopServer(): void {
  try {
    serverProc?.kill('SIGTERM');
  } catch {
    // Ignore errors during cleanup
  }
}

describe('CLI E2E — Full Pipeline (Phase 3)', () => {
  const testDir = './test-cli-e2e-output';

  beforeAll(async () => {
    serverPort = await startServer();
  }, 10000);

  afterAll(() => {
    stopServer();
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    const singleFile = `${testDir}.html`;
    if (existsSync(singleFile)) {
      rmSync(singleFile);
    }
  });

  it('should run bundle mode via tsx', () => {
    const testUrl = `http://127.0.0.1:${serverPort}/test-page.html`;
    const output = execSync(
      `${TSX_PATH} ${CLI_PATH} ${testUrl} -o ${testDir} -m bundle --max-assets 10`,
      { encoding: 'utf-8', timeout: 60000 }
    );

    expect(output).toContain('complete');
    expect(existsSync(`${testDir}/index.html`)).toBe(true);
  });

  it('should support single file mode', () => {
    const testUrl = `http://127.0.0.1:${serverPort}/test-page.html`;
    const outputFile = `${testDir}.html`;
    const output = execSync(
      `${TSX_PATH} ${CLI_PATH} ${testUrl} -o ${outputFile} -m single --max-assets 10 --no-inline`,
      { encoding: 'utf-8', timeout: 60000 }
    );

    expect(output).toContain('complete');
    expect(existsSync(outputFile)).toBe(true);
  });

  it('should support --pretty flag', () => {
    const testUrl = `http://127.0.0.1:${serverPort}/test-page.html`;
    const output = execSync(
      `${TSX_PATH} ${CLI_PATH} ${testUrl} -o ${testDir} -m bundle --pretty --max-assets 10`,
      { encoding: 'utf-8', timeout: 60000 }
    );

    expect(output).toContain('complete');
    expect(existsSync(`${testDir}/index.html`)).toBe(true);
  });
});

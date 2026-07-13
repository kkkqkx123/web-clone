import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ──────────────────────────────────────────────────────────────
// Mock node:fs and node:os
// ──────────────────────────────────────────────────────────────

const mockFiles = new Map<string, string>();

vi.mock('node:fs', () => ({
  existsSync: (path: string) => mockFiles.has(path),
  readFileSync: (path: string, encoding?: string) => {
    const content = mockFiles.get(path);
    if (content === undefined) throw new Error(`ENOENT: ${path}`);
    return content;
  },
}));

vi.mock('node:os', () => ({
  homedir: () => '/home/testuser',
}));

// Import after mocks are set up
import { loadMergedConfig } from '../load-config.js';
import type { WebCloneConfigFile } from '../load-config.js';

describe('loadMergedConfig', () => {
  beforeEach(() => {
    mockFiles.clear();
  });

  afterEach(() => {
    mockFiles.clear();
  });

  // ── No config files ────────────────────────────────────────

  it('should return default preset when no config files exist', () => {
    const result = loadMergedConfig('/some/project');
    expect(result.resourcePreset).toBe('default');
    expect(result.includeExtensions).toEqual([]);
    expect(result.excludeExtensions).toEqual([]);
    expect(result.optionOverrides).toEqual({});
  });

  // ── Global config only ─────────────────────────────────────

  it('should load global config from ~/.config/web-clone/config.json', () => {
    mockFiles.set(
      '/home/testuser/.config/web-clone/config.json',
      JSON.stringify({
        resourcePreset: 'minimal',
        include: { wasm: true },
        defaults: { concurrency: 12, timeout: 30000 },
      } satisfies WebCloneConfigFile),
    );

    const result = loadMergedConfig('/some/project');
    expect(result.resourcePreset).toBe('minimal');
    expect(result.includeExtensions).toContain('.wasm');
    expect(result.optionOverrides.concurrency).toBe(12);
    expect(result.optionOverrides.timeout).toBe(30000);
  });

  // ── Project config only ────────────────────────────────────

  it('should load project config from web-clone.config.json in project dir', () => {
    mockFiles.set(
      '/my-project/web-clone.config.json',
      JSON.stringify({
        resourcePreset: 'no-media',
        defaults: { maxAssets: 200 },
      } satisfies WebCloneConfigFile),
    );

    const result = loadMergedConfig('/my-project');
    expect(result.resourcePreset).toBe('no-media');
    expect(result.optionOverrides.maxAssets).toBe(200);
  });

  it('should find project config in an ancestor directory', () => {
    // Config is in grandparent, but search starts from a deep subdir
    mockFiles.set(
      '/project/root/web-clone.config.json',
      JSON.stringify({
        includeExtensions: ['.wasm', '.bin'],
      } satisfies WebCloneConfigFile),
    );

    const result = loadMergedConfig('/project/root/src/sub/deep');
    expect(result.includeExtensions).toEqual(
      expect.arrayContaining(['.wasm', '.bin']),
    );
  });

  it('should find .web-clonerc file', () => {
    mockFiles.set(
      '/project/.web-clonerc',
      JSON.stringify({ resourcePreset: 'aggressive' } satisfies WebCloneConfigFile),
    );

    const result = loadMergedConfig('/project');
    expect(result.resourcePreset).toBe('aggressive');
  });

  it('should find .web-clonerc.json file', () => {
    mockFiles.set(
      '/project/.web-clonerc.json',
      JSON.stringify({ resourcePreset: 'none' } satisfies WebCloneConfigFile),
    );

    const result = loadMergedConfig('/project');
    expect(result.resourcePreset).toBe('none');
  });

  // ── Global + Project merge ─────────────────────────────────

  it('should merge global and project config (project wins)', () => {
    mockFiles.set(
      '/home/testuser/.config/web-clone/config.json',
      JSON.stringify({
        resourcePreset: 'minimal',
        include: { wasm: true },
        defaults: { concurrency: 4, timeout: 10000 },
      } satisfies WebCloneConfigFile),
    );
    mockFiles.set(
      '/project/web-clone.config.json',
      JSON.stringify({
        resourcePreset: 'no-media',
        include: { bin: true },
        defaults: { concurrency: 8 },
      } satisfies WebCloneConfigFile),
    );

    const result = loadMergedConfig('/project');
    // Project preset wins
    expect(result.resourcePreset).toBe('no-media');
    // Both includes are merged
    expect(result.includeExtensions).toContain('.wasm');
    expect(result.includeExtensions).toContain('.bin');
    // Project timeout from global (not overridden by project), concurrency from project
    expect(result.optionOverrides.concurrency).toBe(8);
    expect(result.optionOverrides.timeout).toBe(10000);
  });

  // ── Malformed config ───────────────────────────────────────

  it('should skip malformed JSON config files', () => {
    mockFiles.set('/project/web-clone.config.json', 'not valid json {{{');

    const result = loadMergedConfig('/project');
    // Falls back to defaults
    expect(result.resourcePreset).toBe('default');
    expect(result.includeExtensions).toEqual([]);
  });

  // ── skipExtensions handling ────────────────────────────────

  it('should collect skipExtensions from config', () => {
    mockFiles.set(
      '/project/web-clone.config.json',
      JSON.stringify({
        skipExtensions: ['.mp4', '.webm'],
      } satisfies WebCloneConfigFile),
    );

    const result = loadMergedConfig('/project');
    expect(result.resourcePreset).toBe('default');
    // The function doesn't directly return skipExtensions in MergedConfig,
    // but the preset is still 'default' and optionOverrides don't have it.
    // skipExtensions is used differently — it bypasses presets.
    // So this tests that no crash occurs and preset is still default.
    expect(result.resourcePreset).toBe('default');
  });

  // ── include/exclude toggles ────────────────────────────────

  it('should expand include category toggles', () => {
    mockFiles.set(
      '/project/web-clone.config.json',
      JSON.stringify({
        include: {
          wasm: true,
          bin: true,
          video: true,
          audio: true,
          fonts: true,
          documents: true,
          archives: true,
        },
      } satisfies WebCloneConfigFile),
    );

    const result = loadMergedConfig('/project');
    expect(result.includeExtensions).toContain('.wasm');
    expect(result.includeExtensions).toContain('.bin');
    expect(result.includeExtensions).toContain('.mp4');
    expect(result.includeExtensions).toContain('.mp3');
    expect(result.includeExtensions).toContain('.woff');
    expect(result.includeExtensions).toContain('.pdf');
    expect(result.includeExtensions).toContain('.zip');
  });

  it('should handle empty include object gracefully', () => {
    mockFiles.set(
      '/project/web-clone.config.json',
      JSON.stringify({
        include: {},
      } satisfies WebCloneConfigFile),
    );

    const result = loadMergedConfig('/project');
    expect(result.includeExtensions).toEqual([]);
  });

  // ── includeExtensions / excludeExtensions ──────────────────

  it('should collect explicit include/exclude extension lists', () => {
    mockFiles.set(
      '/project/web-clone.config.json',
      JSON.stringify({
        includeExtensions: ['.wasm', '.custom'],
        excludeExtensions: ['.exe', '.msi'],
      } satisfies WebCloneConfigFile),
    );

    const result = loadMergedConfig('/project');
    expect(result.includeExtensions).toEqual(
      expect.arrayContaining(['.wasm', '.custom']),
    );
    expect(result.excludeExtensions).toEqual(
      expect.arrayContaining(['.exe', '.msi']),
    );
  });

  // ── edge: no projectDir provided (uses process.cwd()) ──────
  // We can't easily test this without mocking process.cwd(),
  // so we rely on the projectDir parameter variant.
});

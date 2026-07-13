import { extname } from 'node:path';
import { existsSync, readFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';

// ──────────────────────────────────────────────────────────────
// Magic number definitions
// ──────────────────────────────────────────────────────────────

const MAGIC_BYTES: Record<string, number[]> = {
  '.png':  [0x89, 0x50, 0x4e, 0x47],
  '.jpg':  [0xff, 0xd8, 0xff],
  '.jpeg': [0xff, 0xd8, 0xff],
  '.gif':  [0x47, 0x49, 0x46],
  '.webp': [0x52, 0x49, 0x46, 0x46],
  '.wasm': [0x00, 0x61, 0x73, 0x6d],
  '.woff': [0x77, 0x4f, 0x46, 0x46],
  '.woff2':[0x77, 0x4f, 0x46, 0x32],
  '.pdf':  [0x25, 0x50, 0x44, 0x46],
  '.zip':  [0x50, 0x4b, 0x03, 0x04],
  '.gz':   [0x1f, 0x8b, 0x08],
};

// ──────────────────────────────────────────────────────────────
// Validation result types
// ──────────────────────────────────────────────────────────────

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  filePath: string;
  severity: ValidationSeverity;
  message: string;
  category: 'magic' | 'json' | 'html-link' | 'mime' | 'zero-size' | 'external-ref';
}

export interface ValidationReport {
  totalFiles: number;
  issues: ValidationIssue[];
  passed: number;
  failed: number;
  warnings: number;
}

export interface CleanOptions {
  dryRun: boolean;
  removeZeroByte: boolean;
  removeCorrupted: boolean;
  removeExternalRefs: boolean;
}

// ──────────────────────────────────────────────────────────────
// Validator
// ──────────────────────────────────────────────────────────────

/**
 * Validate a downloaded snapshot directory for integrity issues.
 */
export function validateSnapshot(outputDir: string): ValidationReport {
  const issues: ValidationIssue[] = [];
  let fileCount = 0;

  const walkDir = (dir: string): void => {
    if (!existsSync(dir)) return;
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = dir + '/' + entry.name;
      if (entry.isDirectory()) {
        walkDir(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      fileCount++;

      const ext = extname(entry.name).toLowerCase();
      const stat = statSync(fullPath);

      // Check 1: Zero-size files
      if (stat.size === 0) {
        issues.push({
          filePath: fullPath,
          severity: 'error',
          message: 'Zero-length file',
          category: 'zero-size',
        });
        continue;
      }

      // Check 2: Magic number validation for known binary types
      if (MAGIC_BYTES[ext] && stat.size >= MAGIC_BYTES[ext].length) {
        const buffer = readFileSync(fullPath);
        const magic = MAGIC_BYTES[ext];
        const valid = magic.every((byte, idx) => buffer[idx] === byte);
        if (!valid) {
          issues.push({
            filePath: fullPath,
            severity: 'error',
            message: `Magic number mismatch for ${ext}`,
            category: 'magic',
          });
          continue;
        }
      }

      // Check 3: JSON parse validation
      if (ext === '.json' && stat.size > 0) {
        try {
          const content = readFileSync(fullPath, 'utf8');
          JSON.parse(content);
        } catch {
          issues.push({
            filePath: fullPath,
            severity: 'error',
            message: 'Invalid JSON — parse error',
            category: 'json',
          });
        }
      }

      // Check 4: HTML external link audit
      if (ext === '.html' || ext === '.htm') {
        const content = readFileSync(fullPath, 'utf8');
        const externalPattern = /(?:src|href)\s*=\s*["']https?:\/\/[^"']+["']/gi;
        const matches = content.match(externalPattern);
        if (matches && matches.length > 0) {
          issues.push({
            filePath: fullPath,
            severity: 'warning',
            message: `Contains ${matches.length} unresolveable external URL(s) — may not work offline`,
            category: 'html-link',
          });
        }
      }
    }
  };

  walkDir(outputDir);

  return {
    totalFiles: fileCount,
    issues,
    passed: issues.filter(i => i.severity !== 'error').length,
    failed: issues.filter(i => i.severity === 'error').length,
    warnings: issues.filter(i => i.severity === 'warning').length,
  };
}

// ──────────────────────────────────────────────────────────────
// Cleaner
// ──────────────────────────────────────────────────────────────

export interface CleanResult {
  removedFiles: string[];
  removedBytes: number;
  errors: string[];
  dryRun: boolean;
}

/**
 * Clean up corrupted or unwanted files from a snapshot directory.
 */
export function cleanSnapshot(outputDir: string, options: CleanOptions): CleanResult {
  const removedFiles: string[] = [];
  const errors: string[] = [];
  let removedBytes = 0;

  const walkDir = (dir: string): void => {
    if (!existsSync(dir)) return;
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = dir + '/' + entry.name;
      if (entry.isDirectory()) {
        walkDir(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;

      const ext = extname(entry.name).toLowerCase();
      const stat = statSync(fullPath);
      let shouldRemove = false;
      let reason = '';

      // Zero-byte files
      if (options.removeZeroByte && stat.size === 0) {
        shouldRemove = true;
        reason = 'zero-length';
      }

      // Corrupted files (magic number mismatch)
      if (!shouldRemove && options.removeCorrupted && MAGIC_BYTES[ext] && stat.size >= MAGIC_BYTES[ext].length) {
        const buffer = readFileSync(fullPath);
        const magic = MAGIC_BYTES[ext];
        if (!magic.every((byte, idx) => buffer[idx] === byte)) {
          shouldRemove = true;
          reason = `corrupted ${ext}`;
        }
      }

      if (shouldRemove) {
        removedBytes += stat.size;
        if (options.dryRun) {
          removedFiles.push(`${fullPath} (${reason}) — dry run, not removed`);
        } else {
          try {
            unlinkSync(fullPath);
            removedFiles.push(`${fullPath} (${reason})`);
          } catch (err) {
            errors.push(`Failed to remove ${fullPath}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }
    }
  };

  walkDir(outputDir);

  return { removedFiles, removedBytes, errors, dryRun: options.dryRun };
}

/**
 * Format a validation report for console output.
 */
export function formatValidationReport(report: ValidationReport): string {
  const lines: string[] = [];
  lines.push(`Validation Report:`);
  lines.push(`  Total files: ${report.totalFiles}`);
  lines.push(`  Passed:      ${report.passed}`);
  lines.push(`  Failed:      ${report.failed}`);
  lines.push(`  Warnings:    ${report.warnings}`);
  lines.push('');

  if (report.issues.length === 0) {
    lines.push('  ✓ All files passed validation');
    return lines.join('\n');
  }

  for (const issue of report.issues) {
    const icon = issue.severity === 'error' ? '✗' : issue.severity === 'warning' ? '⚠' : 'ℹ';
    lines.push(`  ${icon} [${issue.category}] ${issue.filePath}`);
    lines.push(`      ${issue.message}`);
  }

  return lines.join('\n');
}

/**
 * Format a clean result for console output.
 */
export function formatCleanResult(result: CleanResult): string {
  const lines: string[] = [];
  if (result.dryRun) {
    lines.push(`Clean (dry-run) — ${result.removedFiles.length} file(s) would be removed (${formatBytes(result.removedBytes)})`);
  } else {
    lines.push(`Clean — ${result.removedFiles.length} file(s) removed (${formatBytes(result.removedBytes)})`);
  }

  for (const f of result.removedFiles) {
    lines.push(`  ⊘ ${f}`);
  }
  for (const e of result.errors) {
    lines.push(`  ✗ ${e}`);
  }
  if (result.errors.length === 0 && result.removedFiles.length === 0) {
    lines.push('  Nothing to clean.');
  }
  return lines.join('\n');
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

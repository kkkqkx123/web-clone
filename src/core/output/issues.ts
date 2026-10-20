import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SnapshotIssue } from '../types.js';

const SEVERITY_ICONS: Record<string, string> = {
  error: '✗',
  warning: '⚠',
  info: 'ℹ',
};

const SEVERITY_LABELS: Record<string, string> = {
  error: 'ERROR',
  warning: 'WARNING',
  info: 'INFO',
};

const CATEGORY_LABELS: Record<string, string> = {
  html_fetch: 'HTML Fetch',
  css_fetch: 'CSS Fetch',
  asset_download: 'Asset Download',
  asset_validation: 'Asset Validation',
  memory_budget: 'Memory Budget',
  component_analysis: 'Component Analysis',
  resource_filter: 'Resource Filter',
  framework_detection: 'Framework Detection',
};

/**
 * Generate the Markdown content with title.
 */
function generateMarkdown(
  title: string,
  noIssuesMessage: string,
  issues: SnapshotIssue[]
): string {
  if (issues.length === 0) {
    return `# ${title}\n\n${noIssuesMessage}\n`;
  }

  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;
  const infoCount = issues.filter(i => i.severity === 'info').length;

  const lines: string[] = [];

  lines.push(`# ${title}`);
  lines.push('');
  lines.push(`**Summary**: ${issues.length} issue(s) total — ${errorCount} error(s), ${warningCount} warning(s), ${infoCount} info(s)`);
  lines.push('');

  for (const severity of ['error', 'warning', 'info'] as const) {
    const group = issues.filter(i => i.severity === severity);
    if (group.length === 0) continue;

    lines.push(`## ${SEVERITY_ICONS[severity]} ${SEVERITY_LABELS[severity]} (${group.length})`);
    lines.push('');

    const categoryMap = new Map<string, SnapshotIssue[]>();
    for (const issue of group) {
      const cat = issue.category;
      if (!categoryMap.has(cat)) categoryMap.set(cat, []);
      categoryMap.get(cat)!.push(issue);
    }

    for (const [category, catIssues] of categoryMap) {
      const catLabel = CATEGORY_LABELS[category] || category;
      lines.push(`### ${catLabel}`);

      for (const issue of catIssues) {
        lines.push(`- **${issue.source}**`);
        lines.push(`  - Message: ${issue.message}`);
        if (issue.detail) {
          lines.push(`  - Detail: ${issue.detail}`);
        }
        if (issue.action) {
          lines.push(`  - Action: ${issue.action}`);
        }
      }

      lines.push('');
    }
  }

  const actionableIssues = issues.filter(i => i.action);
  if (actionableIssues.length > 0) {
    lines.push('## Action Required');
    lines.push('');
    lines.push('The following issues may require manual intervention:');
    lines.push('');

    for (const issue of actionableIssues) {
      lines.push(`- **[${issue.source}](${issue.source})** — ${issue.action}`);
    }

    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Compute a quick summary of quality-review issues for console output.
 */
export function formatIssueSummary(issues: SnapshotIssue[]): string {
  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;

  if (issues.length === 0) {
    return 'No quality issues detected.';
  }

  const parts: string[] = [];
  if (errorCount > 0) parts.push(`${errorCount} error(s)`);
  if (warningCount > 0) parts.push(`${warningCount} warning(s)`);

  return `${parts.join(', ')} — see SNAPSHOT_ISSUES.md for details`;
}

/**
 * Compute a brief summary of fetch/debug log entries for console output.
 */
export function formatLogSummary(logs: SnapshotIssue[]): string {
  const errorCount = logs.filter(l => l.severity === 'error').length;
  const warningCount = logs.filter(l => l.severity === 'warning').length;

  if (logs.length === 0) {
    return 'No fetch issues logged.';
  }

  const parts: string[] = [];
  if (errorCount > 0) parts.push(`${errorCount} error(s)`);
  if (warningCount > 0) parts.push(`${warningCount} warning(s)`);

  return `${parts.join(', ')} — see SNAPSHOT_LOG.md for details`;
}

function normalizeAndDedupe(entries: SnapshotIssue[]): SnapshotIssue[] {
  const seen = new Set<string>();
  const normalized: SnapshotIssue[] = [];

  for (const entry of entries) {
    const key = `${entry.source}|${entry.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({
      ...entry,
      timestamp: entry.timestamp || new Date().toISOString(),
    });
  }

  return normalized;
}

function writeJsonFile(outputDir: string, filename: string, entries: SnapshotIssue[], sourceUrl: string): void {
  const normalized = normalizeAndDedupe(entries);
  const jsonContent = {
    sourceUrl,
    generatedAt: new Date().toISOString(),
    summary: {
      total: normalized.length,
      errors: normalized.filter(i => i.severity === 'error').length,
      warnings: normalized.filter(i => i.severity === 'warning').length,
      infos: normalized.filter(i => i.severity === 'info').length,
    },
    entries: normalized,
  };

  writeFileSync(join(outputDir, filename), JSON.stringify(jsonContent, null, 2), 'utf8');
}

/**
 * Write SNAPSHOT_ISSUES.json and SNAPSHOT_ISSUES.md to the output directory.
 * These are quality-review issues the user should inspect and act on.
 */
export function writeIssuesFiles(outputDir: string, issues: SnapshotIssue[], sourceUrl: string): void {
  const normalized = normalizeAndDedupe(issues);

  writeFileSync(
    join(outputDir, 'SNAPSHOT_ISSUES.json'),
    JSON.stringify({
      sourceUrl,
      generatedAt: new Date().toISOString(),
      summary: {
        total: normalized.length,
        errors: normalized.filter(i => i.severity === 'error').length,
        warnings: normalized.filter(i => i.severity === 'warning').length,
        infos: normalized.filter(i => i.severity === 'info').length,
      },
      issues: normalized,
    }, null, 2),
    'utf8'
  );

  const mdContent = generateMarkdown(
    'Snapshot Quality Issues',
    'No quality issues found during this snapshot. All resources appear correct.',
    normalized
  );
  writeFileSync(join(outputDir, 'SNAPSHOT_ISSUES.md'), mdContent, 'utf8');
}

/**
 * Write SNAPSHOT_LOG.json and SNAPSHOT_LOG.md to the output directory.
 * These are fetch/debug-level logs showing what happened during data retrieval.
 */
export function writeLogFiles(outputDir: string, logs: SnapshotIssue[], sourceUrl: string): void {
  writeJsonFile(outputDir, 'SNAPSHOT_LOG.json', logs, sourceUrl);

  const mdContent = generateMarkdown(
    'Snapshot Fetch Log',
    'No fetch issues logged. All resources were retrieved without errors.',
    normalizeAndDedupe(logs)
  );
  writeFileSync(join(outputDir, 'SNAPSHOT_LOG.md'), mdContent, 'utf8');
}

/**
 * 快照验证工具
 * 用于验证快照输出结构和内容
 */

import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * 验证快照目录结构
 */
export async function validateBundleStructure(
  outputDir: string
): Promise<{
  valid: boolean;
  structure: string[];
  errors: string[];
}> {
  const errors: string[] = [];
  const structure: string[] = [];

  try {
    // 检查必要的文件/目录
    const requiredFiles = ['index.html'];
    const requiredDirs = ['assets'];

    for (const file of requiredFiles) {
      const filePath = path.join(outputDir, file);
      try {
        await fs.access(filePath);
        structure.push(`✓ ${file}`);
      } catch {
        errors.push(`Missing required file: ${file}`);
      }
    }

    for (const dir of requiredDirs) {
      const dirPath = path.join(outputDir, dir);
      try {
        const stat = await fs.stat(dirPath);
        if (stat.isDirectory()) {
          structure.push(`✓ ${dir}/`);
        } else {
          errors.push(`${dir} is not a directory`);
        }
      } catch {
        errors.push(`Missing required directory: ${dir}`);
      }
    }

    // 检查 assets 子目录
    const assetsDir = path.join(outputDir, 'assets');
    try {
      const assets = await fs.readdir(assetsDir);
      if (assets.length === 0) {
        console.warn('Warning: assets directory is empty');
      }
      structure.push(`  assets/ (${assets.length} items)`);
    } catch {
      // assets 目录可能为空，不是错误
    }

    return {
      valid: errors.length === 0,
      structure,
      errors,
    };
  } catch (error) {
    return {
      valid: false,
      structure,
      errors: [
        ...errors,
        `Error validating bundle structure: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }
}

/**
 * 验证单文件 HTML 快照
 */
export async function validateSingleFileSnapshot(
  filePath: string
): Promise<{
  valid: boolean;
  hasDoctype: boolean;
  hasHtml: boolean;
  hasHead: boolean;
  hasBody: boolean;
  size: number;
  errors: string[];
}> {
  const errors: string[] = [];

  try {
    // 检查文件存在
    await fs.access(filePath);

    // 读取内容
    const content = await fs.readFile(filePath, 'utf-8');
    const size = content.length;

    // 检查必要的 HTML 标签
    const hasDoctype = /^<!DOCTYPE html>/i.test(content);
    const hasHtml = /<html/i.test(content);
    const hasHead = /<head/i.test(content);
    const hasBody = /<body/i.test(content);

    if (!hasDoctype) errors.push('Missing DOCTYPE declaration');
    if (!hasHtml) errors.push('Missing <html> tag');
    if (!hasHead) errors.push('Missing <head> tag');
    if (!hasBody) errors.push('Missing <body> tag');

    // 检查标签平衡
    if (!isHtmlBalanced(content)) {
      errors.push('HTML tags are not properly balanced');
    }

    return {
      valid: errors.length === 0,
      hasDoctype,
      hasHtml,
      hasHead,
      hasBody,
      size,
      errors,
    };
  } catch (error) {
    return {
      valid: false,
      hasDoctype: false,
      hasHtml: false,
      hasHead: false,
      hasBody: false,
      size: 0,
      errors: [
        `Error validating snapshot: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }
}

/**
 * 检查 HTML 标签是否平衡
 */
function isHtmlBalanced(html: string): boolean {
  const stack: string[] = [];
  const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g;
  const selfClosingTags = new Set([
    'area',
    'base',
    'br',
    'col',
    'embed',
    'hr',
    'img',
    'input',
    'link',
    'meta',
    'param',
    'source',
    'track',
    'wbr',
  ]);

  let match;
  while ((match = tagRegex.exec(html)) !== null) {
    const isClosing = match[0].startsWith('</');
    const tagName = match[1].toLowerCase();

    if (selfClosingTags.has(tagName)) {
      continue;
    }

    if (isClosing) {
      if (stack.length === 0 || stack[stack.length - 1] !== tagName) {
        return false;
      }
      stack.pop();
    } else {
      stack.push(tagName);
    }
  }

  return stack.length === 0;
}

/**
 * 检查 HTML 中的资源路径
 */
export async function validateAssetPaths(
  filePath: string,
  expectedPathPattern: string = './assets/'
): Promise<{
  valid: boolean;
  assetCount: number;
  pathsWithIssues: string[];
  errors: string[];
}> {
  const errors: string[] = [];
  const pathsWithIssues: string[] = [];

  try {
    const content = await fs.readFile(filePath, 'utf-8');

    // 检查 href 和 src 属性中的路径
    const hrefRegex = /href=["']([^"']+)["']/g;
    const srcRegex = /src=["']([^"']+)["']/g;

    let assetCount = 0;
    let match;

    // 检查 href
    while ((match = hrefRegex.exec(content)) !== null) {
      const path = match[1];
      // 跳过协议相对路径、绝对 URL 和 hash 链接
      if (!path.startsWith('http') && !path.startsWith('//') && !path.startsWith('#')) {
        assetCount++;
        if (
          !path.includes('data:') &&
          !path.startsWith(expectedPathPattern) &&
          path.startsWith('/')
        ) {
          pathsWithIssues.push(`href="${path}"`);
        }
      }
    }

    // 检查 src
    while ((match = srcRegex.exec(content)) !== null) {
      const path = match[1];
      // 跳过数据 URI
      if (!path.startsWith('data:')) {
        assetCount++;
        if (!path.startsWith(expectedPathPattern)) {
          pathsWithIssues.push(`src="${path}"`);
        }
      }
    }

    return {
      valid: pathsWithIssues.length === 0,
      assetCount,
      pathsWithIssues,
      errors,
    };
  } catch (error) {
    return {
      valid: false,
      assetCount: 0,
      pathsWithIssues: [],
      errors: [
        `Error validating asset paths: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }
}

/**
 * 验证输出目录大小
 */
export async function validateOutputSize(
  outputDir: string,
  maxSize: number = 100 * 1024 * 1024 // 100 MB 默认
): Promise<{
  valid: boolean;
  totalSize: number;
  fileCount: number;
  errors: string[];
}> {
  const errors: string[] = [];

  try {
    let totalSize = 0;
    let fileCount = 0;

    async function calculateSize(dir: string): Promise<void> {
      const files = await fs.readdir(dir);

      for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = await fs.stat(filePath);

        if (stat.isDirectory()) {
          await calculateSize(filePath);
        } else {
          totalSize += stat.size;
          fileCount++;
        }
      }
    }

    await calculateSize(outputDir);

    if (totalSize > maxSize) {
      errors.push(
        `Output size ${formatSize(totalSize)} exceeds maximum ${formatSize(maxSize)}`
      );
    }

    return {
      valid: errors.length === 0,
      totalSize,
      fileCount,
      errors,
    };
  } catch (error) {
    return {
      valid: false,
      totalSize: 0,
      fileCount: 0,
      errors: [
        `Error calculating output size: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }
}

/**
 * 格式化文件大小
 */
function formatSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * 比较两个快照是否结构相同
 */
export async function compareSnapshots(
  snapshot1: string,
  snapshot2: string
): Promise<{
  identical: boolean;
  differences: string[];
}> {
  const differences: string[] = [];

  try {
    const content1 = await fs.readFile(snapshot1, 'utf-8');
    const content2 = await fs.readFile(snapshot2, 'utf-8');

    // 规范化内容（移除空白差异）
    const normalize = (content: string) =>
      content
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();

    const normalized1 = normalize(content1);
    const normalized2 = normalize(content2);

    const identical = normalized1 === normalized2;

    if (!identical) {
      differences.push('Snapshot content differs');

      // 更详细的比较
      const lines1 = normalized1.split(/[\s>]/);
      const lines2 = normalized2.split(/[\s>]/);

      if (lines1.length !== lines2.length) {
        differences.push(`Line count differs: ${lines1.length} vs ${lines2.length}`);
      }
    }

    return {
      identical,
      differences,
    };
  } catch (error) {
    return {
      identical: false,
      differences: [
        `Error comparing snapshots: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }
}

/**
 * 提取快照中的内容统计
 */
export async function extractSnapshotStats(filePath: string): Promise<{
  linkCount: number;
  scriptCount: number;
  imageCount: number;
  styleCount: number;
  textLength: number;
}> {
  const content = await fs.readFile(filePath, 'utf-8');

  return {
    linkCount: (content.match(/<link[^>]*>/gi) || []).length,
    scriptCount: (content.match(/<script[^>]*>/gi) || []).length,
    imageCount: (content.match(/<img[^>]*>/gi) || []).length,
    styleCount: (content.match(/<style[^>]*>/gi) || []).length,
    textLength: content.length,
  };
}

/**
 * 文件系统工具函数
 * 用于集成测试中的文件操作
 */

import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * 创建临时测试目录
 */
export async function createTestDir(basePath: string = './test-output'): Promise<string> {
  const timestamp = Date.now();
  const testDir = path.join(basePath, `test-${timestamp}`);

  await fs.mkdir(testDir, { recursive: true });

  return testDir;
}

/**
 * 清理测试目录
 */
export async function cleanupTestDir(dirPath: string): Promise<void> {
  try {
    await removeDir(dirPath);
  } catch (error) {
    console.warn(`Warning: Failed to cleanup ${dirPath}:`, error);
  }
}

/**
 * 递归删除目录
 */
export async function removeDir(dirPath: string): Promise<void> {
  try {
    const files = await fs.readdir(dirPath);

    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stat = await fs.stat(filePath);

      if (stat.isDirectory()) {
        await removeDir(filePath);
      } else {
        await fs.unlink(filePath);
      }
    }

    await fs.rmdir(dirPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

/**
 * 检查文件是否存在
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * 检查目录是否存在
 */
export async function dirExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * 读取文件内容
 */
export async function readFile(filePath: string, encoding: BufferEncoding = 'utf-8'): Promise<string> {
  return await fs.readFile(filePath, encoding);
}

/**
 * 读取 JSON 文件
 */
export async function readJson<T = Record<string, unknown>>(filePath: string): Promise<T> {
  const content = await readFile(filePath);
  return JSON.parse(content);
}

/**
 * 写入文件
 */
export async function writeFile(
  filePath: string,
  content: string | Buffer
): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, content);
}

/**
 * 写入 JSON 文件
 */
export async function writeJson<T = Record<string, unknown>>(
  filePath: string,
  data: T,
  pretty: boolean = true
): Promise<void> {
  const content = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  await writeFile(filePath, content);
}

/**
 * 列出目录中的所有文件
 */
export async function listFiles(dirPath: string, recursive: boolean = false): Promise<string[]> {
  const files: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir);

    for (const entry of entries) {
      const filePath = path.join(dir, entry);
      const stat = await fs.stat(filePath);

      if (stat.isDirectory()) {
        if (recursive) {
          await walk(filePath);
        }
      } else {
        files.push(filePath);
      }
    }
  }

  await walk(dirPath);

  return files;
}

/**
 * 获取目录中的所有文件和子目录
 */
export async function listEntries(dirPath: string): Promise<{
  files: string[];
  dirs: string[];
}> {
  const files: string[] = [];
  const dirs: string[] = [];

  const entries = await fs.readdir(dirPath);

  for (const entry of entries) {
    const filePath = path.join(dirPath, entry);
    const stat = await fs.stat(filePath);

    if (stat.isDirectory()) {
      dirs.push(entry);
    } else {
      files.push(entry);
    }
  }

  return { files, dirs };
}

/**
 * 获取文件大小
 */
export async function getFileSize(filePath: string): Promise<number> {
  const stat = await fs.stat(filePath);
  return stat.size;
}

/**
 * 获取目录的总大小
 */
export async function getDirSize(dirPath: string): Promise<number> {
  let totalSize = 0;

  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir);

    for (const entry of entries) {
      const filePath = path.join(dir, entry);
      const stat = await fs.stat(filePath);

      if (stat.isDirectory()) {
        await walk(filePath);
      } else {
        totalSize += stat.size;
      }
    }
  }

  await walk(dirPath);

  return totalSize;
}

/**
 * 复制文件或目录
 */
export async function copyFile(src: string, dest: string): Promise<void> {
  const dir = path.dirname(dest);
  await fs.mkdir(dir, { recursive: true });
  await fs.copyFile(src, dest);
}

/**
 * 复制整个目录
 */
export async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });

  const entries = await fs.readdir(src);

  for (const entry of entries) {
    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);

    const stat = await fs.stat(srcPath);

    if (stat.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await copyFile(srcPath, destPath);
    }
  }
}

/**
 * 比较两个文件内容
 */
export async function filesEqual(file1: string, file2: string): Promise<boolean> {
  const content1 = await readFile(file1);
  const content2 = await readFile(file2);

  return content1 === content2;
}

/**
 * 获取文件的行数
 */
export async function getFileLineCount(filePath: string): Promise<number> {
  const content = await readFile(filePath);
  return content.split('\n').length;
}

/**
 * 获取文件的修改时间
 */
export async function getFileModTime(filePath: string): Promise<Date> {
  const stat = await fs.stat(filePath);
  return stat.mtime;
}

/**
 * 检查文件是否在最近 N 毫秒内被修改
 */
export async function isRecentlyModified(filePath: string, timeMs: number = 5000): Promise<boolean> {
  const stat = await fs.stat(filePath);
  const modTime = stat.mtime.getTime();
  const now = Date.now();

  return now - modTime < timeMs;
}

/**
 * 生成唯一的测试文件名
 */
export function generateTestFileName(prefix: string = 'test', ext: string = '.html'): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);

  return `${prefix}-${timestamp}-${random}${ext}`;
}

/**
 * 规范化路径
 */
export function normalizePath(filePath: string): string {
  return path.normalize(filePath).replace(/\\/g, '/');
}

/**
 * 获取相对路径
 */
export function getRelativePath(from: string, to: string): string {
  return path.relative(from, to);
}

/**
 * 获取文件扩展名
 */
export function getFileExtension(filePath: string): string {
  return path.extname(filePath);
}

/**
 * 获取文件名（不含扩展名）
 */
export function getFileBaseName(filePath: string): string {
  return path.basename(filePath, path.extname(filePath));
}

/**
 * 合并路径
 */
export function joinPaths(...segments: string[]): string {
  return path.join(...segments);
}

/**
 * 检查是否为绝对路径
 */
export function isAbsolutePath(filePath: string): boolean {
  return path.isAbsolute(filePath);
}

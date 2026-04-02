import fs from 'fs/promises';
import path from 'path';
import https from 'https';
import http from 'http';
import type { ClientRequest } from 'http';
import type { ConvertedPage, MigrationConfig } from './converter.js';

/**
 * Write a converted page and its images to the Obsidian vault
 */
export async function writePage(
  vaultPath: string,
  page: ConvertedPage,
  config: MigrationConfig,
): Promise<void> {
  // 1. Determine file path, deduplicating if file already exists
  let mdFilePath = path.join(vaultPath, page.relativePath + '.md');
  const mdDir = path.dirname(mdFilePath);
  await fs.mkdir(mdDir, { recursive: true });

  // If file already exists, append date to filename
  mdFilePath = await deduplicateFilePath(mdFilePath);

  const normalizedContent = normalizeWrittenMarkdown(page.content);
  await fs.writeFile(mdFilePath, normalizedContent, 'utf-8');

  // 2. Download and save images
  if (page.images.length > 0) {
    const imageDir = resolveImageDir(vaultPath, mdFilePath, config);
    await fs.mkdir(imageDir, { recursive: true });

    for (const img of page.images) {
      const imgPath = path.join(imageDir, img.filename);
      try {
        await downloadFile(img.originalUrl, imgPath);
      } catch (err) {
        console.error(`⚠ 图片下载失败: ${img.originalUrl}`, err);
      }
    }
  }
}

/**
 * If the file already exists, append date to the filename.
 * e.g. "notes/hello.md" → "notes/hello-2025-03-30.md"
 */
async function deduplicateFilePath(filePath: string): Promise<string> {
  try {
    await fs.access(filePath);
    // File exists — append today's date
    const ext = path.extname(filePath);
    const base = filePath.slice(0, -ext.length);
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    let newPath = `${base}-${date}${ext}`;

    // If even that exists, add a counter
    let counter = 1;
    while (true) {
      try {
        await fs.access(newPath);
        counter++;
        newPath = `${base}-${date}-${counter}${ext}`;
      } catch {
        break; // File doesn't exist, use this path
      }
    }
    return newPath;
  } catch {
    // File doesn't exist, use original path
    return filePath;
  }
}

/**
 * Resolve the directory where images should be saved
 */
function resolveImageDir(
  vaultPath: string,
  mdFilePath: string,
  config: MigrationConfig,
): string {
  if (config.imagePathType === 'absolute') {
    return config.imagePath;
  }
  // Relative path: resolve relative to the .md file's directory
  const mdDir = path.dirname(mdFilePath);
  return path.resolve(mdDir, config.imagePath);
}

/**
 * 写入前的最终 Markdown 清理，兜底去除行尾空格和文件尾部纯空白行
 * Final Markdown cleanup before writing, removing trailing spaces and blank-only tail lines
 */
function normalizeWrittenMarkdown(content: string): string {
  const lines = content
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''));

  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }

  return lines.join('\n') + '\n';
}

/** 图片下载超时（毫秒）/ Image download timeout in ms */
const DOWNLOAD_TIMEOUT_MS = 15_000;

/**
 * 实际执行 HTTP(S) 下载，支持最多 5 次重定向
 * Perform the actual HTTP(S) download with up to 5 redirects and hard request timeout
 */
function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      callback();
    };

    const makeRequest = (requestUrl: string, redirectCount: number = 0) => {
      if (redirectCount > 5) {
        settle(() => reject(new Error('Too many redirects')));
        return;
      }

      const protocol = requestUrl.startsWith('https') ? https : http;
      const request: ClientRequest = protocol.get(requestUrl, (response) => {
        // Handle redirects
        if (response.statusCode && [301, 302, 303, 307, 308].includes(response.statusCode)) {
          const location = response.headers.location;
          if (location) {
            response.resume();
            makeRequest(location, redirectCount + 1);
            return;
          }
        }

        if (response.statusCode !== 200) {
          response.resume();
          settle(() => reject(new Error(`HTTP ${response.statusCode}`)));
          return;
        }

        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', async () => {
          try {
            await fs.writeFile(destPath, Buffer.concat(chunks));
            settle(resolve);
          } catch (err) {
            settle(() => reject(err));
          }
        });
        response.on('error', (err) => settle(() => reject(err)));
      });

      request.setTimeout(DOWNLOAD_TIMEOUT_MS, () => {
        request.destroy(new Error(`下载超时 (${DOWNLOAD_TIMEOUT_MS / 1000}s): ${requestUrl}`));
      });

      request.on('error', (err) => settle(() => reject(err)));
    };

    makeRequest(url);
  });
}

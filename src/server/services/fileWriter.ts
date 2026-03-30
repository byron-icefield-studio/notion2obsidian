import fs from 'fs/promises';
import path from 'path';
import https from 'https';
import http from 'http';
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

  await fs.writeFile(mdFilePath, page.content, 'utf-8');

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
 * Download a file from a URL to a local path
 */
function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;

    const makeRequest = (requestUrl: string, redirectCount: number = 0) => {
      if (redirectCount > 5) {
        reject(new Error('Too many redirects'));
        return;
      }

      protocol.get(requestUrl, (response) => {
        // Handle redirects
        if (response.statusCode && [301, 302, 303, 307, 308].includes(response.statusCode)) {
          const location = response.headers.location;
          if (location) {
            makeRequest(location, redirectCount + 1);
            return;
          }
        }

        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }

        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', async () => {
          try {
            await fs.writeFile(destPath, Buffer.concat(chunks));
            resolve();
          } catch (err) {
            reject(err);
          }
        });
        response.on('error', reject);
      }).on('error', reject);
    };

    makeRequest(url);
  });
}

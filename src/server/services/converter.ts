import { Client } from '@notionhq/client';
import { NotionToMarkdown } from 'notion-to-md';
import { v4 as uuidv4 } from 'uuid';
import type { PageData } from './notionService.js';

export interface ImageRef {
  originalUrl: string;
  uuid: string;
  extension: string;
  filename: string; // uuid.ext
}

export interface ConvertedPage {
  filename: string;       // target filename (without .md)
  relativePath: string;   // target relative path under vault
  content: string;        // final markdown content (frontmatter + body)
  images: ImageRef[];     // images to download
}

export interface MigrationConfig {
  pathTemplate: string;        // e.g. "{{database}}/{{title}}"
  mdTemplate: string;          // markdown template with {{variables}}
  imagePathType: 'relative' | 'absolute';
  imagePath: string;           // relative or absolute path
}

/**
 * Convert a Notion page to an Obsidian-compatible Markdown file
 */
export async function convertPage(
  token: string,
  pageData: PageData,
  config: MigrationConfig,
): Promise<ConvertedPage> {
  // 1. Convert blocks to markdown using notion-to-md
  const notion = new Client({ auth: token });
  const n2m = new NotionToMarkdown({ notionClient: notion });

  const mdBlocks = await n2m.pageToMarkdown(pageData.id);
  const mdResult = n2m.toMarkdownString(mdBlocks);
  /**
   * notion-to-md 在部分页面上可能返回不含 parent 的结果对象
   * Some notion-to-md responses may omit parent for certain pages
   */
  let markdownBody = typeof mdResult === 'string' ? mdResult : (mdResult.parent ?? '');

  // 2. Collect images from markdown and replace with Obsidian embeds
  const images: ImageRef[] = [];

  // Match markdown images: ![alt](url)
  markdownBody = markdownBody.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    (_match: string, _alt: string, url: string) => {
      if (!url.startsWith('http')) return _match;
      const ext = guessExtension(url);
      const id = uuidv4();
      const filename = `${id}.${ext}`;
      images.push({
        originalUrl: url,
        uuid: id,
        extension: ext,
        filename,
      });
      return `![[${filename}]]`;
    }
  );

  // 2.5 Collapse multiple consecutive blank lines into one
  markdownBody = markdownBody.replace(/\n{3,}/g, '\n\n');

  // 3. Build template variables
  const vars = buildTemplateVars(pageData, markdownBody);

  // 4. Render MD template
  const content = normalizeMarkdownOutput(renderTemplate(config.mdTemplate, vars));

  // 5. Compute target path
  const relativePath = renderTemplate(config.pathTemplate, vars)
    .replace(/[<>:"|?*]/g, '_') // sanitize for filesystem
    .replace(/\/{2,}/g, '/');

  const filename = relativePath.split('/').pop() || pageData.title || 'untitled';

  return {
    filename,
    relativePath,
    content,
    images,
  };
}

function buildTemplateVars(pageData: PageData, markdownContent: string): Record<string, string> {
  const vars: Record<string, string> = {
    title: pageData.title || '无标题',
    date: pageData.createdTime?.split('T')[0] || '',
    last_edited: pageData.lastEditedTime?.split('T')[0] || '',
    id: pageData.id,
    url: pageData.url || '',
    database: pageData.parentDatabaseName || '',
    content: markdownContent,
  };

  // Add all properties as prop.xxx
  if (pageData.properties) {
    for (const [key, value] of Object.entries(pageData.properties)) {
      const strValue = formatPropertyValue(value);
      vars[`prop.${key}`] = strValue;
    }
  }

  return vars;
}

function formatPropertyValue(value: any): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return `[${value.map(v => typeof v === 'string' ? v : JSON.stringify(v)).join(', ')}]`;
  }
  if (typeof value === 'boolean') return value.toString();
  if (typeof value === 'number') return value.toString();
  return String(value);
}

// ======= Template Engine with Formatter Support =======

/**
 * Supported format syntax:
 *
 *   {{date}}                  → 2025-03-30
 *   {{date|year}}             → 2025
 *   {{date|month}}            → 03
 *   {{date|day}}              → 30
 *   {{date|format:YYYY/MM}}   → 2025/03
 *   {{date|format:MM-DD}}     → 03-30
 *   {{last_edited|year}}      → 2025
 *   {{prop.MyDate|year}}      → 2025
 *   {{title|upper}}           → HELLO
 *   {{title|lower}}           → hello
 *   {{title|slug}}            → hello-world
 *   {{prop.Tags|join:, }}     → tag1, tag2
 */
function applyFormatter(value: string, formatter: string): string {
  const [name, ...args] = formatter.split(':');
  const arg = args.join(':'); // rejoin in case value has colons

  switch (name) {
    // === Date formatters ===
    case 'year': {
      const d = parseDate(value);
      return d ? String(d.getFullYear()) : value;
    }
    case 'month': {
      const d = parseDate(value);
      return d ? String(d.getMonth() + 1).padStart(2, '0') : value;
    }
    case 'day': {
      const d = parseDate(value);
      return d ? String(d.getDate()).padStart(2, '0') : value;
    }
    case 'hour': {
      const d = parseDate(value);
      return d ? String(d.getHours()).padStart(2, '0') : value;
    }
    case 'minute': {
      const d = parseDate(value);
      return d ? String(d.getMinutes()).padStart(2, '0') : value;
    }
    case 'timestamp': {
      const d = parseDate(value);
      return d ? String(d.getTime()) : value;
    }
    case 'format': {
      const d = parseDate(value);
      if (!d || !arg) return value;
      return formatDate(d, arg);
    }

    // === String formatters ===
    case 'upper':
      return value.toUpperCase();
    case 'lower':
      return value.toLowerCase();
    case 'trim':
      return value.trim();
    case 'slug':
      return value
        .toLowerCase()
        .replace(/[^\w\u4e00-\u9fff]+/g, '-')
        .replace(/^-+|-+$/g, '');

    // === Array-like formatters ===
    case 'join': {
      // If value looks like [a, b, c], parse and rejoin with custom separator
      const match = value.match(/^\[(.+)\]$/);
      if (match) {
        const items = match[1].split(',').map(s => s.trim());
        return items.join(arg || ', ');
      }
      return value;
    }

    default:
      return value;
  }
}

function parseDate(value: string): Date | null {
  if (!value) return null;
  // Handle ISO dates like "2025-03-30" or "2025-03-30T12:00:00.000Z"
  // Also handle "2025-03-30 ~ 2025-04-01" (range — use start)
  const dateStr = value.includes('~') ? value.split('~')[0].trim() : value.trim();
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

function formatDate(d: Date, format: string): string {
  const tokens: Record<string, string> = {
    'YYYY': String(d.getFullYear()),
    'YY': String(d.getFullYear()).slice(-2),
    'MM': String(d.getMonth() + 1).padStart(2, '0'),
    'M': String(d.getMonth() + 1),
    'DD': String(d.getDate()).padStart(2, '0'),
    'D': String(d.getDate()),
    'HH': String(d.getHours()).padStart(2, '0'),
    'mm': String(d.getMinutes()).padStart(2, '0'),
    'ss': String(d.getSeconds()).padStart(2, '0'),
  };

  let result = format;
  // Replace longest tokens first to avoid partial matches
  for (const [token, val] of Object.entries(tokens).sort((a, b) => b[0].length - a[0].length)) {
    result = result.replace(new RegExp(token, 'g'), val);
  }
  return result;
}

/**
 * Render a template string, replacing {{var}} and {{var|formatter}} with values.
 * Also supports {{#each properties}}...{{/each}} for iterating all properties.
 */
function renderTemplate(template: string, vars: Record<string, string>): string {
  let result = template;

  // Handle {{#each properties}}...{{/each}}
  result = result.replace(
    /\{\{#each\s+properties\}\}([\s\S]*?)\{\{\/each\}\}/g,
    (_match: string, inner: string) => {
      const lines: string[] = [];
      for (const [key, value] of Object.entries(vars)) {
        if (key.startsWith('prop.')) {
          const propName = key.substring(5);
          if (value === '' || value === null) continue;
          const line = inner
            .replace(/\{\{key\}\}/g, propName)
            .replace(/\{\{value\}\}/g, value);
          lines.push(line);
        }
      }
      return lines.join('');
    }
  );

  // Replace all {{var}} and {{var|formatter}} placeholders
  result = result.replace(/\{\{([^}]+)\}\}/g, (_match: string, expr: string) => {
    const trimmed = expr.trim();

    // Check for formatter: {{varName|formatter}} or {{varName|formatter:arg}}
    const pipeIndex = trimmed.indexOf('|');
    if (pipeIndex !== -1) {
      const varName = trimmed.substring(0, pipeIndex).trim();
      const formatter = trimmed.substring(pipeIndex + 1).trim();
      const rawValue = vars[varName];
      if (rawValue !== undefined) {
        return applyFormatter(rawValue, formatter);
      }
      return `{{${trimmed}}}`;
    }

    // Simple variable replacement
    return vars[trimmed] !== undefined ? vars[trimmed] : `{{${trimmed}}}`;
  });

  return result;
}

/**
 * 统一清理 Markdown 输出中的无用空白，避免正文首尾和行尾出现脏空格
 * Normalize Markdown output by removing useless leading/trailing whitespace and trailing line spaces
 */
function normalizeMarkdownOutput(content: string): string {
  const normalizedLines = content
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''));

  while (normalizedLines.length > 0 && normalizedLines[0].trim() === '') {
    normalizedLines.shift();
  }

  while (normalizedLines.length > 0 && normalizedLines[normalizedLines.length - 1].trim() === '') {
    normalizedLines.pop();
  }

  return normalizedLines.join('\n') + '\n';
}

function guessExtension(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const ext = pathname.split('.').pop()?.toLowerCase();
    if (ext && ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)) {
      return ext;
    }
  } catch { /* ignore */ }
  return 'png';
}

import type { BlockObjectResponse } from '@notionhq/client/build/src/api-endpoints.js';
import { getPageBlocks, queryDatabaseEntries } from '../services/notionService.js';
import type { PageData } from '../services/notionService.js';

/**
 * 扫描目标数据库中带指定标签且正文含图片块的页面
 * Scan tagged pages in a target database and report pages containing image blocks
 */
const DEFAULT_DATABASE_ID = 'b2f92598-da75-472c-83f8-a58513e908cc';

/**
 * CLI 参数对象，集中承载脚本运行配置
 * CLI options object that keeps script runtime configuration together
 */
interface ScanOptions {
  token: string;
  databaseId: string;
  tag: string;
  concurrency: number;
  json: boolean;
  silent: boolean;
  limit?: number;
}

/**
 * 单页图片扫描结果
 * Image scan result for a single page
 */
interface PageImageScanResult {
  date: string;
  title: string;
  url: string;
  pageId: string;
  imageCount: number;
  imageBlockIds: string[];
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`扫描失败: ${message}`);
  process.exitCode = 1;
});

/**
 * 脚本入口：拉取数据库条目、筛选日评、扫描图片块并输出列表
 * Script entry: fetch database entries, filter daily reviews, scan image blocks, and print list
 */
async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));

  if (!options.silent) {
    console.error(`读取数据库: ${options.databaseId}`);
  }

  const pages = await queryDatabaseEntries(options.token, options.databaseId);
  const taggedPages = pages
    .filter((page) => hasTag(page, options.tag))
    .sort((a, b) => getPageDate(a).localeCompare(getPageDate(b)));
  const targetPages = options.limit ? taggedPages.slice(0, options.limit) : taggedPages;

  if (!options.silent) {
    console.error(`发现 ${taggedPages.length} 个包含标签「${options.tag}」的页面，开始扫描图片块...`);
  }

  const results = await mapWithConcurrency(targetPages, options.concurrency, async (page, index) => {
    if (!options.silent) {
      console.error(`[${index + 1}/${targetPages.length}] ${page.title}`);
    }
    return scanPageImages(options.token, page);
  });

  const pagesWithImages = results
    .filter((result) => result.imageCount > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  printResults(pagesWithImages, options.json);
}

/**
 * 解析命令行参数和环境变量
 * Parse command-line arguments and environment variables
 */
function parseOptions(args: string[]): ScanOptions {
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  const token = getOptionValue(args, '--token') || process.env.NOTION_TOKEN || '';
  if (!token) {
    throw new Error('缺少 Notion Token。请通过 NOTION_TOKEN 环境变量或 --token 参数传入。');
  }

  const concurrencyText = getOptionValue(args, '--concurrency') || process.env.SCAN_CONCURRENCY || '2';
  const limitText = getOptionValue(args, '--limit');

  return {
    token,
    databaseId: getOptionValue(args, '--database') || process.env.NOTION_DATABASE_ID || DEFAULT_DATABASE_ID,
    tag: getOptionValue(args, '--tag') || process.env.NOTION_SCAN_TAG || '日评',
    concurrency: clampNumber(Number(concurrencyText), 1, 6, 2),
    json: args.includes('--json'),
    silent: args.includes('--silent'),
    limit: limitText ? Math.max(1, Number(limitText)) : undefined,
  };
}

/**
 * 获取形如 --name value 或 --name=value 的参数值
 * Read option values in either --name value or --name=value form
 */
function getOptionValue(args: string[], name: string): string | undefined {
  const equalsPrefix = `${name}=`;
  const equalsArg = args.find((arg) => arg.startsWith(equalsPrefix));
  if (equalsArg) return equalsArg.slice(equalsPrefix.length);

  const index = args.indexOf(name);
  if (index !== -1 && args[index + 1] && !args[index + 1].startsWith('--')) {
    return args[index + 1];
  }
  return undefined;
}

/**
 * 将数字限制在安全范围内，避免并发过高触发 Notion 限流
 * Clamp a number to a safe range to avoid excessive Notion rate limiting
 */
function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

/**
 * 判断页面属性 Tags 是否包含目标标签
 * Check whether the page Tags property contains the target tag
 */
function hasTag(page: PageData, tag: string): boolean {
  const tags = page.properties.Tags;
  if (Array.isArray(tags)) return tags.includes(tag);
  if (typeof tags === 'string') return tags === tag;
  return false;
}

/**
 * 获取页面业务日期，优先使用数据库 Date 属性
 * Get the page business date, preferring the database Date property
 */
function getPageDate(page: PageData): string {
  const date = page.properties.Date;
  if (typeof date === 'string' && date.length > 0) return date.split(' ')[0];
  return page.createdTime?.split('T')[0] || '';
}

/**
 * 扫描单页所有递归 block，提取 image block id
 * Scan all recursive blocks of one page and extract image block ids
 */
async function scanPageImages(token: string, page: PageData): Promise<PageImageScanResult> {
  const blocks = await getPageBlocks(token, page.id);
  const imageBlockIds = blocks
    .filter(isImageBlock)
    .map((block) => block.id);

  return {
    date: getPageDate(page),
    title: page.title,
    url: page.url,
    pageId: page.id,
    imageCount: imageBlockIds.length,
    imageBlockIds,
  };
}

/**
 * 判断 block 是否为 Notion 图片块
 * Check whether a block is a Notion image block
 */
function isImageBlock(block: BlockObjectResponse): boolean {
  return block.type === 'image';
}

/**
 * 受控并发 map，避免一次性打满 Notion API
 * Concurrency-limited map to avoid overwhelming the Notion API
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  /**
   * 单个 worker 循环消费队列
   * One worker loop that consumes the shared queue
   */
  async function runWorker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker()),
  );

  return results;
}

/**
 * 输出扫描结果，默认 TSV，便于复制到表格
 * Print scan results, TSV by default for easy spreadsheet copy-paste
 */
function printResults(results: PageImageScanResult[], json: boolean): void {
  if (json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  console.log('Date\tImages\tTitle\tURL\tImageBlockIds');
  for (const result of results) {
    console.log([
      result.date,
      result.imageCount,
      sanitizeCell(result.title),
      result.url,
      result.imageBlockIds.join(','),
    ].join('\t'));
  }
}

/**
 * 清理 TSV 单元格中的换行和制表符
 * Sanitize newlines and tabs in TSV cells
 */
function sanitizeCell(value: string): string {
  return value.replace(/[\t\r\n]+/g, ' ').trim();
}

/**
 * 打印脚本帮助文本
 * Print script help text
 */
function printHelp(): void {
  console.log(`Usage:
  NOTION_TOKEN=secret_xxx npm run scan:daily-review-images

Options:
  --database <id>       Notion database id, default is 道长复盘
  --tag <name>          Tag to scan, default: 日评
  --concurrency <n>     Concurrent page scans, default: 2, max: 6
  --limit <n>           Only scan first n tagged pages
  --json                Output JSON instead of TSV
  --silent              Hide progress logs
`);
}

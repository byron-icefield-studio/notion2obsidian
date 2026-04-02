import { Client } from '@notionhq/client';
import { APIResponseError } from '@notionhq/client';
import type {
  SearchResponse,
  GetDatabaseResponse,
  QueryDatabaseResponse,
  BlockObjectResponse,
  PageObjectResponse,
} from '@notionhq/client/build/src/api-endpoints.js';

/**
 * 指数退避重试 Notion API 调用，自动处理 429 限流
 * Retry Notion API calls with exponential backoff, handles 429 rate limiting
 */
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 5): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      // 429 限流：遵守 Retry-After 或指数退避 / Rate limited: honor Retry-After or use exponential backoff
      if (err instanceof APIResponseError && err.status === 429) {
        const retryAfter = Number((err as any).headers?.['retry-after'] ?? 0);
        const delay = retryAfter > 0 ? retryAfter * 1000 : Math.min(1000 * 2 ** attempt, 30_000);
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export interface NotionItem {
  id: string;
  type: 'database' | 'page';
  title: string;
  icon?: string;
  lastEdited?: string;
  parentId?: string | null;
}

export interface DatabaseSchema {
  id: string;
  title: string;
  properties: Record<string, { id: string; name: string; type: string }>;
}

export interface PageData {
  id: string;
  title: string;
  url: string;
  createdTime: string;
  lastEditedTime: string;
  properties: Record<string, any>;
  parentDatabaseId?: string;
  parentDatabaseName?: string;
}

function createClient(token: string): Client {
  return new Client({ auth: token });
}

function extractTitle(item: any): string {
  if (item.object === 'database') {
    return item.title?.map((t: any) => t.plain_text).join('') || '无标题数据库';
  }
  const props = item.properties || {};
  for (const key of Object.keys(props)) {
    const prop = props[key];
    if (prop.type === 'title') {
      return prop.title?.map((t: any) => t.plain_text).join('') || '无标题';
    }
  }
  return '无标题';
}

function extractIcon(item: any): string | undefined {
  const icon = item.icon;
  if (!icon) return undefined;
  if (icon.type === 'emoji') return icon.emoji;
  return undefined;
}

export async function search(token: string): Promise<NotionItem[]> {
  const notion = createClient(token);
  const items: NotionItem[] = [];
  let cursor: string | undefined = undefined;

  do {
    const response: SearchResponse = await withRetry(() => notion.search({
      start_cursor: cursor,
      page_size: 100,
    }));

    for (const result of response.results) {
      if (result.object === 'database') {
        items.push({
          id: result.id,
          type: 'database',
          title: extractTitle(result),
          icon: extractIcon(result),
          lastEdited: (result as any).last_edited_time,
        });
      } else if (result.object === 'page') {
        const page = result as PageObjectResponse;
        const parentId = page.parent.type === 'database_id'
          ? page.parent.database_id
          : null;
        items.push({
          id: page.id,
          type: 'page',
          title: extractTitle(page),
          icon: extractIcon(page),
          lastEdited: page.last_edited_time,
          parentId,
        });
      }
    }

    cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return items;
}

export async function getDatabase(token: string, databaseId: string): Promise<DatabaseSchema> {
  const notion = createClient(token);
  const db: GetDatabaseResponse = await withRetry(() => notion.databases.retrieve({ database_id: databaseId }));

  const properties: Record<string, { id: string; name: string; type: string }> = {};
  for (const [name, prop] of Object.entries((db as any).properties)) {
    properties[name] = {
      id: (prop as any).id,
      name,
      type: (prop as any).type,
    };
  }

  return {
    id: db.id,
    title: (db as any).title?.map((t: any) => t.plain_text).join('') || '无标题',
    properties,
  };
}

export async function queryDatabaseEntries(token: string, databaseId: string): Promise<PageData[]> {
  const notion = createClient(token);
  const pages: PageData[] = [];
  let cursor: string | undefined = undefined;

  const db = await getDatabase(token, databaseId);

  do {
    const response: QueryDatabaseResponse = await withRetry(() => notion.databases.query({
      database_id: databaseId,
      start_cursor: cursor,
      page_size: 100,
    }));

    for (const page of response.results) {
      if (page.object === 'page') {
        const p = page as PageObjectResponse;
        pages.push({
          id: p.id,
          title: extractTitle(p),
          url: p.url,
          createdTime: p.created_time,
          lastEditedTime: p.last_edited_time,
          properties: extractProperties(p.properties),
          parentDatabaseId: databaseId,
          parentDatabaseName: db.title,
        });
      }
    }

    cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return pages;
}

export async function getPage(token: string, pageId: string): Promise<PageData> {
  const notion = createClient(token);
  const page = await withRetry(() => notion.pages.retrieve({ page_id: pageId })) as PageObjectResponse;

  let parentDatabaseId: string | undefined;
  let parentDatabaseName: string | undefined;
  if (page.parent.type === 'database_id') {
    parentDatabaseId = page.parent.database_id;
    try {
      const db = await getDatabase(token, parentDatabaseId);
      parentDatabaseName = db.title;
    } catch { /* ignore */ }
  }

  return {
    id: page.id,
    title: extractTitle(page),
    url: page.url,
    createdTime: page.created_time,
    lastEditedTime: page.last_edited_time,
    properties: extractProperties(page.properties),
    parentDatabaseId,
    parentDatabaseName,
  };
}

export async function getPageBlocks(token: string, pageId: string): Promise<BlockObjectResponse[]> {
  const notion = createClient(token);
  const blocks: BlockObjectResponse[] = [];

  async function fetchChildren(blockId: string) {
    let cursor: string | undefined = undefined;
    do {
      const response = await withRetry(() => notion.blocks.children.list({
        block_id: blockId,
        start_cursor: cursor,
        page_size: 100,
      }));

      for (const block of response.results) {
        const b = block as BlockObjectResponse;
        blocks.push(b);
        if (b.has_children) {
          await fetchChildren(b.id);
        }
      }

      cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
    } while (cursor);
  }

  await fetchChildren(pageId);
  return blocks;
}

function extractProperties(properties: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [name, prop] of Object.entries(properties)) {
    result[name] = extractPropertyValue(prop);
  }
  return result;
}

function extractPropertyValue(prop: any): any {
  switch (prop.type) {
    case 'title':
      return prop.title?.map((t: any) => t.plain_text).join('') || '';
    case 'rich_text':
      return prop.rich_text?.map((t: any) => t.plain_text).join('') || '';
    case 'number':
      return prop.number;
    case 'select':
      return prop.select?.name || null;
    case 'multi_select':
      return prop.multi_select?.map((s: any) => s.name) || [];
    case 'date':
      if (!prop.date) return null;
      return prop.date.end
        ? `${prop.date.start} ~ ${prop.date.end}`
        : prop.date.start;
    case 'checkbox':
      return prop.checkbox;
    case 'url':
      return prop.url;
    case 'email':
      return prop.email;
    case 'phone_number':
      return prop.phone_number;
    case 'status':
      return prop.status?.name || null;
    case 'relation':
      return prop.relation?.map((r: any) => r.id) || [];
    case 'rollup':
      return prop.rollup?.array?.map((item: any) => extractPropertyValue(item)) || null;
    case 'formula':
      if (prop.formula.type === 'string') return prop.formula.string;
      if (prop.formula.type === 'number') return prop.formula.number;
      if (prop.formula.type === 'boolean') return prop.formula.boolean;
      if (prop.formula.type === 'date') return prop.formula.date?.start || null;
      return null;
    case 'files':
      return prop.files?.map((f: any) => {
        if (f.type === 'file') return f.file.url;
        if (f.type === 'external') return f.external.url;
        return null;
      }).filter(Boolean) || [];
    case 'people':
      return prop.people?.map((p: any) => p.name || p.id) || [];
    case 'created_time':
      return prop.created_time;
    case 'last_edited_time':
      return prop.last_edited_time;
    case 'created_by':
      return prop.created_by?.name || prop.created_by?.id || null;
    case 'last_edited_by':
      return prop.last_edited_by?.name || prop.last_edited_by?.id || null;
    default:
      return null;
  }
}

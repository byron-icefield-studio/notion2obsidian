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

export interface MigrationConfig {
  pathTemplate: string;
  mdTemplate: string;
  imagePathType: 'relative' | 'absolute';
  imagePath: string;
}

export interface MigrationItem {
  id: string;
  type: 'database' | 'page';
  title: string;
}

/**
 * 迁移过程中的 SSE 事件，使用 discriminated union 确保各 type 字段的精确类型约束
 * SSE events during migration, discriminated union enforces precise types per event kind
 */
export type MigrationEvent =
  | { type: 'status'; message: string }
  | { type: 'total'; total: number }
  | { type: 'progress'; current: number; total: number; title: string; message: string }
  | { type: 'page_done'; current: number; total: number; title: string; status: 'success'; path: string; imageCount: number }
  | { type: 'page_done'; current: number; total: number; title: string; status: 'failed'; error: string }
  | { type: 'done'; message: string; summary: { total: number; success: number; failed: number } }
  | { type: 'error'; message: string }
  | { type: 'cancelled'; message: string };

export interface DirEntry {
  name: string;
  path: string;
}

export interface DirListing {
  current: string;
  parent: string;
  dirs: DirEntry[];
}

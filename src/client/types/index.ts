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

export interface MigrationEvent {
  type: 'status' | 'total' | 'progress' | 'page_done' | 'done' | 'cancelled' | 'error';
  message?: string;
  current?: number;
  total?: number;
  title?: string;
  status?: 'success' | 'failed';
  path?: string;
  error?: string;
  imageCount?: number;
  summary?: { total: number; success: number; failed: number };
}

export interface DirEntry {
  name: string;
  path: string;
}

export interface DirListing {
  current: string;
  parent: string;
  dirs: DirEntry[];
}

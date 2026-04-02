import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { NotionItem, MigrationConfig, MigrationEvent, MigrationItem, DatabaseSchema } from '../types';

/**
 * 全局应用状态
 * Global application state
 */
interface AppState {
  // Settings
  token: string;
  vaultPath: string;
  setToken: (token: string) => void;
  setVaultPath: (path: string) => void;
  showSettings: boolean;
  setShowSettings: (show: boolean) => void;

  // Notion data
  notionItems: NotionItem[];
  setNotionItems: (items: NotionItem[]) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  error: string | null;
  setError: (error: string | null) => void;

  // Database schemas (cached in memory only, no persistence needed)
  databaseSchemas: Record<string, DatabaseSchema>;
  setDatabaseSchema: (id: string, schema: DatabaseSchema) => void;
  clearDatabaseSchemas: () => void;

  // Selection — 使用 Record 代替 Map，兼容 JSON 序列化 / Use Record instead of Map for JSON-serializable state
  selectedItems: Record<string, MigrationItem>;
  toggleItem: (item: MigrationItem) => void;
  clearSelection: () => void;
  isSelected: (id: string) => boolean;
  selectedCount: () => number;

  // Migration config
  config: MigrationConfig;
  setConfig: (config: Partial<MigrationConfig>) => void;

  // Migration progress
  isMigrating: boolean;
  setIsMigrating: (migrating: boolean) => void;
  migrationEvents: MigrationEvent[];
  addMigrationEvent: (event: MigrationEvent) => void;
  clearMigrationEvents: () => void;
  migrationTotal: number;
  setMigrationTotal: (total: number) => void;
  migrationCurrent: number;
  setMigrationCurrent: (current: number) => void;
}

/** 最多保留的迁移日志条目数，防止长时间迁移内存无限增长 / Max migration log entries to prevent unbounded memory growth */
const MAX_MIGRATION_EVENTS = 1000;

const DEFAULT_MD_TEMPLATE = `---
title: "{{title}}"
date: {{date}}
last_edited: {{last_edited}}
notion_id: {{id}}
{{#each properties}}
{{key}}: {{value}}
{{/each}}
---

{{content}}`;

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Settings
      token: '',
      vaultPath: '',
      setToken: (token) => set({ token }),
      setVaultPath: (path) => set({ vaultPath: path }),
      showSettings: false,
      setShowSettings: (show) => set({ showSettings: show }),

      // Notion data
      notionItems: [],
      setNotionItems: (items) => set({ notionItems: items }),
      isLoading: false,
      setIsLoading: (loading) => set({ isLoading: loading }),
      error: null,
      setError: (error) => set({ error }),

      // Database schemas (内存缓存，不持久化 / in-memory cache, not persisted)
      databaseSchemas: {},
      setDatabaseSchema: (id, schema) => set((state) => ({
        databaseSchemas: { ...state.databaseSchemas, [id]: schema },
      })),
      clearDatabaseSchemas: () => set({ databaseSchemas: {} }),

      // Selection
      selectedItems: {},
      toggleItem: (item) => set((state) => {
        const next = { ...state.selectedItems };
        if (next[item.id]) {
          delete next[item.id];
        } else {
          next[item.id] = item;
        }
        return { selectedItems: next };
      }),
      clearSelection: () => set({ selectedItems: {} }),
      isSelected: (id) => id in get().selectedItems,
      selectedCount: () => Object.keys(get().selectedItems).length,

      // Migration config
      config: {
        pathTemplate: '{{database}}/{{title}}',
        mdTemplate: DEFAULT_MD_TEMPLATE,
        imagePathType: 'relative',
        imagePath: './assets',
      },
      setConfig: (partial) => set((state) => ({
        config: { ...state.config, ...partial },
      })),

      // Migration progress
      isMigrating: false,
      setIsMigrating: (migrating) => set({ isMigrating: migrating }),
      migrationEvents: [],
      addMigrationEvent: (event) => set((state) => {
        const events = [...state.migrationEvents, event];
        // 超过上限时丢弃最早的事件 / Discard oldest events when limit is exceeded
        return { migrationEvents: events.length > MAX_MIGRATION_EVENTS ? events.slice(-MAX_MIGRATION_EVENTS) : events };
      }),
      clearMigrationEvents: () => set({ migrationEvents: [], migrationCurrent: 0, migrationTotal: 0 }),
      migrationTotal: 0,
      setMigrationTotal: (total) => set({ migrationTotal: total }),
      migrationCurrent: 0,
      setMigrationCurrent: (current) => set({ migrationCurrent: current }),
    }),
    {
      name: 'notion2obsidian-store',
      // 只持久化用户配置，不持久化运行时状态 / Only persist user config, not runtime state
      partialize: (state) => ({
        token: state.token,
        vaultPath: state.vaultPath,
        config: state.config,
      }),
    },
  ),
);

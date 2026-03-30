import { create } from 'zustand';
import type { NotionItem, MigrationConfig, MigrationEvent, MigrationItem, DatabaseSchema } from '../types';

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

  // Database schemas (cached)
  databaseSchemas: Record<string, DatabaseSchema>;
  setDatabaseSchema: (id: string, schema: DatabaseSchema) => void;

  // Selection
  selectedItems: Map<string, MigrationItem>;
  toggleItem: (item: MigrationItem) => void;
  clearSelection: () => void;
  isSelected: (id: string) => boolean;

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

export const useStore = create<AppState>((set, get) => ({
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

  // Database schemas
  databaseSchemas: {},
  setDatabaseSchema: (id, schema) => set((state) => ({
    databaseSchemas: { ...state.databaseSchemas, [id]: schema },
  })),

  // Selection
  selectedItems: new Map(),
  toggleItem: (item) => set((state) => {
    const newMap = new Map(state.selectedItems);
    if (newMap.has(item.id)) {
      newMap.delete(item.id);
    } else {
      newMap.set(item.id, item);
    }
    return { selectedItems: newMap };
  }),
  clearSelection: () => set({ selectedItems: new Map() }),
  isSelected: (id) => get().selectedItems.has(id),

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
  addMigrationEvent: (event) => set((state) => ({
    migrationEvents: [...state.migrationEvents, event],
  })),
  clearMigrationEvents: () => set({ migrationEvents: [], migrationCurrent: 0, migrationTotal: 0 }),
  migrationTotal: 0,
  setMigrationTotal: (total) => set({ migrationTotal: total }),
  migrationCurrent: 0,
  setMigrationCurrent: (current) => set({ migrationCurrent: current }),
}));

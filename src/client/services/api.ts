import type { NotionItem, DatabaseSchema, DirListing, MigrationEvent } from '../types';

const BASE = '/api';

/**
 * 通用 JSON 请求，token 通过 Authorization header 传递
 * Generic JSON request; token passed via Authorization header
 */
async function request<T>(path: string, options?: RequestInit, token?: string): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { headers, ...options });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as any).error || `请求失败: ${res.status}`);
  }
  return res.json();
}

// Notion API
export async function searchNotion(token: string): Promise<NotionItem[]> {
  const data = await request<{ items: NotionItem[] }>('/notion/search', { method: 'POST' }, token);
  return data.items;
}

export async function getDatabaseSchema(token: string, id: string): Promise<DatabaseSchema> {
  return request<DatabaseSchema>(`/notion/databases/${id}`, { method: 'POST' }, token);
}

export async function getDatabaseEntries(token: string, id: string) {
  const data = await request<{ entries: any[] }>(`/notion/databases/${id}/entries`, { method: 'POST' }, token);
  return data.entries;
}

// Filesystem API
export async function getHomeDir(): Promise<string> {
  const data = await request<{ path: string }>('/fs/home');
  return data.path;
}

export async function listDir(path: string): Promise<DirListing> {
  return request<DirListing>(`/fs/list?path=${encodeURIComponent(path)}`);
}

// Migration API (SSE)
export function startMigration(
  token: string,
  vaultPath: string,
  sessionId: string,
  items: Array<{ id: string; type: string; title: string }>,
  config: any,
  onEvent: (event: MigrationEvent) => void,
  onError: (error: string) => void,
): AbortController {
  const controller = new AbortController();

  fetch(`${BASE}/migration/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ token, vaultPath, sessionId, items, config }),
    signal: controller.signal,
  })
    .then(async (response) => {
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        onError((data as any).error || '迁移启动失败');
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        onError('无法读取响应流');
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        /**
         * 修复 SSE 缓冲：按 \r?\n 分割，最后一个可能不完整的片段留在 buffer
         * Fix SSE buffer: split on \r?\n, keep potentially-incomplete last chunk in buffer
         */
        const lines = buffer.split(/\r?\n/);
        buffer = lines[lines.length - 1];

        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i];
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6)) as MigrationEvent;
              onEvent(event);
            } catch { /* ignore parse errors */ }
          }
        }
      }
    })
    .catch((err) => {
      if ((err as Error).name !== 'AbortError') {
        onError((err as Error).message || '迁移请求失败');
      }
    });

  return controller;
}

export async function cancelMigration(sessionId: string): Promise<void> {
  await request('/migration/cancel', {
    method: 'POST',
    body: JSON.stringify({ sessionId }),
  });
}

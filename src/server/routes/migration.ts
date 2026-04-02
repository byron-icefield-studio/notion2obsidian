import { Router } from 'express';
import type { Request, Response } from 'express';
import * as notionService from '../services/notionService.js';
import { convertPage } from '../services/converter.js';
import { writePage } from '../services/fileWriter.js';
import type { MigrationConfig } from '../services/converter.js';

const router = Router();

/**
 * 迁移日志前缀，方便在开发终端里快速过滤
 * Prefix for migration logs so they are easy to spot in dev output
 */
const MIGRATION_LOG_PREFIX = '[migration]';

/**
 * 每个迁移会话的状态，用 sessionId 隔离并发请求
 * Per-session migration state, isolated by sessionId to prevent concurrent request interference
 */
interface MigrationSession {
  cancelRequested: boolean;
  clientDisconnected: boolean;
}

const sessions = new Map<string, MigrationSession>();

interface MigrationRequest {
  token: string;
  vaultPath: string;
  sessionId: string;
  items: Array<{
    id: string;
    type: 'database' | 'page';
    title: string;
  }>;
  config: MigrationConfig;
}

// Start migration (SSE stream for progress)
router.post('/start', async (req: Request, res: Response) => {
  const { token, vaultPath, sessionId, items, config } = req.body as MigrationRequest;

  if (!token || !vaultPath || !sessionId || !items?.length || !config) {
    return res.status(400).json({ error: '缺少必要参数' });
  }

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // 注册本次会话 / Register this session
  const session: MigrationSession = { cancelRequested: false, clientDisconnected: false };
  sessions.set(sessionId, session);
  console.log(`${MIGRATION_LOG_PREFIX} start session=${sessionId} items=${items.length} vaultPath=${vaultPath}`);

  /**
   * 安全写入 SSE 事件，客户端断连后不再写入
   * Safe SSE write that no-ops if client has disconnected
   */
  const sendEvent = (data: unknown): boolean => {
    if (res.writableEnded || res.destroyed) return false;
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    return true;
  };

  /**
   * 只有请求被中止或响应异常关闭时，才认为客户端已断连
   * Treat only aborted requests or prematurely closed responses as client disconnects
   */
  req.on('aborted', () => {
    session.clientDisconnected = true;
    session.cancelRequested = true;
    console.warn(`${MIGRATION_LOG_PREFIX} request aborted session=${sessionId}`);
  });

  res.on('close', () => {
    if (!res.writableEnded) {
      session.clientDisconnected = true;
      session.cancelRequested = true;
      console.warn(`${MIGRATION_LOG_PREFIX} response closed early session=${sessionId}`);
    }
  });

  try {
    // 1. Expand databases to individual pages
    const allPages: notionService.PageData[] = [];

    sendEvent({ type: 'status', message: '正在收集页面信息...' });
    console.log(`${MIGRATION_LOG_PREFIX} collect pages session=${sessionId}`);

    for (const item of items) {
      if (session.cancelRequested) break;

      if (item.type === 'database') {
        const entries = await notionService.queryDatabaseEntries(token, item.id);
        allPages.push(...entries);
      } else {
        const page = await notionService.getPage(token, item.id);
        allPages.push(page);
      }
    }

    const total = allPages.length;
    console.log(`${MIGRATION_LOG_PREFIX} collected session=${sessionId} totalPages=${total}`);
    if (!sendEvent({ type: 'total', total })) return;

    let success = 0;
    let failed = 0;

    // 2. Process each page
    for (let i = 0; i < allPages.length; i++) {
      if (session.cancelRequested) {
        console.warn(
          `${MIGRATION_LOG_PREFIX} cancelled session=${sessionId} clientDisconnected=${session.clientDisconnected} current=${i} total=${allPages.length}`,
        );
        if (!session.clientDisconnected) {
          sendEvent({ type: 'cancelled', message: '迁移已取消' });
        }
        break;
      }

      const page = allPages[i];
      if (!sendEvent({
        type: 'progress',
        current: i + 1,
        total,
        title: page.title,
        message: `正在迁移: ${page.title}`,
      })) return;

      try {
        const converted = await convertPage(token, page, config);
        await writePage(vaultPath, converted, config);
        success++;
        if (!sendEvent({
          type: 'page_done',
          current: i + 1,
          total,
          title: page.title,
          status: 'success',
          path: converted.relativePath + '.md',
          imageCount: converted.images.length,
        })) return;
      } catch (err: unknown) {
        failed++;
        const message = err instanceof Error ? err.message : '未知错误';
        console.error(`迁移失败: ${page.title}`, err);
        if (!sendEvent({
          type: 'page_done',
          current: i + 1,
          total,
          title: page.title,
          status: 'failed',
          error: message,
        })) return;
      }
    }

    if (!session.cancelRequested) {
      console.log(`${MIGRATION_LOG_PREFIX} done session=${sessionId} total=${total} success=${success} failed=${failed}`);
      sendEvent({
        type: 'done',
        message: '迁移完成',
        summary: { total, success, failed },
      });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '迁移过程发生错误';
    console.error(`${MIGRATION_LOG_PREFIX} error session=${sessionId} message=${message}`);
    sendEvent({ type: 'error', message });
  } finally {
    console.log(
      `${MIGRATION_LOG_PREFIX} cleanup session=${sessionId} cancelRequested=${session.cancelRequested} clientDisconnected=${session.clientDisconnected}`,
    );
    sessions.delete(sessionId);
    res.end();
  }
});

// Cancel migration by sessionId
router.post('/cancel', (req: Request, res: Response) => {
  const { sessionId } = req.body as { sessionId?: string };
  if (sessionId && sessions.has(sessionId)) {
    sessions.get(sessionId)!.cancelRequested = true;
    console.warn(`${MIGRATION_LOG_PREFIX} cancel requested session=${sessionId}`);
    res.json({ message: '取消请求已发送' });
  } else {
    console.warn(`${MIGRATION_LOG_PREFIX} cancel requested for missing session=${sessionId ?? 'unknown'}`);
    res.status(404).json({ error: '未找到对应会话' });
  }
});

export default router;

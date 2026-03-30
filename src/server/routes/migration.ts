import { Router } from 'express';
import type { Request, Response } from 'express';
import * as notionService from '../services/notionService.js';
import { convertPage } from '../services/converter.js';
import { writePage } from '../services/fileWriter.js';
import type { MigrationConfig } from '../services/converter.js';

const router = Router();

let cancelRequested = false;

interface MigrationRequest {
  token: string;
  vaultPath: string;
  items: Array<{
    id: string;
    type: 'database' | 'page';
    title: string;
  }>;
  config: MigrationConfig;
}

// Start migration (SSE stream for progress)
router.post('/start', async (req: Request, res: Response) => {
  const { token, vaultPath, items, config } = req.body as MigrationRequest;

  if (!token || !vaultPath || !items?.length || !config) {
    return res.status(400).json({ error: '缺少必要参数' });
  }

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  cancelRequested = false;

  const sendEvent = (data: any) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    // 1. Expand databases to individual pages
    const allPages: notionService.PageData[] = [];

    sendEvent({ type: 'status', message: '正在收集页面信息...' });

    for (const item of items) {
      if (cancelRequested) break;

      if (item.type === 'database') {
        const entries = await notionService.queryDatabaseEntries(token, item.id);
        allPages.push(...entries);
      } else {
        const page = await notionService.getPage(token, item.id);
        allPages.push(page);
      }
    }

    const total = allPages.length;
    sendEvent({ type: 'total', total });

    let success = 0;
    let failed = 0;

    // 2. Process each page
    for (let i = 0; i < allPages.length; i++) {
      if (cancelRequested) {
        sendEvent({ type: 'cancelled', message: '迁移已取消' });
        break;
      }

      const page = allPages[i];
      sendEvent({
        type: 'progress',
        current: i + 1,
        total,
        title: page.title,
        message: `正在迁移: ${page.title}`,
      });

      try {
        const converted = await convertPage(token, page, config);
        await writePage(vaultPath, converted, config);
        success++;
        sendEvent({
          type: 'page_done',
          current: i + 1,
          total,
          title: page.title,
          status: 'success',
          path: converted.relativePath + '.md',
          imageCount: converted.images.length,
        });
      } catch (err: any) {
        failed++;
        console.error(`迁移失败: ${page.title}`, err);
        sendEvent({
          type: 'page_done',
          current: i + 1,
          total,
          title: page.title,
          status: 'failed',
          error: err.message || '未知错误',
        });
      }
    }

    if (!cancelRequested) {
      sendEvent({
        type: 'done',
        message: '迁移完成',
        summary: { total, success, failed },
      });
    }
  } catch (err: any) {
    sendEvent({
      type: 'error',
      message: err.message || '迁移过程发生错误',
    });
  } finally {
    res.end();
  }
});

// Cancel migration
router.post('/cancel', (_req: Request, res: Response) => {
  cancelRequested = true;
  res.json({ message: '取消请求已发送' });
});

export default router;

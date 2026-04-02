import { Router } from 'express';
import type { Request, Response } from 'express';
import * as notionService from '../services/notionService.js';

const router = Router();

/**
 * 从请求中提取 Notion token（支持 Authorization header 或 body.token 兜底）
 * Extract Notion token from Authorization header or fallback to body.token
 */
function extractToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return (req.body?.token as string) || null;
}

// Search workspace
router.post('/search', async (req: Request, res: Response) => {
  try {
    const token = extractToken(req);
    if (!token) return res.status(401).json({ error: '请提供 Notion Token' });
    const items = await notionService.search(token);
    res.json({ items });
  } catch (err: any) {
    console.error('Notion search error:', err);
    res.status(500).json({ error: err.message || '搜索失败' });
  }
});

// Get database schema
router.post('/databases/:id', async (req: Request, res: Response) => {
  try {
    const token = extractToken(req);
    if (!token) return res.status(401).json({ error: '请提供 Notion Token' });
    const schema = await notionService.getDatabase(token, req.params.id);
    res.json(schema);
  } catch (err: any) {
    console.error('Get database error:', err);
    res.status(500).json({ error: err.message || '获取数据库失败' });
  }
});

// Get database entries
router.post('/databases/:id/entries', async (req: Request, res: Response) => {
  try {
    const token = extractToken(req);
    if (!token) return res.status(401).json({ error: '请提供 Notion Token' });
    const entries = await notionService.queryDatabaseEntries(token, req.params.id);
    res.json({ entries });
  } catch (err: any) {
    console.error('Query database error:', err);
    res.status(500).json({ error: err.message || '查询数据库失败' });
  }
});

// Get page info
router.post('/pages/:id', async (req: Request, res: Response) => {
  try {
    const token = extractToken(req);
    if (!token) return res.status(401).json({ error: '请提供 Notion Token' });
    const page = await notionService.getPage(token, req.params.id);
    res.json(page);
  } catch (err: any) {
    console.error('Get page error:', err);
    res.status(500).json({ error: err.message || '获取页面失败' });
  }
});

export default router;

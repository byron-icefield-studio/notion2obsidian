import { Router } from 'express';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const router = Router();

// Get home directory
router.get('/home', (_req, res) => {
  res.json({ path: os.homedir() });
});

// List directories under a given path
router.get('/list', async (req, res) => {
  try {
    const dirPath = (req.query.path as string) || os.homedir();
    const resolvedPath = path.resolve(dirPath);

    const entries = await fs.readdir(resolvedPath, { withFileTypes: true });
    const dirs = entries
      .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
      .map(entry => ({
        name: entry.name,
        path: path.join(resolvedPath, entry.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json({
      current: resolvedPath,
      parent: path.dirname(resolvedPath),
      dirs,
    });
  } catch (err: any) {
    console.error('List dir error:', err);
    res.status(500).json({ error: err.message || '无法打开目录' });
  }
});

export default router;

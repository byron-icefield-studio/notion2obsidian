import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// API routes
import notionRoutes from './routes/notion.js';
import migrationRoutes from './routes/migration.js';
import filesystemRoutes from './routes/filesystem.js';

app.use('/api/notion', notionRoutes);
app.use('/api/migration', migrationRoutes);
app.use('/api/fs', filesystemRoutes);

async function startServer() {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      root: projectRoot,
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const clientDist = path.resolve(projectRoot, 'dist/client');
    app.use(express.static(clientDist));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`🚀 Notion → Obsidian 迁移工具已启动: http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);

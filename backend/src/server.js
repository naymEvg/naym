import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

import authRouter from './routes/auth.js';
import countriesRouter from './routes/countries.js';
import dossierRouter from './routes/dossier.js';
import uploadRouter from './routes/upload.js';
import adminRouter from './routes/admin.js';
import eventsRouter from './routes/events.js';
import { requireAuth } from './middleware/auth.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(morgan('dev'));
app.use(express.json({ limit: '2mb' }));

// Ensure base directories exist
const uploadBaseDir = process.env.UPLOAD_BASE_DIR || path.join(process.cwd(), 'uploads');
const dataBaseDir = process.env.DATA_BASE_DIR || path.join(process.cwd(), 'data');
const logBaseDir = process.env.LOG_BASE_DIR || path.join(process.cwd(), 'logs');
[uploadBaseDir, dataBaseDir, logBaseDir].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, env: process.env.NODE_ENV || 'development' });
});

app.use('/api/auth', authRouter);
app.use('/api', requireAuth, countriesRouter);
app.use('/api', requireAuth, dossierRouter);
app.use('/api', requireAuth, uploadRouter);
app.use('/api', requireAuth, adminRouter);
app.use('/api', requireAuth, eventsRouter);

// Auth-protected file fetch
import { getFileStreamForId } from './services/storage.js';
app.get('/api/files/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { user } = req;
    const streamInfo = await getFileStreamForId(id, user.userId);
    if (!streamInfo) return res.status(404).json({ error: 'NOT_FOUND' });
    res.setHeader('Content-Type', streamInfo.mimeType);
    return streamInfo.stream.pipe(res);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// Serve frontend (if dist is available)
const frontendDistDir = process.env.FRONTEND_DIST_DIR;
if (frontendDistDir && fs.existsSync(frontendDistDir)) {
  app.use(express.static(frontendDistDir));
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(frontendDistDir, 'index.html'));
  });
}

app.listen(port, () => {
  console.log(`[server] listening on http://localhost:${port}`);
});
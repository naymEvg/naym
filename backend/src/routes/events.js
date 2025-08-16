import { Router } from 'express';
import fs from 'fs';
import path from 'path';

const router = Router();
const logBaseDir = process.env.LOG_BASE_DIR || path.join(process.cwd(), 'logs');
const eventsFile = path.join(logBaseDir, 'events.log');

router.post('/events', (req, res) => {
	try {
		const { name, props } = req.body || {};
		if (!name) return res.status(400).json({ error: 'NAME_REQUIRED' });
		const evt = { ts: new Date().toISOString(), userId: req.user.userId, name, props: props || {} };
		fs.mkdirSync(logBaseDir, { recursive: true });
		fs.appendFileSync(eventsFile, JSON.stringify(evt) + '\n');
		return res.json({ ok: true });
	} catch (e) {
		console.error(e);
		return res.status(500).json({ error: 'EVENT_LOG_FAILED' });
	}
});

export default router;
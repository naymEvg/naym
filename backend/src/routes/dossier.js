import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import { getFileRecord } from '../services/storage.js';

const router = Router();

const dataBaseDir = process.env.DATA_BASE_DIR || path.join(process.cwd(), 'data');
const dossiersDir = path.join(dataBaseDir, 'dossiers');
const indexFile = path.join(dossiersDir, 'index.json');

function ensure() {
	if (!fs.existsSync(dossiersDir)) fs.mkdirSync(dossiersDir, { recursive: true });
	if (!fs.existsSync(indexFile)) fs.writeFileSync(indexFile, JSON.stringify({ dossiers: {} }, null, 2));
}

function readIndex() {
	ensure();
	return JSON.parse(fs.readFileSync(indexFile, 'utf-8'));
}

function writeIndex(data) {
	fs.writeFileSync(indexFile, JSON.stringify(data, null, 2));
}

router.post('/users/:id/dossier', async (req, res) => {
	try {
		const { id } = req.params; // userId in path
		if (id !== req.user.userId) return res.status(403).json({ error: 'FORBIDDEN' });
		const { countryId, checklist } = req.body || {};
		if (!countryId || !Array.isArray(checklist)) return res.status(400).json({ error: 'INVALID_BODY' });
		ensure();
		const dossierId = `${id}-${Date.now()}`;
		const record = { id: dossierId, userId: id, countryId, checklist, createdAt: new Date().toISOString() };
		const dossierPath = path.join(dossiersDir, `${dossierId}.json`);
		fs.writeFileSync(dossierPath, JSON.stringify(record, null, 2));
		const idx = readIndex();
		idx.dossiers[dossierId] = { path: dossierPath, userId: id };
		writeIndex(idx);
		return res.json({ id: dossierId, ok: true });
	} catch (e) {
		console.error(e);
		return res.status(500).json({ error: 'DOSSIER_SAVE_FAILED' });
	}
});

router.get('/dossier/:id/export', async (req, res) => {
	try {
		const { id } = req.params;
		ensure();
		const idx = readIndex();
		const meta = idx.dossiers[id];
		if (!meta) return res.status(404).json({ error: 'DOSSIER_NOT_FOUND' });
		if (meta.userId !== req.user.userId) return res.status(403).json({ error: 'FORBIDDEN' });
		const dossier = JSON.parse(fs.readFileSync(meta.path, 'utf-8'));

		res.setHeader('Content-Type', 'application/zip');
		res.setHeader('Content-Disposition', `attachment; filename="dossier-${dossier.countryId}-${new Date().toISOString().slice(0,10)}.zip"`);
		const archive = archiver('zip', { zlib: { level: 9 } });
		archive.on('error', (err) => { throw err; });
		archive.pipe(res);

		// Add manifest JSON
		archive.append(Buffer.from(JSON.stringify({
			id: dossier.id,
			countryId: dossier.countryId,
			createdAt: dossier.createdAt,
			checklist: dossier.checklist
		}, null, 2)), { name: 'manifest.json' });

		// Add files
		for (const item of dossier.checklist) {
			if (item.fileId) {
				const rec = await getFileRecord(item.fileId);
				if (rec && rec.userId === req.user.userId) {
					const ext = path.extname(rec.path) || '.bin';
					const fname = `files/${rec.docType}/${item.id || rec.checklistItemId || rec.id}${ext}`;
					archive.file(rec.path, { name: fname });
				}
			}
		}

		await archive.finalize();
	} catch (e) {
		console.error(e);
		return res.status(500).json({ error: 'EXPORT_FAILED' });
	}
});

export default router;
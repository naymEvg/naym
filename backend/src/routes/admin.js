import { Router } from 'express';
import fs from 'fs';
import path from 'path';

const router = Router();
const dbDir = path.join(process.cwd(), 'src', 'db');
const countriesFile = path.join(dbDir, 'countries.json');
const dataBaseDir = process.env.DATA_BASE_DIR || path.join(process.cwd(), 'data');
const historyDir = path.join(dataBaseDir, 'rules_history');

function ensure() {
	if (!fs.existsSync(historyDir)) fs.mkdirSync(historyDir, { recursive: true });
}

router.post('/admin/country/:id/rules', (req, res) => {
	if (req.user.role !== 'admin') return res.status(403).json({ error: 'FORBIDDEN' });
	const countryId = req.params.id;
	const { validator, checklist } = req.body || {};
	if (!validator && !checklist) return res.status(400).json({ error: 'NO_CHANGES' });
	const db = JSON.parse(fs.readFileSync(countriesFile, 'utf-8'));
	const idx = db.countries.findIndex((c) => c.id === countryId);
	if (idx === -1) return res.status(404).json({ error: 'COUNTRY_NOT_FOUND' });
	const current = db.countries[idx];
	const prevVersion = Number(current.version || 0);
	const nextVersion = prevVersion + 1;
	const updated = { ...current };
	if (validator) updated.validator = validator;
	if (checklist) updated.checklist = checklist;
	updated.version = nextVersion;
	updated.updatedAt = new Date().toISOString();
	db.countries[idx] = updated;
	fs.writeFileSync(countriesFile, JSON.stringify(db, null, 2));

	ensure();
	const hFile = path.join(historyDir, `${countryId}.json`);
	let history = [];
	if (fs.existsSync(hFile)) history = JSON.parse(fs.readFileSync(hFile, 'utf-8'));
	history.push({ version: nextVersion, updatedAt: updated.updatedAt, validator: updated.validator, checklist: updated.checklist, updatedBy: req.user.email });
	fs.writeFileSync(hFile, JSON.stringify(history, null, 2));

	return res.json({ ok: true, version: nextVersion });
});

export default router;
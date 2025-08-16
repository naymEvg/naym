import { Router } from 'express';
import fs from 'fs';
import path from 'path';

const router = Router();
const dbDir = path.join(process.cwd(), 'src', 'db');
const countriesFile = path.join(dbDir, 'countries.json');

function readDb() {
  const raw = fs.readFileSync(countriesFile, 'utf-8');
  return JSON.parse(raw);
}

router.get('/countries', (req, res) => {
  const db = readDb();
  const countries = db.countries.map(({ id, name, code, emoji }) => ({ id, name, code, emoji }));
  res.json({ countries });
});

router.get('/countries/:id/checklist', (req, res) => {
  const db = readDb();
  const country = db.countries.find((c) => c.id === req.params.id);
  if (!country) return res.status(404).json({ error: 'COUNTRY_NOT_FOUND' });
  res.json({ checklist: country.checklist, validator: country.validator });
});

export default router;
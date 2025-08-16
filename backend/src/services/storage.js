import fs from 'fs';
import path from 'path';
import { nanoid } from 'nanoid';
import mime from 'mime-types';

const uploadBaseDir = process.env.UPLOAD_BASE_DIR || path.join(process.cwd(), 'uploads');
const dataBaseDir = process.env.DATA_BASE_DIR || path.join(process.cwd(), 'data');
const indexFile = path.join(dataBaseDir, 'uploads_index.json');

function ensureIndex() {
	if (!fs.existsSync(dataBaseDir)) fs.mkdirSync(dataBaseDir, { recursive: true });
	if (!fs.existsSync(indexFile)) fs.writeFileSync(indexFile, JSON.stringify({ files: {} }, null, 2));
}

function readIndex() {
	ensureIndex();
	return JSON.parse(fs.readFileSync(indexFile, 'utf-8'));
}

function writeIndex(data) {
	fs.writeFileSync(indexFile, JSON.stringify(data, null, 2));
}

export async function saveUploadedFile({ buffer, originalName, mimeType, sizeBytes, userId, countryId, docType, checklistItemId }) {
	const id = nanoid(16);
	const env = process.env.NODE_ENV || 'development';
	const ext = mime.extension(mimeType) || (originalName.split('.').pop() || 'bin');
	const dir = path.join(uploadBaseDir, env, userId, countryId, docType, id);
	fs.mkdirSync(dir, { recursive: true });
	const filePath = path.join(dir, `original.${ext}`);
	fs.writeFileSync(filePath, buffer);
	const record = {
		id,
		userId,
		countryId,
		docType,
		checklistItemId,
		originalName,
		mimeType,
		sizeBytes,
		path: filePath,
		createdAt: new Date().toISOString()
	};
	const db = readIndex();
	db.files[id] = record;
	writeIndex(db);
	return record;
}

export async function getFileRecord(id) {
	const db = readIndex();
	return db.files[id] || null;
}

export async function getFileStreamForId(id, userId) {
	const rec = await getFileRecord(id);
	if (!rec) return null;
	if (rec.userId !== userId) return null;
	const stream = fs.createReadStream(rec.path);
	const mimeType = rec.mimeType || mime.lookup(rec.path) || 'application/octet-stream';
	return { stream, mimeType };
}

export function getUserFiles(userId) {
	const db = readIndex();
	return Object.values(db.files).filter((f) => f.userId === userId);
}
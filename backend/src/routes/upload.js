import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { saveUploadedFile } from '../services/storage.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const dbDir = path.join(process.cwd(), 'src', 'db');
const countriesFile = path.join(dbDir, 'countries.json');
function readDb() {
	const raw = fs.readFileSync(countriesFile, 'utf-8');
	return JSON.parse(raw);
}

function ratioStringToNumber(ratioStr) {
	if (!ratioStr) return null;
	const [w, h] = String(ratioStr).split(':').map(Number);
	if (!w || !h) return null;
	return w / h;
}

async function analyzeBackgroundLightness(image) {
	try {
		const { width, height } = await image.metadata();
		const sampleSize = 5;
		const left = await image.extract({ left: 0, top: 0, width: sampleSize, height }).raw().toBuffer();
		const right = await image.extract({ left: Math.max(0, width - sampleSize), top: 0, width: sampleSize, height }).raw().toBuffer();
		const top = await image.extract({ left: 0, top: 0, width, height: sampleSize }).raw().toBuffer();
		const bottom = await image.extract({ left: 0, top: Math.max(0, height - sampleSize), width, height: sampleSize }).raw().toBuffer();
		const avg = (buf) => {
			let sum = 0;
			for (let i = 0; i < buf.length; i += 3) {
				const r = buf[i], g = buf[i + 1], b = buf[i + 2];
				sum += (0.2126 * r + 0.7152 * g + 0.0722 * b);
			}
			return sum / (buf.length / 3);
		};
		const avgL = avg(left), avgR = avg(right), avgT = avg(top), avgB = avg(bottom);
		const avgAll = (avgL + avgR + avgT + avgB) / 4;
		return avgAll / 255; // 0..1
	} catch (e) {
		return null;
	}
}

router.post('/upload', upload.single('file'), async (req, res) => {
	try {
		const file = req.file;
		const { countryId, docType, checklistItemId } = req.body || {};
		if (!file) return res.status(400).json({ error: 'FILE_REQUIRED' });
		if (!countryId || !docType) return res.status(400).json({ error: 'COUNTRY_AND_DOCTYPE_REQUIRED' });
		const db = readDb();
		const country = db.countries.find((c) => c.id === countryId);
		if (!country) return res.status(404).json({ error: 'COUNTRY_NOT_FOUND' });
		const rules = country.validator || {};

		const checks = {};
		const suggestions = {
			file_type: [
				"Загрузите фото в формате JPG или PNG.",
				"Если у вас PDF — экспортируйте изображение в JPG.",
				"Переименуйте файл без спецсимволов."
			],
			size: [
				"Сожмите изображение до 1–1.5 МБ.",
				"Используйте режим 'Сохранить для Web' в редакторе.",
				"Сделайте меньшее разрешение при сохранении."
			],
			dimensions: [
				"Попросите фотографа сделать снимок нужного размера.",
				"Сделайте новое фото с большим разрешением.",
				"Не кадрируйте слишком сильно."
			],
			aspect: [
				"Отключите авто-кадрирование в телефоне.",
				"Подгоните 35x45 мм без полей.",
				"Используйте шаблон в приложении."
			],
			background: [
				"Сфотографируйтесь на светлом/белом фоне.",
				"Избегайте теней, равномерный свет.",
				"Не используйте фильтры."
			]
		};

		// 1) File type
		const allowedTypes = (rules.file_types || ['jpg','jpeg','png']).map((t) => t.toLowerCase());
		const ext = (file.originalname.split('.').pop() || '').toLowerCase();
		checks.file_type = {
			ok: allowedTypes.includes(ext),
			message: allowedTypes.includes(ext) ? 'Формат файла допустим' : `Недопустимый формат файла: .${ext}. Разрешены: ${allowedTypes.join(', ')}`,
			tips: allowedTypes.includes(ext) ? [] : suggestions.file_type
		};

		// 2) File size
		const maxSize = Number(rules.max_size_bytes || 1572864);
		checks.size = {
			ok: file.size <= maxSize,
			message: file.size <= maxSize ? 'Размер файла в норме' : `Файл слишком большой: ${(file.size/1024/1024).toFixed(2)} МБ (лимит ${(maxSize/1024/1024).toFixed(2)} МБ)`,
			tips: file.size <= maxSize ? [] : suggestions.size
		};

		// Analyze image via sharp
		const image = sharp(file.buffer, { failOnError: false });
		const meta = await image.metadata();
		const width = meta.width || 0;
		const height = meta.height || 0;

		// 3) Min dimensions
		const minW = Number(rules.min_pixel_width || 600);
		const minH = Number(rules.min_pixel_height || 800);
		const dimsOk = width >= minW && height >= minH;
		checks.dimensions = {
			ok: dimsOk,
			message: dimsOk ? `Разрешение ок: ${width}x${height}` : `Разрешение мало: ${width}x${height}, минимум ${minW}x${minH}`,
			tips: dimsOk ? [] : suggestions.dimensions
		};

		// 4) Aspect ratio
		const reqRatio = ratioStringToNumber(rules.aspect_ratio || '35:45');
		let ratioOk = true;
		let ratioMsg = 'Соотношение сторон ок';
		if (reqRatio) {
			const real = width / Math.max(1, height);
			const tol = 0.02; // 2% tolerance
			ratioOk = Math.abs(real - reqRatio) <= tol * reqRatio;
			ratioMsg = ratioOk ? `Соотношение ок (${real.toFixed(3)})` : `Неверное соотношение: ${real.toFixed(3)} (нужно ${rules.aspect_ratio})`;
		}
		checks.aspect_ratio = { ok: ratioOk, message: ratioMsg, tips: ratioOk ? [] : suggestions.aspect };

		// 5) Background lightness near edges
		let bgOk = true;
		let bgMsg = 'Фон светлый и ровный';
		const bgHint = (rules.background_hint || 'white').toLowerCase();
		const bgLightness = await analyzeBackgroundLightness(image.clone().ensureAlpha().removeAlpha());
		if (bgLightness != null) {
			if (bgHint === 'white' || bgHint === 'light' || bgHint === 'neutral') {
				bgOk = bgLightness >= 0.7; // bright enough
				bgMsg = bgOk ? 'Фон достаточно светлый' : `Фон недостаточно светлый (${Math.round(bgLightness*100)}%)`;
			} else {
				bgOk = true;
			}
		}
		checks.background = { ok: bgOk, message: bgMsg, tips: bgOk ? [] : suggestions.background };

		// 6) Borders check (edges should not be dark/colored borders)
		let borderOk = true;
		let borderMsg = 'Нет тёмных рамок по краям';
		if (bgLightness != null) {
			borderOk = bgLightness >= 0.6;
			borderMsg = borderOk ? 'Края без рамок' : 'Видны тёмные рамки по краям — обрежьте изображение без полей';
		}
		checks.borders = { ok: borderOk, message: borderMsg, tips: borderOk ? [] : [ 'Кадрируйте изображение без рамок', 'Не используйте печатные фото с полями', 'Проверьте равномерность фона' ] };

		const allOk = Object.values(checks).every((c) => c.ok);

		// Save file regardless of validation (MVP keeps the latest upload)
		const record = await saveUploadedFile({
			buffer: file.buffer,
			originalName: file.originalname,
			mimeType: file.mimetype,
			sizeBytes: file.size,
			userId: req.user.userId,
			countryId,
			docType,
			checklistItemId
		});

		return res.json({
			id: record.id,
			fileUrl: `/api/files/${record.id}`,
			checks,
			ok: allOk
		});
	} catch (e) {
		console.error(e);
		return res.status(500).json({ error: 'UPLOAD_FAILED' });
	}
});

export default router;
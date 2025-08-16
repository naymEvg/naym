import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const dataDir = process.env.DATA_BASE_DIR || path.join(process.cwd(), 'data');
const usersFile = path.join(dataDir, 'users.json');

function ensureFile() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(usersFile)) fs.writeFileSync(usersFile, JSON.stringify({ users: [] }, null, 2));
}

function readUsers() {
  ensureFile();
  const raw = fs.readFileSync(usersFile, 'utf-8');
  return JSON.parse(raw);
}

function writeUsers(data) {
  fs.writeFileSync(usersFile, JSON.stringify(data, null, 2));
}

export async function getOrCreateUser(email, role = 'user') {
  const db = readUsers();
  let user = db.users.find((u) => u.email.toLowerCase() === String(email).toLowerCase());
  if (!user) {
    const id = crypto.createHash('sha1').update(String(email)).digest('hex').slice(0, 16);
    user = { id, email, role, createdAt: new Date().toISOString() };
    db.users.push(user);
    writeUsers(db);
  }
  return user;
}
import jwt from 'jsonwebtoken';

const jwtSecret = process.env.JWT_SECRET || 'dev_secret_change_me';

export function signToken(payload) {
  return jwt.sign(payload, jwtSecret, { expiresIn: '7d' });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, jwtSecret);
  } catch (e) {
    return null;
  }
}

export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  let token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token && req.query && req.query.token) {
    const q = String(req.query.token);
    token = q.startsWith('Bearer ') ? q.slice(7) : q;
  }
  if (!token) return res.status(401).json({ error: 'UNAUTHORIZED' });
  const data = verifyToken(token);
  if (!data) return res.status(401).json({ error: 'INVALID_TOKEN' });
  req.user = data;
  next();
}
import { Router } from 'express';
import { signToken } from '../middleware/auth.js';
import { getOrCreateUser } from '../services/users.js';

const router = Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'EMAIL_AND_PASSWORD_REQUIRED' });
  const isAdmin = String(email).toLowerCase() === 'admin@visa.local';
  const user = await getOrCreateUser(email, isAdmin ? 'admin' : 'user');
  const token = signToken({ userId: user.id, role: user.role, email: user.email });
  return res.json({ token, user: { id: user.id, role: user.role, email: user.email } });
});

export default router;
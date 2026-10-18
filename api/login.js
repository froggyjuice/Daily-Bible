import { checkPassword, setAuthCookie } from '../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const password = typeof req.body === 'object' ? req.body?.password : null;
  if (!checkPassword(password)) {
    await new Promise(r => setTimeout(r, 800));  // 무차별 대입 속도 늦추기
    return res.status(401).json({ error: '암호가 올바르지 않습니다' });
  }

  setAuthCookie(res);
  res.status(200).json({ ok: true });
}

/* ────────────────────────────────────────────
   간단한 공유 암호 게이트
   - SITE_PASSWORD 로 로그인하면 1년짜리 HttpOnly 쿠키 발급 → 같은 브라우저 재접속 시 자동 통과
   - 쿠키 값은 HMAC(AUTH_SECRET, SITE_PASSWORD) — 암호를 바꾸면 기존 쿠키가 모두 무효화됨
   ──────────────────────────────────────────── */

import { createHmac, createHash, timingSafeEqual } from 'node:crypto';

const COOKIE = 'qt_auth';
const MAX_AGE = 60 * 60 * 24 * 365;

function expectedToken() {
  const secret = process.env.AUTH_SECRET;
  const password = process.env.SITE_PASSWORD;
  if (!secret || !password) throw new Error('AUTH_SECRET / SITE_PASSWORD 환경변수가 없습니다');
  return createHmac('sha256', secret).update(`qt-auth-v1:${password}`).digest('base64url');
}

function safeEqual(a, b) {
  const ha = createHash('sha256').update(String(a)).digest();
  const hb = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(ha, hb);
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export function isAuthed(req) {
  const token = readCookie(req, COOKIE);
  return !!token && safeEqual(token, expectedToken());
}

// API 핸들러 첫 줄에서 호출: false 면 이미 401 응답을 보낸 것
export function requireAuth(req, res) {
  if (isAuthed(req)) return true;
  res.status(401).json({ error: 'unauthorized' });
  return false;
}

export function checkPassword(input) {
  const password = process.env.SITE_PASSWORD;
  if (!password) throw new Error('SITE_PASSWORD 환경변수가 없습니다');
  return safeEqual(input ?? '', password);
}

export function setAuthCookie(res) {
  res.setHeader('Set-Cookie',
    `${COOKIE}=${expectedToken()}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax`);
}

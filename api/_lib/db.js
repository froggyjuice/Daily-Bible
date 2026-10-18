/* ────────────────────────────────────────────
   Supabase PostgREST 최소 클라이언트 (의존성 없음)
   - SUPABASE_URL, SUPABASE_SECRET_KEY 환경변수 사용 (서버 전용)
   ──────────────────────────────────────────── */

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SECRET_KEY 환경변수가 없습니다');
  return { url: url.replace(/\/+$/, ''), key };
}

async function rest(path, { method = 'GET', body, prefer } = {}) {
  const { url, key } = config();
  const headers = { apikey: key, 'Content-Type': 'application/json' };
  // 레거시 service_role 키(JWT)는 Authorization 헤더도 필요, 새 sb_secret_ 키는 apikey 만으로 충분
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
  if (prefer) headers.Prefer = prefer;

  const res = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Supabase ${method} ${path.split('?')[0]} → ${res.status} ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// 날짜 목록 (트랙별, 내림차순, maxDate 이하만)
export async function listDates(track, maxDate) {
  const cap = maxDate ? `&qt_date=lte.${encodeURIComponent(maxDate)}` : '';
  const rows = await rest(`qt_entries?select=qt_date&track=eq.${encodeURIComponent(track)}${cap}&order=qt_date.desc&limit=5000`);
  return rows.map(r => r.qt_date);
}

export async function getEntry(date, track) {
  const rows = await rest(
    `qt_entries?select=qt_date,track,content_md&qt_date=eq.${encodeURIComponent(date)}&track=eq.${encodeURIComponent(track)}&limit=1`
  );
  return rows[0] || null;
}

// 이미 있는 (날짜, 트랙) 집합 — 'YYYY-MM-DD:track'
export async function existingKeys(fromDate, toDate) {
  const rows = await rest(
    `qt_entries?select=qt_date,track&qt_date=gte.${fromDate}&qt_date=lte.${toDate}&limit=10000`
  );
  return new Set(rows.map(r => `${r.qt_date}:${r.track}`));
}

export async function oldestDate() {
  const rows = await rest('qt_entries?select=qt_date&order=qt_date.asc&limit=1');
  return rows[0]?.qt_date || null;
}

export async function upsertEntries(rows) {
  if (rows.length === 0) return;
  await rest('qt_entries?on_conflict=qt_date,track', {
    method: 'POST',
    body: rows,
    prefer: 'resolution=merge-duplicates,return=minimal',
  });
}

export async function logRun(run) {
  try {
    await rest('scrape_runs', { method: 'POST', body: run, prefer: 'return=minimal' });
  } catch (e) {
    console.error('[scrape_runs 기록 실패]', e.message);
  }
}

// ── 댓글 ──
export async function listComments(date) {
  return rest(
    `qt_comments?select=id,nickname,body,created_at,delete_hash&qt_date=eq.${encodeURIComponent(date)}` +
    `&order=created_at.asc&limit=500`
  );
}

export async function insertComment(row) {
  const rows = await rest('qt_comments?select=id,nickname,body,created_at', {
    method: 'POST',
    body: row,
    prefer: 'return=representation',
  });
  return rows[0];
}

// delete_hash 가 일치할 때만 삭제 → 삭제된 행 수
export async function deleteComment(id, deleteHash) {
  const rows = await rest(
    `qt_comments?id=eq.${encodeURIComponent(id)}&delete_hash=eq.${encodeURIComponent(deleteHash)}`,
    { method: 'DELETE', prefer: 'return=representation' }
  );
  return rows.length;
}

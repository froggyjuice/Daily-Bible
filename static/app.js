/* ────────────────────────────────────────────
   매일성경 대시보드 — Frontend App Logic
   ──────────────────────────────────────────── */

// ── 전역 상태 ────────────────────────────────
let currentDate = null;
let currentTab  = 'bonmun';
let lastStatus  = null;
let pollTimer   = null;

// 캘린더 상태
let calYear  = new Date().getFullYear();
let calMonth = new Date().getMonth();       // 0-indexed
const entrySet = new Set();                 // "YYYY-MM-DD" 스트링 집합

// 현재 뷰 상태
let currentView      = 'list';              // 'list' | 'calendar'
let sidebarCollapsed = false;


// ═══════════════════════════════════════════
//  초기화
// ═══════════════════════════════════════════
window.addEventListener('DOMContentLoaded', async () => {
  marked.setOptions({ gfm: true, breaks: true });

  initTheme();
  restoreUI();
  await loadEntries();
  startPolling();
});


// ═══════════════════════════════════════════
//  테마 (다크 / 라이트 / 시스템)
// ═══════════════════════════════════════════
function initTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  applyTheme(saved, false);   // 초기화 시엔 transition 없이 즉시 적용
}

function setTheme(theme) {
  localStorage.setItem('theme', theme);
  applyTheme(theme, true);
}

function applyTheme(theme, animate) {
  const html = document.documentElement;

  if (!animate) html.style.transition = 'none';

  if (theme === 'system') {
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    html.setAttribute('data-theme', dark ? 'dark' : 'light');
  } else {
    html.setAttribute('data-theme', theme);
  }

  if (!animate) {
    // 강제 리플로우 후 트랜지션 복원
    void html.offsetHeight;
    html.style.transition = '';
  }

  // 버튼 활성화 표시
  ['dark','light','system'].forEach(t => {
    document.getElementById(`theme-btn-${t}`)?.classList.toggle('active', t === theme);
  });
}

// 시스템 테마 변경 감지
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (localStorage.getItem('theme') === 'system') applyTheme('system', true);
});


// ═══════════════════════════════════════════
//  사이드바 접기 / 펼치기
// ═══════════════════════════════════════════
function toggleSidebar() {
  sidebarCollapsed = !sidebarCollapsed;
  document.getElementById('sidebar').classList.toggle('collapsed', sidebarCollapsed);
  document.getElementById('sidebar-toggle-btn').classList.toggle('sidebar-collapsed', sidebarCollapsed);
  localStorage.setItem('sidebarCollapsed', sidebarCollapsed ? '1' : '0');
}

function restoreUI() {
  // 사이드바 상태 복원
  if (localStorage.getItem('sidebarCollapsed') === '1') {
    sidebarCollapsed = true;
    document.getElementById('sidebar').classList.add('collapsed');
    document.getElementById('sidebar-toggle-btn').classList.add('sidebar-collapsed');
  }
  // 뷰 상태 복원
  const savedView = localStorage.getItem('sidebarView') || 'list';
  if (savedView === 'calendar') {
    switchView('calendar', false);
  }
}


// ═══════════════════════════════════════════
//  뷰 전환 (목록 ↔ 캘린더)
// ═══════════════════════════════════════════
function switchView(view, save = true) {
  currentView = view;
  if (save) localStorage.setItem('sidebarView', view);

  const listEl = document.getElementById('view-list');
  const calEl  = document.getElementById('view-calendar');
  const btnList = document.getElementById('view-btn-list');
  const btnCal  = document.getElementById('view-btn-calendar');

  if (view === 'list') {
    listEl.style.display = 'flex';
    calEl.style.display  = 'none';
    btnList.classList.add('active');
    btnCal.classList.remove('active');
  } else {
    listEl.style.display = 'none';
    calEl.style.display  = 'flex';
    btnList.classList.remove('active');
    btnCal.classList.add('active');
    renderCalendar(calYear, calMonth);
  }
}


// ═══════════════════════════════════════════
//  날짜 목록 & 초기 로드
// ═══════════════════════════════════════════
async function loadEntries() {
  try {
    const [entries, status] = await Promise.all([
      apiFetch('/api/entries'),
      apiFetch('/api/status'),
    ]);

    // entrySet 채우기
    entrySet.clear();
    entries.forEach(d => entrySet.add(d));

    renderSidebar(entries);
    updateStatus(status);

    // 최신 날짜 자동 선택
    if (entries.length > 0) selectDate(entries[0]);

  } catch (e) {
    showToast('데이터 로드 실패: ' + e.message, 'error');
  }
}


// ═══════════════════════════════════════════
//  사이드바 목록 렌더링
// ═══════════════════════════════════════════
function renderSidebar(entries) {
  const list  = document.getElementById('date-list');
  const count = document.getElementById('total-count');
  count.textContent = `${entries.length}건`;

  if (entries.length === 0) {
    list.innerHTML = `<li class="date-item loading-placeholder">스크랩된 데이터가 없습니다</li>`;
    return;
  }

  const today     = todayKST();
  const yesterday = offsetDate(today, -1);

  list.innerHTML = entries.map(dateStr => {
    let badge = '';
    let sub   = formatDateKo(dateStr);
    if (dateStr === today)     badge = `<span class="date-item-badge">오늘</span>`;
    if (dateStr === yesterday) sub   = '어제';

    return `
      <li class="date-item" id="item-${dateStr}" onclick="selectDate('${dateStr}')">
        ${badge}
        <span class="date-item-label">${dateStr}</span>
        <span class="date-item-sub">${sub}</span>
      </li>`;
  }).join('');

  // 캘린더도 갱신
  if (currentView === 'calendar') renderCalendar(calYear, calMonth);
}


// ═══════════════════════════════════════════
//  날짜 선택
// ═══════════════════════════════════════════
async function selectDate(dateStr) {
  if (currentDate === dateStr) return;

  // 이전 활성화 해제
  if (currentDate) {
    document.getElementById(`item-${currentDate}`)?.classList.remove('active');
  }
  // 목록 아이템 활성화
  const cur = document.getElementById(`item-${dateStr}`);
  if (cur) { cur.classList.add('active'); cur.scrollIntoView({ block: 'nearest' }); }

  currentDate = dateStr;
  clearPanels();

  // 메타 업데이트
  document.getElementById('content-meta').textContent =
    `${dateStr} · ${formatDateKo(dateStr)}`;

  // 캘린더 셀 갱신
  if (currentView === 'calendar') renderCalendar(calYear, calMonth);

  try {
    const { content } = await apiFetch(`/api/entry/${dateStr}`);
    parseAndRender(content);
  } catch (e) {
    showToast('콘텐츠 로드 실패: ' + e.message, 'error');
  }
}


// ═══════════════════════════════════════════
//  마크다운 파싱 & 탭별 렌더링
// ═══════════════════════════════════════════
function parseAndRender(raw) {
  const sections = raw.split(/\n---\n/);
  let bonmunMd = '', haeseolMd = '';

  sections.forEach(sec => {
    const t = sec.trim();
    if (/^##\s*(📖\s*)?본문/.test(t))  bonmunMd  = t;
    if (/^##\s*(📝\s*)?해설/.test(t))  haeseolMd = t;
  });

  // fallback
  if (!bonmunMd  && sections.length >= 2) bonmunMd  = sections[1].trim();
  if (!haeseolMd && sections.length >= 3) haeseolMd = sections[2].trim();

  renderPanel('bonmun',  bonmunMd);
  renderPanel('haeseol', haeseolMd);
}

function renderPanel(tab, md) {
  const empty = document.getElementById(`empty-${tab}`);
  const body  = document.getElementById(`${tab}-body`);

  if (!md) { empty.style.display = 'flex'; body.innerHTML = ''; return; }

  empty.style.display = 'none';
  body.innerHTML = marked.parse(md);
}

function clearPanels() {
  ['bonmun','haeseol'].forEach(t => {
    document.getElementById(`empty-${t}`).style.display = 'flex';
    document.getElementById(`${t}-body`).innerHTML = '';
  });
}


// ═══════════════════════════════════════════
//  탭 전환
// ═══════════════════════════════════════════
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.add('active');
  document.getElementById(`panel-${tab}`).classList.add('active');
}


// ═══════════════════════════════════════════
//  캘린더
// ═══════════════════════════════════════════
function renderCalendar(year, month) {
  calYear  = year;
  calMonth = month;

  document.getElementById('cal-title').textContent = `${year}년 ${month + 1}월`;

  const grid     = document.getElementById('cal-grid');
  const dayNames = ['일','월','화','수','목','금','토'];
  const today    = todayKST();
  const firstDay = new Date(year, month, 1).getDay();         // 0=Sun
  const lastDate = new Date(year, month + 1, 0).getDate();    // 월 마지막 날

  let html = dayNames.map(d => `<div class="cal-day-header">${d}</div>`).join('');

  // 첫날 전 빈 칸
  for (let i = 0; i < firstDay; i++) html += `<div class="cal-cell empty"></div>`;

  for (let d = 1; d <= lastDate; d++) {
    const mm      = String(month + 1).padStart(2, '0');
    const dd      = String(d).padStart(2, '0');
    const dateStr = `${year}-${mm}-${dd}`;
    const has     = entrySet.has(dateStr);
    const isToday = dateStr === today;
    const isSel   = dateStr === currentDate;

    let cls = 'cal-cell';
    if (has)     cls += ' has-data'; else cls += ' no-data';
    if (isToday) cls += ' today';
    if (isSel)   cls += ' selected';

    const click = has ? `onclick="selectDate('${dateStr}')"` : '';
    html += `<div class="${cls}" ${click}>${d}</div>`;
  }

  grid.innerHTML = html;
}

function calPrev() {
  calMonth--;
  if (calMonth < 0) { calMonth = 11; calYear--; }
  renderCalendar(calYear, calMonth);
}

function calNext() {
  calMonth++;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  renderCalendar(calYear, calMonth);
}


// ═══════════════════════════════════════════
//  수동 스크랩
// ═══════════════════════════════════════════
async function triggerScrape() {
  const btn   = document.getElementById('btn-scrape');
  const label = document.getElementById('scrape-label');

  btn.disabled = true;
  btn.classList.add('spinning');
  label.textContent = '스크랩 중…';

  try {
    const res = await apiFetch('/api/scrape', { method: 'POST' });
    if (res.status === 'already_running') {
      showToast('이미 스크랩이 진행 중입니다', 'info');
      resetScrapeBtn();
    } else {
      showToast('스크랩을 시작했습니다', 'success');
      waitForComplete();
    }
  } catch (e) {
    showToast('요청 실패: ' + e.message, 'error');
    resetScrapeBtn();
  }
}

async function waitForComplete() {
  const iv = setInterval(async () => {
    try {
      const s = await apiFetch('/api/status');
      updateStatus(s);
      if (!s.is_running) {
        clearInterval(iv);
        resetScrapeBtn();
        if (s.last_status === 'success') {
          showToast('스크랩 완료! 목록을 갱신합니다', 'success');
          await loadEntries();
        } else if (s.last_status === 'error') {
          showToast('오류: ' + (s.last_error || '알 수 없는 오류'), 'error');
        }
      }
    } catch (_) { clearInterval(iv); resetScrapeBtn(); }
  }, 2000);
}

function resetScrapeBtn() {
  const btn = document.getElementById('btn-scrape');
  btn.disabled = false;
  btn.classList.remove('spinning');
  document.getElementById('scrape-label').textContent = '지금 스크랩';
}


// ═══════════════════════════════════════════
//  상태 폴링
// ═══════════════════════════════════════════
function startPolling() {
  pollTimer = setInterval(async () => {
    try {
      const s = await apiFetch('/api/status');
      updateStatus(s);
      if (lastStatus === 'running' && s.last_status === 'success') {
        await loadEntries();
      }
      lastStatus = s.last_status;
    } catch (_) {}
  }, 10_000);
}

function updateStatus(s) {
  const dot   = document.getElementById('status-dot');
  const label = document.getElementById('status-label');
  const next  = document.getElementById('next-run-label');

  dot.className = 'status-dot ' + (s.last_status || 'idle');

  const map = { idle:'대기중', running:'스크랩 중…', success:'정상', error:'오류' };
  label.textContent = map[s.last_status] || '대기중';

  if (s.next_run) {
    next.textContent = `다음 스크랩: ${formatTime(new Date(s.next_run))}`;
  }
}


// ═══════════════════════════════════════════
//  유틸리티
// ═══════════════════════════════════════════
async function apiFetch(url, opts = {}) {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || res.statusText);
  }
  return res.json();
}

function todayKST() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  return kst.toISOString().slice(0, 10);
}

function offsetDate(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDateKo(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const days = ['일','월','화','수','목','금','토'];
  return `${d.getUTCMonth()+1}월 ${d.getUTCDate()}일 (${days[d.getUTCDay()]})`;
}

function formatTime(dt) {
  return `${dt.getMonth()+1}/${dt.getDate()} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
}

function showToast(msg, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  const icons = { success: '✅', error: '❌', info: '💬' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${icons[type]||''}</span><span>${msg}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.style.animation = 'slideOut .22s ease forwards';
    el.addEventListener('animationend', () => el.remove());
  }, duration);
}

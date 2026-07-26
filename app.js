/* ────────────────────────────────────────────
   매일성경 — GitHub Pages 정적 버전
   API 없이 /data/*.json 에서 직접 로드
   ──────────────────────────────────────────── */

// ── 전역 상태 ────────────────────────────────
let currentVersion = 'main';          // 'main' | 'soon'
let currentDate    = null;
let currentTab     = 'bonmun';

// 캘린더 상태
let calYear  = new Date().getFullYear();
let calMonth = new Date().getMonth();
const entrySet = new Set();

// 사이드바 / 뷰 상태
let currentView      = 'list';
let sidebarCollapsed = false;


// ═══════════════════════════════════════════
//  버전 전환 (매일성경 ↔ 매일성경 순)
// ═══════════════════════════════════════════
async function switchVersion(ver) {
  if (currentVersion === ver) return;
  currentVersion = ver;
  currentDate = null;

  document.getElementById('version-btn-main')?.classList.toggle('active', ver === 'main');
  document.getElementById('version-btn-soon')?.classList.toggle('active', ver === 'soon');

  clearPanels();
  document.getElementById('content-meta').textContent = '날짜를 선택하세요';
  await loadEntries();
}



// ═══════════════════════════════════════════
//  초기화
// ═══════════════════════════════════════════
window.addEventListener('DOMContentLoaded', async () => {
  marked.setOptions({ gfm: true, breaks: true });

  initTheme();
  restoreUI();
  hideServerOnlyElements();
  await loadEntries();
});

/** 서버 전용 UI 요소 숨김 */
function hideServerOnlyElements() {
  ['schedule-badge', 'status-dot-wrap', 'btn-scrape'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}


// ═══════════════════════════════════════════
//  테마
// ═══════════════════════════════════════════
function initTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  applyTheme(saved, false);
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

  if (!animate) { void html.offsetHeight; html.style.transition = ''; }

  ['dark','light','system'].forEach(t =>
    document.getElementById(`theme-btn-${t}`)?.classList.toggle('active', t === theme)
  );
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (localStorage.getItem('theme') === 'system') applyTheme('system', true);
});


// ═══════════════════════════════════════════
//  사이드바 토글
// ═══════════════════════════════════════════
function toggleSidebar() {
  sidebarCollapsed = !sidebarCollapsed;
  document.getElementById('sidebar').classList.toggle('collapsed', sidebarCollapsed);
  document.getElementById('sidebar-toggle-btn').classList.toggle('sidebar-collapsed', sidebarCollapsed);
  localStorage.setItem('sidebarCollapsed', sidebarCollapsed ? '1' : '0');
  
  // 모바일 백드롭 처리
  const backdrop = document.getElementById('sidebar-backdrop');
  if (backdrop && window.innerWidth <= 768) {
    if (!sidebarCollapsed) {
      backdrop.style.display = 'block';
      setTimeout(() => backdrop.classList.add('active'), 10);
    } else {
      backdrop.classList.remove('active');
      setTimeout(() => {
        if (sidebarCollapsed) backdrop.style.display = 'none';
      }, 280);
    }
  }
}

function restoreUI() {
  const isMobile = window.innerWidth <= 768;
  const savedState = localStorage.getItem('sidebarCollapsed');
  
  // 사용자가 이전에 닫아둔 경우, 또는 첫 접근(기본값)인 경우
  if (savedState === '1' || savedState === null) {
    sidebarCollapsed = true;
    document.getElementById('sidebar').classList.add('collapsed');
    document.getElementById('sidebar-toggle-btn').classList.add('sidebar-collapsed');
  } else {
    sidebarCollapsed = false;
  }
  
  // 초기 모바일 백드롭 렌더링
  if (isMobile && !sidebarCollapsed) {
    const backdrop = document.getElementById('sidebar-backdrop');
    if (backdrop) {
      backdrop.style.display = 'block';
      backdrop.classList.add('active');
    }
  }

  const savedView = localStorage.getItem('sidebarView') || 'list';
  if (savedView === 'calendar') switchView('calendar', false);
}

// 윈도우 리사이즈 시 백드롭 정리
window.addEventListener('resize', () => {
  const backdrop = document.getElementById('sidebar-backdrop');
  if (window.innerWidth > 768 && backdrop) {
    backdrop.style.display = 'none';
    backdrop.classList.remove('active');
  } else if (window.innerWidth <= 768 && !sidebarCollapsed && backdrop) {
    backdrop.style.display = 'block';
    backdrop.classList.add('active');
  }
});


// ═══════════════════════════════════════════
//  뷰 전환
// ═══════════════════════════════════════════
function switchView(view, save = true) {
  currentView = view;
  if (save) localStorage.setItem('sidebarView', view);

  const listEl  = document.getElementById('view-list');
  const calEl   = document.getElementById('view-calendar');
  const btnList = document.getElementById('view-btn-list');
  const btnCal  = document.getElementById('view-btn-calendar');

  if (view === 'list') {
    listEl.style.display = 'flex'; calEl.style.display = 'none';
    btnList.classList.add('active'); btnCal.classList.remove('active');
  } else {
    listEl.style.display = 'none'; calEl.style.display = 'flex';
    btnList.classList.remove('active'); btnCal.classList.add('active');
    renderCalendar(calYear, calMonth);
  }
}


// ═══════════════════════════════════════════
//  정적 데이터 로드
// ═══════════════════════════════════════════
async function loadEntries() {
  try {
    let entries = [];
    try {
      entries = await staticFetch(`./data/${currentVersion}/entries.json`);
    } catch (_) {
      // 레거시 폴백
      entries = await staticFetch('./data/entries.json');
    }

    entrySet.clear();
    entries.forEach(d => entrySet.add(d));

    renderSidebar(entries);

    // 최신 날짜 자동 선택
    if (entries.length > 0) {
      await selectDate(entries[0]);
    } else {
      clearPanels();
    }

    // 마지막 업데이트 시각 표시
    if (entries.length > 0) {
      const nextEl = document.getElementById('next-run-label');
      if (nextEl) nextEl.textContent = `최종 업데이트: ${entries[0]}`;
    }

  } catch (e) {
    showToast('데이터 로드 실패. data/ 폴더를 확인하세요.', 'error');
    console.error(e);
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
    list.innerHTML = `<li class="date-item loading-placeholder">데이터가 없습니다</li>`;
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

  if (currentView === 'calendar') renderCalendar(calYear, calMonth);
}


// ═══════════════════════════════════════════
//  날짜 선택
// ═══════════════════════════════════════════
async function selectDate(dateStr) {
  if (currentDate === dateStr) return;

  document.getElementById(`item-${currentDate}`)?.classList.remove('active');
  const cur = document.getElementById(`item-${dateStr}`);
  if (cur) { cur.classList.add('active'); cur.scrollIntoView({ block: 'nearest' }); }

  currentDate = dateStr;
  clearPanels();
  document.getElementById('content-meta').textContent = formatDateKo(dateStr);

  // 모바일에서는 날짜 선택 시 가로 렌더링 최적화를 위해 사이드바 자동 닫기
  if (window.innerWidth <= 768 && !sidebarCollapsed) {
    toggleSidebar();
  }

  if (currentView === 'calendar') renderCalendar(calYear, calMonth);

  try {
    let data;
    try {
      data = await staticFetch(`./data/${currentVersion}/${dateStr}.json`);
    } catch (_) {
      data = await staticFetch(`./data/${dateStr}.json`);
    }
    parseAndRender(data.content);
  } catch (e) {
    showToast('콘텐츠 로드 실패: ' + e.message, 'error');
  }
}



// ═══════════════════════════════════════════
//  마크다운 파싱
// ═══════════════════════════════════════════
function parseAndRender(raw) {
  const sections = raw.split(/\n---\n/);
  let bonmunMd = '', haeseolMd = '';

  sections.forEach(sec => {
    const t = sec.trim();
    if (/^##\s*(📖\s*)?본문/.test(t))  bonmunMd  = t;
    if (/^##\s*(📝\s*)?해설/.test(t))  haeseolMd = t;
  });

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
  const firstDay = new Date(year, month, 1).getDay();
  const lastDate = new Date(year, month + 1, 0).getDate();

  let html = dayNames.map(d => `<div class="cal-day-header">${d}</div>`).join('');
  for (let i = 0; i < firstDay; i++) html += `<div class="cal-cell empty"></div>`;

  for (let d = 1; d <= lastDate; d++) {
    const mm      = String(month + 1).padStart(2, '0');
    const dd      = String(d).padStart(2, '0');
    const dateStr = `${year}-${mm}-${dd}`;
    const has     = entrySet.has(dateStr);
    const isToday = dateStr === today;
    const isSel   = dateStr === currentDate;

    let cls = 'cal-cell' + (has ? ' has-data' : ' no-data') +
              (isToday ? ' today' : '') + (isSel ? ' selected' : '');
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
//  유틸리티
// ═══════════════════════════════════════════
async function staticFetch(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} - ${res.status} ${res.statusText}`);
  return res.json();
}

function todayKST() {
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
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

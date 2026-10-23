// =============================================
// FC 바르자 팀 매니저 - 앱 상태 & 초기화
// =============================================

const QUARTERS = ['1Q', '2Q', '3Q', '4Q'];
const FORMATIONS = ['4-2-3-1', '4-3-3', '4-4-2', '3-5-2'];

// 포메이션별 포지션 정의
const FORMATION_POSITIONS = {
    '4-2-3-1': {
        rows: [
            { key: 'fw', positions: ['ST'] },
            { key: 'am', positions: ['LW', 'CAM', 'RW'] },
            { key: 'dm', positions: ['LDM', 'RDM'] },
            { key: 'df', positions: ['LB', 'LCB', 'RCB', 'RB'] },
            { key: 'gk', positions: ['GK'] },
        ]
    },
    '4-3-3': {
        rows: [
            { key: 'fw', positions: ['LW', 'ST', 'RW'] },
            { key: 'mf', positions: ['LCM', 'CM', 'RCM'] },
            { key: 'df', positions: ['LB', 'LCB', 'RCB', 'RB'] },
            { key: 'gk', positions: ['GK'] },
        ]
    },
    '4-4-2': {
        rows: [
            { key: 'fw', positions: ['LW', 'RW'] },
            { key: 'mf', positions: ['LM', 'LCM', 'RCM', 'RM'] },
            { key: 'df', positions: ['LB', 'LCB', 'RCB', 'RB'] },
            { key: 'gk', positions: ['GK'] },
        ]
    },
    '3-5-2': {
        rows: [
            { key: 'fw', positions: ['LW', 'ST', 'RW'] },
            { key: 'mf', positions: ['MF0', 'MF1', 'MF2'] },
            { key: 'df', positions: ['LB', 'LCB', 'RCB', 'RB'] },
            { key: 'gk', positions: ['GK'] },
        ]
    },
};

const POSITION_DISPLAY_LABELS = {
    '4-4-2': { 'LW': 'LS', 'RW': 'RS' },
    '3-5-2': { 'MF0': 'MF', 'MF1': 'MF', 'MF2': 'MF' },
};

// Canvas용 포지션 좌표 (100x70 pitch 기준, GK=left, ST=right) — 좌표 정보가 없는 옛 기록용 폴백
const POS_COORDS = {
    'GK': [5, 35],
    'LB': [20, 60], 'LCB': [15, 42], 'RCB': [15, 28], 'RB': [20, 10],
    'LDM': [35, 45], 'RDM': [35, 25],
    'LCM': [40, 50], 'CM': [35, 35], 'RCM': [40, 20],
    'LM': [45, 60], 'RM': [45, 10],
    'LW': [65, 60], 'CAM': [55, 35], 'RW': [65, 10],
    'LAM': [65, 60], 'RAM': [65, 10],
    'ST': [80, 35],
    'MF0': [40, 50], 'MF1': [35, 35], 'MF2': [40, 20],
};

const DEFAULT_VENUES = ['잠실유수지', '탄천유수지', '송파여성축구장', '천마축구장'];

// 앱 전역 상태
const AppState = {
    // 편집 권한 (구글 로그인 + 편집자 허용 목록)
    isSignedIn: false,          // 데이터 로드 완료 여부
    isEditor: false,            // true면 편집 모드 (로그인 계정이 편집자 목록에 있음)
    user: null,                 // { uid, email, displayName } | null
    editors: {},                // /settings/editors
    editorRequests: {},         // /settings/editorRequests
    pendingAuthUser: undefined, // 데이터 로드 전에 도착한 로그인 상태

    // 데이터
    roster: {},    // { name: { name, fullName, role, positions, jerseyNo, aliases, active } }
    matches: [],   // 경기 레코드 배열 (v2, id 오름차순)
    venues: [],    // 경기장 목록
    legacyMatches: false, // DB가 아직 v1 배열 형식이면 true (이관 전)

    // Tab 1 - 현재 경기 편집 상태
    matchDate: today(),
    matchLocation: '잠실유수지',
    matchOpponent: '상대팀',
    quarterCount: 4,   // 4 | 5
    onFieldSize: 11,   // 쿼터당 출전 인원 (목표 쿼터 계산용)
    attendees: [],   // string[]
    formationTypes: { '1Q': '4-2-3-1', '2Q': '4-2-3-1', '3Q': '4-2-3-1', '4Q': '4-2-3-1' },
    formationState: { '1Q': {}, '2Q': {}, '3Q': {}, '4Q': {} }, // { q: { pos: name } }
    formationSubs: { '1Q': {}, '2Q': {}, '3Q': {}, '4Q': {} }, // { q: { pos: inName } } — out 선수는 formationState[q][pos]
    formationCoords: { '1Q': {}, '2Q': {}, '3Q': {}, '4Q': {} }, // { q: { pos: {left,top}% } } 카드 자유 배치 오버라이드
    extraSubs: { '1Q': [], '2Q': [], '3Q': [], '4Q': [] },      // 포지션을 특정할 수 없는 교체 쌍 [{in,out}] (시트 이관분)
    pendingPick: null,  // 벤치에서 누른 선수 (다음에 누르는 자리에 배치)
    locks: {},          // { q: { pos: true } } 자동 초안이 건드리지 않는 자리
    draftReasons: {},   // { q: { pos: { name, reason, rank, score } } } 자동 초안 배치 근거
    draftSeed: 0,
    quarterScores: { '1Q': [0, 0], '2Q': [0, 0], '3Q': [0, 0], '4Q': [0, 0] },
    matchStats: {},  // { name: { goals: 0, assists: 0 } }
    matchEvents: [], // [{ quarter, type:'goal'|'opponentGoal', scorer, assister }]
    editingExtras: null, // 수정 중인 레코드의 편집하지 않는 필드 (type, timeSlot, notes, source, 5Q 이상 쿼터 등)
    liveQuarter: '1Q',
    editingEventIdx: null, // 실시간 기록에서 인라인 수정 중인 이벤트 인덱스
    editModeId: null,
    currentQuarter: '1Q',

    // 자동저장
    autoSaveTimer: null,
    lastAutoSave: null,

    // UI 임시 상태
    dupConfirmId: null,
    dupConfirmAction: null,
};

// 유틸 함수
function today() {
    // 로컬 타임존 기준 YYYY-MM-DD (UTC 변환으로 인한 날짜 어긋남 방지)
    const d = new Date();
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
}

// HTML 삽입 시 사용자 입력(이름/장소/상대팀 등)을 안전하게 이스케이프
function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ── 선수 헬퍼 ──────────────────────────────────────────────────────────────
function getPlayer(name) {
    return AppState.roster[name] || null;
}

function isGuest(name) {
    const p = getPlayer(name);
    return p ? p.role === 'guest' : false;
}

function formatPlayerName(name) {
    return isGuest(name) ? `${name} (용병)` : name;
}

function getAllPlayersSorted() {
    return Object.keys(AppState.roster).sort((a, b) => a.localeCompare(b, 'ko'));
}

// 명단 그룹: 활동 멤버 / 비활동 멤버 / 용병 (용병은 최근 출전순)
function getRosterGroups() {
    const names = getAllPlayersSorted();
    const lastSeen = {};
    AppState.matches.forEach(m => (m.attendees || []).forEach(n => {
        if (!lastSeen[n] || lastSeen[n] < m.date) lastSeen[n] = m.date;
    }));
    const members = names.filter(n => !isGuest(n) && getPlayer(n).active !== false);
    const inactive = names.filter(n => !isGuest(n) && getPlayer(n).active === false);
    const guests = names.filter(n => isGuest(n))
        .sort((a, b) => (lastSeen[b] || '').localeCompare(lastSeen[a] || '') || a.localeCompare(b, 'ko'));
    return { members, inactive, guests, lastSeen };
}

// ── 쿼터 참여 계산 (시트 규칙) — 실제 계산은 js/quota.js (Quota) ──────────
const quarterCredit = Quota.quarterCredit;

// 편집 중인 경기의 쿼터 키 목록 (쿼터 수 설정에 따라 4 또는 5)
function editorQuarters() {
    return Quota.quarterKeys(AppState.quarterCount);
}

// 편집 상태 객체에 모든 쿼터 키가 있도록 보장 (쿼터 수 변경·초기화 시)
function ensureQuarterState() {
    editorQuarters().forEach(q => {
        if (!AppState.formationTypes[q]) AppState.formationTypes[q] = '4-2-3-1';
        if (!AppState.formationState[q]) AppState.formationState[q] = {};
        if (!AppState.formationSubs[q]) AppState.formationSubs[q] = {};
        if (!AppState.formationCoords[q]) AppState.formationCoords[q] = {};
        if (!AppState.extraSubs[q]) AppState.extraSubs[q] = [];
        if (!AppState.quarterScores[q]) AppState.quarterScores[q] = [0, 0];
        if (!AppState.locks[q]) AppState.locks[q] = {};
        if (!AppState.draftReasons[q]) AppState.draftReasons[q] = {};
    });
    if (!editorQuarters().includes(AppState.currentQuarter)) AppState.currentQuarter = '1Q';
    if (!editorQuarters().includes(AppState.liveQuarter)) AppState.liveQuarter = '1Q';
}

// 편집 중인 경기를 Quota 입력 형식으로 변환
function editorQuartersData() {
    const quarters = {};
    editorQuarters().forEach(q => {
        quarters[q] = { lineup: AppState.formationState[q] || {}, subs: editorSubsForQuarter(q) };
    });
    return quarters;
}

// 편집 중인 경기의 목표/균형 지표
function editorTargets() {
    return Quota.computeTargets({
        quarters: editorQuartersData(),
        attendees: AppState.attendees,
        quarterCount: AppState.quarterCount,
        onFieldSize: AppState.onFieldSize,
    });
}

// 편집 중인 경기 상태에서 쿼터별 교체 쌍 목록 생성
function editorSubsForQuarter(q) {
    const lineup = AppState.formationState[q] || {};
    const subs = [];
    for (const [pos, inName] of Object.entries(AppState.formationSubs[q] || {})) {
        if (!inName || inName === '-') continue;
        subs.push({ in: inName, out: lineup[pos] || null, pos });
    }
    (AppState.extraSubs[q] || []).forEach(s => subs.push({ in: s.in || null, out: s.out || null, pos: null }));
    return subs;
}

function getParticipation(playerName) {
    let total = 0;
    editorQuarters().forEach(q => {
        total += quarterCredit(AppState.formationState[q], editorSubsForQuarter(q), playerName);
    });
    return total;
}

// 저장된 레코드의 쿼터 목록 (4쿼터/5쿼터)
function recordQuarters(record) {
    const keys = Object.keys((record && record.quarters) || {});
    const all = keys.length ? keys : QUARTERS;
    return all.sort((a, b) => parseInt(a) - parseInt(b));
}

// 저장된 레코드에서 선수별 실 참여 쿼터 { name: credit }
function recordParticipation(record) {
    const p = Quota.computeParticipation((record && record.quarters) || {}, recordQuarters(record));
    const credits = {};
    Object.entries(p).forEach(([n, r]) => { credits[n] = r.credit; });
    return credits;
}

// 저장된 레코드의 목표/균형 지표
function recordTargets(record) {
    return Quota.computeTargets({
        quarters: (record && record.quarters) || {},
        attendees: (record && record.attendees) || [],
        quarterCount: (record && record.quarterCount) || recordQuarters(record).length,
        onFieldSize: (record && record.onFieldSize) || Quota.DEFAULT_ON_FIELD,
    });
}

const fmtQ = Quota.fmt;

function resetMatchState() {
    AppState.matchDate = today();
    AppState.matchLocation = AppState.venues[0] || '잠실유수지';
    AppState.matchOpponent = '상대팀';
    AppState.quarterCount = Quota.DEFAULT_QUARTER_COUNT;
    AppState.onFieldSize = Quota.DEFAULT_ON_FIELD;
    AppState.attendees = [];
    AppState.formationTypes = {};
    AppState.formationState = {};
    AppState.formationSubs = {};
    AppState.formationCoords = {};
    AppState.extraSubs = {};
    AppState.quarterScores = {};
    AppState.pendingPick = null;
    AppState.locks = {};
    AppState.draftReasons = {};
    AppState.draftSeed = 0;
    AppState.matchStats = {};
    AppState.matchEvents = [];
    AppState.editingExtras = null;
    AppState.liveQuarter = '1Q';
    AppState.editingEventIdx = null;
    AppState.editModeId = null;
    AppState.currentQuarter = '1Q';
    AppState.dupConfirmId = null;
    AppState.dupConfirmAction = null;
    AppState.lastAutoSave = null;
    ensureQuarterState();
    stopAutoSave();
}

function showToast(msg, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 3000);
}

// 탭 전환
function switchTab(tabId) {
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    document.querySelector(`.tab-btn[data-tab="${tabId}"]`).classList.add('active');
    if (tabId === 'tab2') renderStatsTab();
    if (tabId === 'tab3') renderHistoryTab();
    if (tabId === 'tab4') renderRosterTab();
}

// ── 경기장 목록 (DB /settings/venues) ─────────────────────────────────────
async function addVenue(name) {
    if (!name) return;
    if (!AppState.venues.includes(name)) {
        AppState.venues.push(name);
        try { await saveVenues(); }
        catch (e) { showToast('경기장 저장 실패: ' + e.message, 'error'); }
    }
}

function populateVenueSelect(selected) {
    const sel = document.getElementById('match-location');
    if (!sel) return;
    const cur = selected || AppState.matchLocation;
    const list = [...AppState.venues];
    if (cur && !list.includes(cur)) list.push(cur);
    sel.innerHTML = list.map(v =>
        `<option value="${escapeHtml(v)}"${v === cur ? ' selected' : ''}>${escapeHtml(v)}</option>`
    ).join('') + '<option value="__custom__">+ 다른 경기장 추가...</option>';
}

// 앱 초기화
async function initApp() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    initTab1Events();
    const signOutBtn = document.getElementById('auth-signout');
    if (signOutBtn) signOutBtn.addEventListener('click', () => { signOutGoogle(); });
    document.addEventListener('click', e => {
        const menu = document.getElementById('auth-menu');
        if (menu && menu.style.display !== 'none' && !e.target.closest('.auth-wrap')) menu.style.display = 'none';
    });
    AppState.venues = [...DEFAULT_VENUES];
    populateVenueSelect();

    if (typeof flatpickr !== 'undefined') {
        flatpickr('#match-date', {
            locale: 'ko',
            dateFormat: 'Y-m-d',
            defaultDate: today(),
            disableMobile: false,
            onChange: (selectedDates, dateStr) => {
                AppState.matchDate = dateStr;
            },
        });
    } else {
        document.getElementById('match-date').value = today();
    }

    await initBackend();
    populateVenueSelect();
}

document.addEventListener('DOMContentLoaded', initApp);

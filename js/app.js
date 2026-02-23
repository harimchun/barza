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

// Canvas용 포지션 좌표 (100x70 pitch 기준, GK=left, ST=right)
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

// 앱 전역 상태
const AppState = {
    // Auth
    accessToken: null,
    isSignedIn: false,
    currentUser: null,   // Firebase Auth user object
    isEditor: false,     // true if user email is in CONFIG.ALLOWED_EDITORS

    // Drive 파일 ID 캐시
    rosterFileId: null,
    matchesFileId: null,

    // 데이터
    roster: {},    // { name: "Member" | "Guest" }
    matches: [],   // 경기 기록 배열

    // Tab 1 - 현재 경기 편집 상태
    matchDate: new Date().toISOString().slice(0, 10),
    matchLocation: '잠실유수지',
    matchOpponent: '상대팀',
    attendees: [],   // string[]
    squadPlan: {},   // { name: { '1Q': bool, '2Q': bool, '3Q': bool, '4Q': bool } }
    formationTypes: { '1Q': '4-2-3-1', '2Q': '4-2-3-1', '3Q': '4-2-3-1', '4Q': '4-2-3-1' },
    formationState: { '1Q': {}, '2Q': {}, '3Q': {}, '4Q': {} }, // { q: { pos: name } }
    formationSubs: { '1Q': {}, '2Q': {}, '3Q': {}, '4Q': {} }, // { q: { pos: name } }
    quarterScores: { '1Q': [0, 0], '2Q': [0, 0], '3Q': [0, 0], '4Q': [0, 0] },
    matchStats: {},  // { name: { goals: 0, assists: 0 } }
    editModeId: null,
    currentQuarter: '1Q',

    // UI 임시 상태
    dupConfirmId: null,
    dupConfirmAction: null,
};

// 유틸 함수
function today() {
    return new Date().toISOString().slice(0, 10);
}

function formatPlayerName(name) {
    const role = AppState.roster[name];
    return role === 'Guest' ? `${name} (용병)` : name;
}

function getAllPlayersSorted() {
    return Object.keys(AppState.roster).sort((a, b) => a.localeCompare(b, 'ko'));
}

function getParticipation(playerName) {
    let total = 0;
    QUARTERS.forEach(q => {
        const inSquad = AppState.squadPlan[playerName]?.[q] || false;
        if (!inSquad) return;
        // 교체 여부 확인
        let isSub = false;
        const fMap = AppState.formationState[q];
        const fSubs = AppState.formationSubs[q];
        for (const pos in fMap) {
            if (fSubs[pos] && fSubs[pos] !== '-' &&
                (fMap[pos] === playerName || fSubs[pos] === playerName)) {
                isSub = true;
                break;
            }
        }
        total += isSub ? 0.5 : 1;
    });
    return total;
}

function resetMatchState() {
    AppState.matchDate = today();
    AppState.matchLocation = '잠실유수지';
    AppState.matchOpponent = '상대팀';
    AppState.attendees = [];
    AppState.squadPlan = {};
    AppState.formationTypes = { '1Q': '4-2-3-1', '2Q': '4-2-3-1', '3Q': '4-2-3-1', '4Q': '4-2-3-1' };
    AppState.formationState = { '1Q': {}, '2Q': {}, '3Q': {}, '4Q': {} };
    AppState.formationSubs = { '1Q': {}, '2Q': {}, '3Q': {}, '4Q': {} };
    AppState.quarterScores = { '1Q': [0, 0], '2Q': [0, 0], '3Q': [0, 0], '4Q': [0, 0] };
    AppState.matchStats = {};
    AppState.editModeId = null;
    AppState.currentQuarter = '1Q';
    AppState.dupConfirmId = null;
    AppState.dupConfirmAction = null;
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
    // 탭 진입 시 렌더링
    if (tabId === 'tab2') renderStatsTab();
    if (tabId === 'tab3') renderHistoryTab();
    if (tabId === 'tab4') renderRosterTab();
}

// 업장 비교 (4개 기본 + localStorage 커스텀)
const DEFAULT_VENUES = ['\uc7a0\uc2e4\uc720\uc218\uc9c0', '\ud0c4\ucc9c\uc720\uc218\uc9c0', '\uc1a1\ud30c\uc5ec\uc131\ucd95\uad6c\uc7a5', '\ucc9c\ub9c8\ucd95\uad6c\uc7a5'];

function getCustomVenues() {
    try { return JSON.parse(localStorage.getItem('fc_barja_venues') || '[]'); }
    catch { return []; }
}

function saveCustomVenue(name) {
    const list = getCustomVenues();
    if (!list.includes(name) && !DEFAULT_VENUES.includes(name)) {
        list.push(name);
        localStorage.setItem('fc_barja_venues', JSON.stringify(list));
    }
}

function populateVenueSelect(selected) {
    const sel = document.getElementById('match-location');
    if (!sel) return;
    const custom = getCustomVenues();
    const all = [...DEFAULT_VENUES, ...custom];
    // 기존 옵션 유지 (추가 전)
    sel.innerHTML = all.map(v =>
        `<option value="${v}"${v === (selected || AppState.matchLocation) ? ' selected' : ''}>${v}</option>`
    ).join('') + '<option value="__custom__">+ \ub2e4\ub978 \uacbd\uae30\uc7a5 \ucd94\uac00...</option>';
}

// 앱 초기화
async function initApp() {
    // 탭 버튼 이벤트
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Tab 1 이벤트 초기화
    initTab1Events();

    // 업장 드롭다운 초기 보지
    populateVenueSelect();

    // Flatpickr 운영 (Korean locale)
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

    // Firebase 초기화
    await initGoogleAuth();
}

document.addEventListener('DOMContentLoaded', initApp);

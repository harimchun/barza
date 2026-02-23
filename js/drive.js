// =============================================
// FC 바르자 팀 매니저 - Firebase Realtime Database 연동
// 팀 전체가 하나의 공유 데이터베이스를 사용합니다.
// =============================================

const DB_NODES = {
    roster: '/roster.json',
    matches: '/matches.json',
};

function dbUrl(node) {
    return CONFIG.FIREBASE_DB_URL.replace(/\/$/, '') + node;
}

// ── 연결 상태 UI ──────────────────────────────────────────────────────────
function updateAuthUI(state) {
    const btn = document.getElementById('auth-btn');
    const statusEl = document.getElementById('auth-status');

    if (state === 'no-config') {
        btn.textContent = '⚙️ Firebase URL 미설정';
        btn.className = 'auth-btn auth-warn';
        btn.onclick = () => window.open('https://console.firebase.google.com/', '_blank');
        statusEl.textContent = 'js/config.js 에서 FIREBASE_DB_URL을 설정하세요.';
        statusEl.className = 'auth-status warn';
    } else if (state === 'connected') {
        btn.textContent = '✅ DB 연결됨';
        btn.className = 'auth-btn auth-connected';
        btn.onclick = null;
        statusEl.textContent = 'Firebase에 연결되었습니다.';
        statusEl.className = 'auth-status success';
    } else if (state === 'error') {
        btn.textContent = '❌ 연결 오류';
        btn.className = 'auth-btn auth-warn';
        btn.onclick = () => initGoogleAuth();
        statusEl.textContent = 'DB 연결 실패. 설정을 확인하세요.';
        statusEl.className = 'auth-status warn';
    }
}

// ── Firebase REST API 헬퍼 ────────────────────────────────────────────────
async function fbGet(node) {
    const resp = await fetch(dbUrl(node));
    if (!resp.ok) throw new Error(`Firebase GET 실패: ${resp.status}`);
    return resp.json();
}

async function fbPut(node, data) {
    const resp = await fetch(dbUrl(node), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!resp.ok) throw new Error(`Firebase PUT 실패: ${resp.status}`);
}

// ── 초기화 ────────────────────────────────────────────────────────────────
async function initGoogleAuth() {
    if (!CONFIG.FIREBASE_DB_URL || CONFIG.FIREBASE_DB_URL === 'YOUR_FIREBASE_DB_URL_HERE') {
        updateAuthUI('no-config');
        return;
    }
    try {
        await loadAllData();
    } catch (e) {
        updateAuthUI('error');
        showToast('Firebase 연결 실패: ' + e.message, 'error');
        console.error(e);
    }
}

async function loadAllData() {
    showToast('데이터를 불러오는 중...', 'info');
    await loadRoster();
    await loadMatches();
    AppState.isSignedIn = true;
    updateAuthUI('connected');
    renderTab1();
    showToast('데이터 로드 완료!');
}

// ── 명단 ─────────────────────────────────────────────────────────────────
async function loadRoster() {
    const data = await fbGet(DB_NODES.roster);
    if (data && typeof data === 'object' && !Array.isArray(data)) {
        AppState.roster = data;
    } else {
        // 첫 실행: 기본 명단으로 초기화
        AppState.roster = getDefaultRoster();
        await fbPut(DB_NODES.roster, AppState.roster);
    }
}

async function saveRoster() {
    await fbPut(DB_NODES.roster, AppState.roster);
}

// ── 경기 기록 ─────────────────────────────────────────────────────────────
async function loadMatches() {
    const data = await fbGet(DB_NODES.matches);
    AppState.matches = Array.isArray(data) ? data : [];
}

async function saveMatches() {
    await fbPut(DB_NODES.matches, AppState.matches);
}

// ── 기본 선수 명단 ────────────────────────────────────────────────────────
function getDefaultRoster() {
    const defaults = [
        '주열', '재훈', '경조', '민철', '현수', '우성', '현성', '형록', '형모', '선우',
        '승문', '진서', '주영', '준호', '영제', '현재', '하림', '선택', '진환', '요셉',
        '선명', '준만', '준희', '윤성', '영식', '태근', '승환', '준현', '재성', '경환',
        '민규', '지호', '지용', '세용', '영현', '정준', '성호', '경원',
    ];
    const roster = {};
    defaults.forEach(p => roster[p] = 'Member');
    return roster;
}

// =============================================
// FC 바르자 팀 매니저 - Firebase / Auth 연동
// =============================================

const DB_NODES = {
    roster: '/roster.json',
    matches: '/matches.json',
};

function dbUrl(node, token) {
    const base = CONFIG.FIREBASE_DB_URL.replace(/\/$/, '') + node;
    return token ? `${base}?auth=${token}` : base;
}

// ── 현재 로그인 유저의 ID Token ───────────────────────────────────────────
async function getIdToken() {
    if (!window._firebaseAuth) return null;
    const user = window._firebaseAuth.currentUser;
    if (!user) return null;
    try { return await user.getIdToken(); }
    catch { return null; }
}

// ── Auth 상태 UI ──────────────────────────────────────────────────────────
function updateAuthUI(state, user) {
    const btn = document.getElementById('auth-btn');
    const status = document.getElementById('auth-status');

    switch (state) {
        case 'no-config':
            btn.textContent = '⚙️ Firebase 미설정';
            btn.className = 'auth-btn auth-warn';
            btn.onclick = () => window.open('https://console.firebase.google.com/', '_blank');
            status.textContent = 'js/config.js에서 FIREBASE_DB_URL을 설정하세요.';
            break;

        case 'signed-out':
            btn.textContent = '🔐 로그인';
            btn.className = 'auth-btn';
            btn.onclick = handleSignIn;
            status.textContent = '로그인하면 편집 가능';
            break;

        case 'viewer': {
            const name = user.displayName || user.email;
            btn.textContent = `👤 ${name}`;
            btn.className = 'auth-btn';
            btn.onclick = handleSignOut;
            btn.title = '클릭하여 로그아웃';
            status.textContent = '읽기 전용 (편집 권한 없음)';
            break;
        }

        case 'editor': {
            const name = user.displayName || user.email;
            btn.textContent = `✏️ ${name}`;
            btn.className = 'auth-btn auth-connected';
            btn.onclick = handleSignOut;
            btn.title = '클릭하여 로그아웃';
            status.textContent = '편집 권한 있음';
            break;
        }

        case 'loading':
            btn.textContent = '⏳ 로딩 중';
            btn.className = 'auth-btn';
            btn.onclick = null;
            status.textContent = '데이터를 불러오는 중...';
            break;

        case 'error':
            btn.textContent = '❌ 연결 오류';
            btn.className = 'auth-btn auth-warn';
            btn.onclick = () => initGoogleAuth();
            status.textContent = 'DB 연결 실패. 설정을 확인하세요.';
            break;
    }
}

// ── Google 로그인 / 로그아웃 ────────────────────────────────────────────
async function handleSignIn() {
    if (!window._firebaseAuth) return;
    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        await window._firebaseAuth.signInWithPopup(provider);
        // onAuthStateChanged가 자동으로 UI 업데이트
    } catch (e) {
        console.error('로그인 실패', e);
        showToast('로그인 실패: ' + e.message, 'error');
    }
}

async function handleSignOut() {
    if (!window._firebaseAuth) return;
    try {
        await window._firebaseAuth.signOut();
        showToast('로그아웃되었습니다.');
    } catch (e) {
        console.error('로그아웃 실패', e);
    }
}

// ── 편집 권한 체크 (외부에서 호출) ───────────────────────────────────────
function checkEditorAccess() {
    if (AppState.isEditor) return true;
    if (!AppState.currentUser) {
        showToast('🔐 로그인 후 이용 가능합니다.', 'error');
    } else {
        showToast('⛔ 편집 권한이 없습니다.', 'error');
    }
    return false;
}

// ── Firebase REST API ─────────────────────────────────────────────────────
async function fbGet(node) {
    const resp = await fetch(dbUrl(node));
    if (!resp.ok) throw new Error(`Firebase GET 실패: ${resp.status}`);
    return resp.json();
}

async function fbPut(node, data) {
    const token = await getIdToken();
    const resp = await fetch(dbUrl(node, token), {
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

    // Firebase App 초기화 (중복 방지)
    if (!firebase.apps.length) {
        firebase.initializeApp(CONFIG.FIREBASE_CONFIG);
    }
    window._firebaseAuth = firebase.auth();

    updateAuthUI('loading');

    // 먼저 데이터 로드 (읽기는 인증 불필요)
    try {
        await loadAllData();
    } catch (e) {
        updateAuthUI('error');
        showToast('Firebase 연결 실패: ' + e.message, 'error');
        console.error(e);
        return;
    }

    // Auth 상태 감시 (로그인/로그아웃 시 UI + 권한 업데이트)
    window._firebaseAuth.onAuthStateChanged(user => {
        if (user) {
            AppState.currentUser = user;
            AppState.isEditor = CONFIG.ALLOWED_EDITORS.includes(user.email);
            updateAuthUI(AppState.isEditor ? 'editor' : 'viewer', user);
        } else {
            AppState.currentUser = null;
            AppState.isEditor = false;
            updateAuthUI('signed-out');
        }
        // 편집 버튼 활성/비활성 갱신
        updateEditButtonsVisibility();
    });
}

// ── 편집 버튼 표시 제어 ────────────────────────────────────────────────────
function updateEditButtonsVisibility() {
    // body에 역할 클래스를 부여 → CSS에서 읽기 전용 모드 스타일 적용
    document.body.classList.toggle('is-editor', AppState.isEditor);
    document.body.classList.toggle('is-viewer', !AppState.isEditor);

    const editorOnly = document.querySelectorAll('.editor-only');
    editorOnly.forEach(el => {
        if (AppState.isEditor) {
            el.removeAttribute('disabled');
            el.removeAttribute('aria-disabled');
            el.title = '';
        } else {
            // 버튼류는 disabled, 그 외에는 aria-disabled로 표시 (CSS가 처리)
            if (el.tagName === 'BUTTON' || el.tagName === 'INPUT' || el.tagName === 'SELECT') {
                el.setAttribute('disabled', '');
            }
            el.setAttribute('aria-disabled', 'true');
            el.title = AppState.currentUser ? '편집 권한이 없습니다' : '로그인 후 편집 가능';
        }
    });

    // tab1 읽기 전용 안내 배너
    const notice = document.getElementById('role-notice');
    if (notice) {
        if (AppState.isEditor) {
            notice.style.display = 'none';
        } else {
            notice.style.display = 'block';
            notice.className = 'role-notice-banner';
            notice.textContent = AppState.currentUser
                ? '👀 읽기 전용 모드 — 편집 권한이 없어 저장할 수 없습니다.'
                : '👀 읽기 전용 모드 — 로그인하면 경기를 기록하고 저장할 수 있습니다.';
        }
    }
}

async function loadAllData() {
    await loadRoster();
    await loadMatches();
    AppState.isSignedIn = true;
    renderTab1();
    showToast('데이터 로드 완료!');
}

// ── 명단 ──────────────────────────────────────────────────────────────────
async function loadRoster() {
    const data = await fbGet(DB_NODES.roster);
    if (data && typeof data === 'object' && !Array.isArray(data)) {
        AppState.roster = data;
    } else {
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

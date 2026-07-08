// =============================================
// FC 바르자 팀 매니저 - Tab 1: 당일 경기 운영
// =============================================

// ── Tab 1 전체 렌더링 ──────────────────────────────────────────────────────
function renderTab1() {
    renderPlayerChecklist();
    renderSquadTable();
    renderPlaytimeStats();
    renderLiveRecorder();
    renderFormationBuilder();
    updateEditModeNotice();
    renderFormationOverview();
    updateAutoSaveStatus();
}

function updateEditModeNotice() {
    const el = document.getElementById('edit-mode-notice');
    if (!el) return;
    if (AppState.editModeId) {
        el.textContent = `✏️ 수정 중: ${AppState.editModeId}`;
        el.style.display = 'block';
    } else {
        el.style.display = 'none';
    }
}

// ── 전체 쿼터 포메이션 개요 ──────────────────────────────────────────────
function renderFormationOverview() {
    QUARTERS.forEach(q => {
        const canvas = document.getElementById(`overview-canvas-${q}`);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const W = canvas.width, H = canvas.height;

        // 피치 배경
        ctx.fillStyle = '#1a4731';
        ctx.fillRect(0, 0, W, H);

        // 라인
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 1;
        ctx.strokeRect(4, 4, W - 8, H - 8);
        ctx.beginPath();
        ctx.moveTo(4, H / 2); ctx.lineTo(W - 4, H / 2);
        ctx.stroke();
        // 센터 서클
        ctx.beginPath();
        ctx.arc(W / 2, H / 2, Math.min(W, H) * 0.1, 0, Math.PI * 2);
        ctx.stroke();

        // 선수 배치
        const formation = AppState.formationState[q] || {};
        if (Object.keys(formation).length === 0) {
            ctx.fillStyle = 'rgba(255,255,255,0.2)';
            ctx.font = `${W * 0.07}px Pretendard, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('미배치', W / 2, H / 2);
            return;
        }

        // 빌더 좌표계(left/top %)를 그대로 사용 — 커스텀 드래그 배치도 미니맵에 반영
        const formationType = AppState.formationTypes[q] || '4-2-3-1';
        const posEntries = Object.entries(formation).filter(([, player]) => player && player !== '-');

        posEntries.forEach(([pos, player]) => {
            const coord = getPosCoord(q, pos, formationType);
            const cx = W * (coord.left / 100);
            const cy = H * (coord.top / 100);
            const r = W * 0.038;
            // 점
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fillStyle = '#A50044';
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1;
            ctx.stroke();
            // 이름 (앞 2글자)
            ctx.fillStyle = '#fff';
            ctx.font = `bold ${W * 0.055}px Pretendard, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            const name = (player || '').slice(0, 2);
            ctx.fillText(name, cx, cy + r + 1);
        });
    });
}

// ── 참석자 체크리스트 ──────────────────────────────────────────────────────
function renderPlayerChecklist() {
    const container = document.getElementById('player-checklist');
    if (!container) return;
    const players = getAllPlayersSorted();
    container.innerHTML = players.map(name => {
        const checked = AppState.attendees.includes(name) ? 'checked' : '';
        const isGuest = AppState.roster[name] === 'Guest';
        const safe = escapeHtml(name);
        return `
      <label class="player-check-item ${isGuest ? 'is-guest' : ''}">
        <input type="checkbox" class="player-cb" data-name="${safe}" ${checked}>
        <span>${safe}${isGuest ? ' <em>(용병)</em>' : ''}</span>
      </label>`;
    }).join('');

    container.querySelectorAll('.player-cb').forEach(cb => {
        cb.addEventListener('change', () => {
            const name = cb.dataset.name;
            if (cb.checked) {
                if (!AppState.attendees.includes(name)) AppState.attendees.push(name);
                if (!AppState.squadPlan[name]) AppState.squadPlan[name] = { '1Q': false, '2Q': false, '3Q': false, '4Q': false };
            } else {
                AppState.attendees = AppState.attendees.filter(n => n !== name);
            }
            renderSquadTable();
            renderPlaytimeStats();
            renderLiveRecorder();
            renderFormationBuilder(); // 드롭다운 옵션 업데이트
        });
    });
}

// ── 스쿼드 테이블 (출전 체크박스) ─────────────────────────────────────────
function renderSquadTable() {
    const container = document.getElementById('squad-table-container');
    if (!container || AppState.attendees.length === 0) {
        if (container) container.innerHTML = '<p class="empty-hint">참석자를 선택해주세요.</p>';
        return;
    }
    const rows = AppState.attendees.map(name => {
        const sp = AppState.squadPlan[name] || { '1Q': false, '2Q': false, '3Q': false, '4Q': false };
        const safe = escapeHtml(name);
        const qCells = QUARTERS.map(q => {
            const checked = sp[q] ? 'checked' : '';
            return `<td><input type="checkbox" class="squad-cb" data-name="${safe}" data-q="${q}" ${checked}></td>`;
        }).join('');
        const participation = getParticipation(name);
        return `<tr>
      <td class="squad-name">${escapeHtml(formatPlayerName(name))}</td>
      ${qCells}
      <td class="participation-score">${participation % 1 === 0 ? participation : participation.toFixed(1)}</td>
    </tr>`;
    }).join('');

    container.innerHTML = `
    <table class="squad-table">
      <thead>
        <tr>
          <th>이름</th><th>1Q</th><th>2Q</th><th>3Q</th><th>4Q</th><th>참여</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;

    container.querySelectorAll('.squad-cb').forEach(cb => {
        cb.addEventListener('change', () => {
            const name = cb.dataset.name;
            const q = cb.dataset.q;
            if (!AppState.squadPlan[name]) AppState.squadPlan[name] = {};
            AppState.squadPlan[name][q] = cb.checked;
            renderPlaytimeStats();
        });
    });
}

// ── 출전 시간 통계 ──────────────────────────────────────────────────────────
function renderPlaytimeStats() {
    const el = document.getElementById('playtime-stats');
    if (!el || AppState.attendees.length === 0) {
        if (el) el.innerHTML = '';
        return;
    }

    const scores = AppState.attendees.map(n => getParticipation(n));
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const target = 44 / AppState.attendees.length;
    const imbalance = (max - min) >= 2;

    el.innerHTML = `
    <div class="playtime-info">
      <span>참석: <strong>${AppState.attendees.length}명</strong></span>
      <span>권장: 인당 <strong>${target.toFixed(1)}Q</strong></span>
      <span>평균: <strong>${avg.toFixed(1)}Q</strong></span>
    </div>
    <div class="playtime-alert ${imbalance ? 'warning' : 'success'}">
      ${imbalance
            ? `⚠️ 출전 시간 불균형! 최대 ${max}Q vs 최소 ${min}Q`
            : `✅ 균형 배정 (${min}Q ~ ${max}Q)`}
    </div>`;
}

// ── 포메이션 빌더 (피치 위 비주얼 배치) ──────────────────────────────────

// 포지션 좌표: { left%, top% } — 세로 피치 (ST=상단, GK=하단)
// top은 타이틀바(~5%) 고려하여 오프셋 적용
const PITCH_POS_COORDS = {
    '4-2-3-1': {
        'ST':  { left: 50, top: 13 },
        'LW':  { left: 18, top: 28 },
        'CAM': { left: 50, top: 33 },
        'RW':  { left: 82, top: 28 },
        'LDM': { left: 35, top: 50 },
        'RDM': { left: 65, top: 50 },
        'LB':  { left: 12, top: 70 },
        'LCB': { left: 37, top: 73 },
        'RCB': { left: 63, top: 73 },
        'RB':  { left: 88, top: 70 },
        'GK':  { left: 50, top: 90 },
    },
    '4-3-3': {
        'LW':  { left: 20, top: 15 },
        'ST':  { left: 50, top: 13 },
        'RW':  { left: 80, top: 15 },
        'LCM': { left: 25, top: 42 },
        'CM':  { left: 50, top: 38 },
        'RCM': { left: 75, top: 42 },
        'LB':  { left: 12, top: 70 },
        'LCB': { left: 37, top: 73 },
        'RCB': { left: 63, top: 73 },
        'RB':  { left: 88, top: 70 },
        'GK':  { left: 50, top: 90 },
    },
    '4-4-2': {
        'LW':  { left: 35, top: 15 },
        'RW':  { left: 65, top: 15 },
        'LM':  { left: 12, top: 42 },
        'LCM': { left: 37, top: 40 },
        'RCM': { left: 63, top: 40 },
        'RM':  { left: 88, top: 42 },
        'LB':  { left: 12, top: 70 },
        'LCB': { left: 37, top: 73 },
        'RCB': { left: 63, top: 73 },
        'RB':  { left: 88, top: 70 },
        'GK':  { left: 50, top: 90 },
    },
    '3-5-2': {
        'LW':  { left: 35, top: 15 },
        'ST':  { left: 50, top: 13 },
        'RW':  { left: 65, top: 15 },
        'MF0': { left: 25, top: 42 },
        'MF1': { left: 50, top: 38 },
        'MF2': { left: 75, top: 42 },
        'LB':  { left: 12, top: 70 },
        'LCB': { left: 37, top: 73 },
        'RCB': { left: 63, top: 73 },
        'RB':  { left: 88, top: 70 },
        'GK':  { left: 50, top: 90 },
    },
};

// 포지션 → 행 키(row key) 매핑 (라벨 색상용)
function getPosRowKey(pos, fType) {
    const fDef = FORMATION_POSITIONS[fType];
    if (!fDef) return 'mf';
    for (const row of fDef.rows) {
        if (row.positions.includes(pos)) return row.key;
    }
    return 'mf';
}

// ── 포메이션 배치 헬퍼 ─────────────────────────────────────────────────────
function playerInFormationQ(playerName, q) {
    const fm = AppState.formationState[q];
    const fs = AppState.formationSubs[q];
    for (const p in fm) if (fm[p] === playerName && fm[p] !== '-') return true;
    for (const p in fs) if (fs[p] === playerName && fs[p] !== '-') return true;
    return false;
}

function fbSetSquad(q, name, on) {
    if (!name || name === '-') return;
    if (!AppState.squadPlan[name]) AppState.squadPlan[name] = {};
    AppState.squadPlan[name][q] = on;
}

function fbRefresh() {
    renderFormationBuilder();
    renderSquadTable();
    renderPlaytimeStats();
    renderFormationOverview();
}

// 주전 선택 (드롭다운)
function fbApplyMain(q, pos, val) {
    const fMap = AppState.formationState[q];
    const old = fMap[pos];
    fMap[pos] = val;
    if (val !== '-') fbSetSquad(q, val, true);
    if (old && old !== '-' && old !== val && !playerInFormationQ(old, q)) {
        fbSetSquad(q, old, false);
    }
    fbRefresh();
}

// 교체 선택 (드롭다운)
function fbApplySub(q, pos, val) {
    const fSubs = AppState.formationSubs[q];
    const old = fSubs[pos];
    fSubs[pos] = val;
    if (val !== '-') fbSetSquad(q, val, true);
    if (old && old !== '-' && old !== val && !playerInFormationQ(old, q)) {
        fbSetSquad(q, old, false);
    }
    fbRefresh();
}

// 포지션 카드 좌표: 사용자 드래그 오버라이드 → 포메이션 기본값 순
function getPosCoord(q, pos, fType) {
    const custom = AppState.formationCoords && AppState.formationCoords[q] && AppState.formationCoords[q][pos];
    if (custom && typeof custom.left === 'number' && typeof custom.top === 'number') return custom;
    return (PITCH_POS_COORDS[fType] || {})[pos] || { left: 50, top: 50 };
}

function renderFormationBuilder() {
    const container = document.getElementById('formation-builder');
    if (!container) return;

    const q = AppState.currentQuarter;
    const fType = AppState.formationTypes[q];
    const fDef = FORMATION_POSITIONS[fType];
    const coords = PITCH_POS_COORDS[fType] || {};
    const bench = document.getElementById('formation-bench');

    // 알 수 없는 포메이션 타입 방어 (데이터 손상/구버전 기록 대비)
    if (!fDef) {
        if (bench) bench.innerHTML = '';
        container.innerHTML = `
      <div class="pitch-title">FC BARZA · ${escapeHtml(q)}</div>
      <p class="empty-hint" style="position:absolute;inset:32px 0 0;display:flex;align-items:center;justify-content:center;text-align:center;padding:1rem">
        지원하지 않는 포메이션입니다: ${escapeHtml(fType || '?')}
      </p>`;
        return;
    }

    const fMap = AppState.formationState[q];
    const fSubs = AppState.formationSubs[q];

    // ── 벤치 (현재 쿼터에 주전/교체로 배정되지 않은 참석자) ──
    const assigned = new Set();
    Object.values(fMap).forEach(n => { if (n && n !== '-') assigned.add(n); });
    Object.values(fSubs).forEach(n => { if (n && n !== '-') assigned.add(n); });
    const benchPlayers = AppState.attendees.filter(n => !assigned.has(n));

    if (bench) {
        const chips = benchPlayers.map(n => {
            const part = getParticipation(n);
            const pLabel = part ? `<em>${part % 1 === 0 ? part : part.toFixed(1)}Q</em>` : '';
            const isGuest = AppState.roster[n] === 'Guest';
            return `<span class="bench-chip${isGuest ? ' is-guest' : ''}">${escapeHtml(n)}${pLabel}</span>`;
        }).join('');
        bench.innerHTML = `
      <div class="bench-head">
        <span class="bench-title">🪑 미배치 <span class="bench-count">${benchPlayers.length}</span></span>
        <span class="bench-hint">선수는 카드의 드롭다운으로 선택 · 카드를 끌면 위치 자유 조정</span>
      </div>
      <div class="bench-chips">${
            AppState.attendees.length === 0
                ? '<span class="empty-hint">참석자를 먼저 선택하세요.</span>'
                : (chips || '<span class="empty-hint">모든 참석자가 배치되었습니다. ⚽</span>')
        }</div>`;
    }

    // 선수 드롭다운 옵션 (다른 포지션 주전/교체로 배정된 선수 제외)
    function buildOptions(pos, type) {
        const current = type === 'main' ? (fMap[pos] || '-') : (fSubs[pos] || '-');

        const assignedMainOther = new Set();
        const assignedSubOther = new Set();
        for (const [p, player] of Object.entries(fMap)) {
            if (p === pos) continue;
            if (player && player !== '-') assignedMainOther.add(player);
        }
        for (const [p, s] of Object.entries(fSubs)) {
            if (p === pos) continue;
            if (s && s !== '-') assignedSubOther.add(s);
        }

        const opts = AppState.attendees.filter(n => {
            if (n === current) return true;
            if (assignedMainOther.has(n) || assignedSubOther.has(n)) return false;
            if (type === 'sub') return n !== (fMap[pos] || '');
            return true;
        });

        const optionHtml = opts.map(n => {
            const role = AppState.roster[n] === 'Guest' ? ' (용병)' : '';
            return `<option value="${escapeHtml(n)}" ${n === current ? 'selected' : ''}>${escapeHtml(n)}${role}</option>`;
        }).join('');

        const noneLabel = type === 'main' ? '선택' : '교체 없음';
        return `<option value="-" ${current === '-' ? 'selected' : ''}>${noneLabel}</option>${optionHtml}`;
    }

    function buildPosCell(pos) {
        const label = (POSITION_DISPLAY_LABELS[fType] || {})[pos] || pos;
        const coord = getPosCoord(q, pos, fType);
        const rowKey = getPosRowKey(pos, fType);
        const hasSub = fSubs[pos] && fSubs[pos] !== '-';
        const filled = fMap[pos] && fMap[pos] !== '-';
        return `
      <div class="pos-cell ${filled ? 'is-filled' : ''} ${hasSub ? 'has-sub' : ''}" data-pos="${escapeHtml(pos)}" style="left:${coord.left}%;top:${coord.top}%">
        <button type="button" class="pos-sub-toggle ${hasSub ? 'active' : ''}" data-pos="${escapeHtml(pos)}" title="교체 선수 지정/해제" aria-label="교체 선수 지정">⇄</button>
        <div class="pos-badge pos-badge-${rowKey}" title="드래그하여 위치 이동">${escapeHtml(label)}</div>
        <select class="pos-main-sel" data-pos="${escapeHtml(pos)}" aria-label="${escapeHtml(label)} 선수">${buildOptions(pos, 'main')}</select>
        <select class="pos-sub-sel ${hasSub ? 'show' : ''}" data-pos="${escapeHtml(pos)}" aria-label="${escapeHtml(label)} 교체 선수">${buildOptions(pos, 'sub')}</select>
      </div>`;
    }

    // 피치 라인 + 포지션 카드 렌더링
    const allPositions = fDef.rows.flatMap(row => row.positions);
    const positionsHtml = allPositions.map(pos => buildPosCell(pos)).join('');

    container.innerHTML = `
    <div class="pitch-title">FC BARZA · ${escapeHtml(q)} · ${escapeHtml(fType)}</div>
    <div class="pitch-lines"></div>
    <div class="pitch-center-circle"></div>
    <div class="pitch-penalty-top"></div>
    <div class="pitch-penalty-bottom"></div>
    ${positionsHtml}`;

    // ── 교체 컨트롤 ──
    container.querySelectorAll('.pos-sub-sel').forEach(sel => {
        sel.addEventListener('change', () => fbApplySub(q, sel.dataset.pos, sel.value));
        sel.addEventListener('pointerdown', e => e.stopPropagation());
    });

    container.querySelectorAll('.pos-sub-toggle').forEach(btn => {
        btn.addEventListener('pointerdown', e => e.stopPropagation());
        btn.addEventListener('click', () => {
            const pos = btn.dataset.pos;
            const cell = btn.closest('.pos-cell');
            const subSel = container.querySelector(`.pos-sub-sel[data-pos="${CSS.escape(pos)}"]`);
            const turningOn = !btn.classList.contains('active');
            if (turningOn) {
                btn.classList.add('active');
                if (cell) cell.classList.add('has-sub');
                if (subSel) { subSel.classList.add('show'); subSel.focus(); }
            } else {
                fbApplySub(q, pos, '-'); // 끄면 교체 선수 초기화
            }
        });
    });

    // ── 주전 선택 (드롭다운) ──
    container.querySelectorAll('.pos-main-sel').forEach(sel => {
        sel.addEventListener('change', () => fbApplyMain(q, sel.dataset.pos, sel.value));
        sel.addEventListener('pointerdown', e => e.stopPropagation());
    });

    // ── 포지션 카드 자유 이동 (전술 보드처럼 드래그) ──
    container.querySelectorAll('.pos-cell').forEach(cell => {
        cell.addEventListener('pointerdown', e => {
            if (e.button !== undefined && e.button !== 0) return;
            if (e.target.closest('select, .pos-sub-toggle')) return; // 컨트롤 조작은 드래그 아님

            const pos = cell.dataset.pos;
            const rect = container.getBoundingClientRect();
            const startX = e.clientX, startY = e.clientY;
            // 카드 중심이 타이틀바 아래·피치 안에 머물도록 클램프 범위 계산
            const topMin = (34 / rect.height) * 100 + 4;
            let moved = false;

            const onMove = ev => {
                if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 4) return;
                moved = true;
                cell.classList.add('dragging');
                let left = ((ev.clientX - rect.left) / rect.width) * 100;
                let top = ((ev.clientY - rect.top) / rect.height) * 100;
                left = Math.min(93, Math.max(7, left));
                top = Math.min(95, Math.max(topMin, top));
                cell.style.left = left.toFixed(1) + '%';
                cell.style.top = top.toFixed(1) + '%';
                ev.preventDefault();
            };

            const finish = () => {
                cell.removeEventListener('pointermove', onMove);
                cell.removeEventListener('pointerup', onUp);
                cell.removeEventListener('pointercancel', onUp);
                try { cell.releasePointerCapture(e.pointerId); } catch { /* 합성 이벤트 등 */ }
                cell.classList.remove('dragging');
            };

            const onUp = () => {
                finish();
                if (moved) {
                    if (!AppState.formationCoords) AppState.formationCoords = {};
                    if (!AppState.formationCoords[q]) AppState.formationCoords[q] = {};
                    AppState.formationCoords[q][pos] = {
                        left: parseFloat(cell.style.left),
                        top: parseFloat(cell.style.top),
                    };
                    renderFormationOverview(); // 미니맵에 즉시 반영
                }
            };

            try { cell.setPointerCapture(e.pointerId); } catch { /* 합성 이벤트 등 */ }
            cell.addEventListener('pointermove', onMove);
            cell.addEventListener('pointerup', onUp);
            cell.addEventListener('pointercancel', onUp);
        });
    });
}

// ── 이벤트 → 스코어/스탯 자동 계산 ─────────────────────────────────────────
function recalcFromEvents() {
    // 쿼터별 스코어 초기화
    AppState.quarterScores = { '1Q': [0, 0], '2Q': [0, 0], '3Q': [0, 0], '4Q': [0, 0] };
    AppState.matchStats = {};

    AppState.matchEvents.forEach(ev => {
        const q = ev.quarter;
        if (ev.type === 'goal') {
            AppState.quarterScores[q][0] += 1;
            // 득점자 스탯
            if (ev.scorer) {
                if (!AppState.matchStats[ev.scorer]) AppState.matchStats[ev.scorer] = { goals: 0, assists: 0 };
                AppState.matchStats[ev.scorer].goals += 1;
            }
            // 어시스트 스탯
            if (ev.assister) {
                if (!AppState.matchStats[ev.assister]) AppState.matchStats[ev.assister] = { goals: 0, assists: 0 };
                AppState.matchStats[ev.assister].assists += 1;
            }
        } else if (ev.type === 'opponentGoal') {
            AppState.quarterScores[q][1] += 1;
        }
    });
}

// ── 실시간 기록판 ────────────────────────────────────────────────────────────
function renderLiveRecorder() {
    const container = document.getElementById('live-recorder');
    if (!container) return;

    if (AppState.attendees.length === 0) {
        container.innerHTML = '<p class="empty-hint">참석자를 선택하면 기록이 활성화됩니다.</p>';
        return;
    }

    const lq = AppState.liveQuarter;

    // 전체 스코어 요약
    const totalUs = QUARTERS.reduce((a, q) => a + AppState.quarterScores[q][0], 0);
    const totalThem = QUARTERS.reduce((a, q) => a + AppState.quarterScores[q][1], 0);

    // 참석자 드롭다운 옵션
    const playerOpts = AppState.attendees.map(n =>
        `<option value="${escapeHtml(n)}">${escapeHtml(formatPlayerName(n))}</option>`
    ).join('');

    // 특정 값이 선택된 참석자 옵션 (수정 폼용). 명단에 없는 값도 유지.
    const playerOptionsWith = (selected) => {
        const names = (!selected || AppState.attendees.includes(selected))
            ? AppState.attendees
            : [selected, ...AppState.attendees];
        return names.map(n =>
            `<option value="${escapeHtml(n)}" ${n === selected ? 'selected' : ''}>${escapeHtml(formatPlayerName(n))}</option>`
        ).join('');
    };
    const quarterOptions = (selected) =>
        QUARTERS.map(qq => `<option value="${qq}" ${qq === selected ? 'selected' : ''}>${qq}</option>`).join('');

    // 인라인 수정 폼 (경기장에서 실시간 기록 중 잘못 입력 수정용)
    const buildEditForm = (ev, globalIdx) => {
        const fields = ev.type === 'goal'
            ? `<select class="ev-edit-quarter" aria-label="쿼터">${quarterOptions(ev.quarter)}</select>
               <select class="ev-edit-scorer" aria-label="득점자">${playerOptionsWith(ev.scorer)}</select>
               <select class="ev-edit-assister" aria-label="도움"><option value="">👟 도움 없음</option>${playerOptionsWith(ev.assister)}</select>`
            : `<select class="ev-edit-quarter" aria-label="쿼터">${quarterOptions(ev.quarter)}</select>
               <span class="ev-edit-label">🔴 상대팀 득점</span>`;
        return `<div class="event-item event-edit-form">
              <div class="ev-edit-fields">${fields}</div>
              <div class="ev-edit-actions">
                <button class="ev-edit-save" data-idx="${globalIdx}">저장</button>
                <button class="ev-edit-cancel">취소</button>
              </div>
            </div>`;
    };

    // 쿼터별 이벤트 로그
    const eventsHtml = QUARTERS.map(q => {
        const qEvents = AppState.matchEvents.filter(e => e.quarter === q);
        const [us, them] = AppState.quarterScores[q];
        const evList = qEvents.length === 0
            ? '<span class="empty-hint" style="font-size:0.75rem">기록 없음</span>'
            : qEvents.map((ev) => {
                const globalIdx = AppState.matchEvents.indexOf(ev);
                if (globalIdx === AppState.editingEventIdx) {
                    return buildEditForm(ev, globalIdx);
                }
                const actions = `<span class="event-actions">
                      <button class="event-edit" data-idx="${globalIdx}" title="수정">✎</button>
                      <button class="event-delete" data-idx="${globalIdx}" title="삭제">✕</button>
                    </span>`;
                if (ev.type === 'goal') {
                    const assStr = ev.assister ? `, 👟 ${escapeHtml(ev.assister)}` : '';
                    return `<div class="event-item event-goal">
                      <span>⚽ ${escapeHtml(ev.scorer)}${assStr}</span>
                      ${actions}
                    </div>`;
                } else {
                    return `<div class="event-item event-opponent">
                      <span>🔴 상대팀 득점</span>
                      ${actions}
                    </div>`;
                }
            }).join('');

        return `<div class="event-quarter-block ${q === lq ? 'active-quarter' : ''}">
          <div class="event-quarter-header">
            <span class="event-q-label">${q}</span>
            <span class="event-q-score">${us} : ${them}</span>
          </div>
          <div class="event-list">${evList}</div>
        </div>`;
    }).join('');

    container.innerHTML = `
    <div class="live-score-summary">
      <span class="live-team-name">FC 바르자</span>
      <span class="live-total-score">${totalUs} : ${totalThem}</span>
      <span class="live-team-name">${escapeHtml(AppState.matchOpponent || '상대팀')}</span>
    </div>

    <div class="live-input-section">
      <div class="live-quarter-selector">
        ${QUARTERS.map(q => `<button class="live-qbtn ${q === lq ? 'active' : ''}" data-q="${q}">${q}</button>`).join('')}
      </div>

      <div class="live-action-row">
        <select id="live-scorer" class="live-select">
          <option value="">⚽ 득점자 선택</option>
          ${playerOpts}
        </select>
        <select id="live-assister" class="live-select">
          <option value="">👟 어시스트 없음</option>
          ${playerOpts}
        </select>
        <button id="live-add-goal" class="btn-goal">⚽ 골!</button>
      </div>

      <div class="live-action-row" style="margin-top:0.3rem">
        <button id="live-add-opponent-goal" class="btn-opponent-goal">🔴 상대팀 득점</button>
      </div>
    </div>

    <div class="event-log">
      ${eventsHtml}
    </div>`;

    // 이벤트 핸들러
    container.querySelectorAll('.live-qbtn').forEach(btn => {
        btn.addEventListener('click', () => {
            AppState.liveQuarter = btn.dataset.q;
            renderLiveRecorder();
        });
    });

    document.getElementById('live-add-goal').addEventListener('click', () => {
        const scorer = document.getElementById('live-scorer').value;
        if (!scorer) { showToast('득점자를 선택해주세요.', 'error'); return; }
        const assister = document.getElementById('live-assister').value;
        AppState.matchEvents.push({
            quarter: AppState.liveQuarter,
            type: 'goal',
            scorer,
            assister: assister || null,
        });
        recalcFromEvents();
        renderLiveRecorder();
        showToast(`⚽ ${scorer} 골!${assister ? ` (👟 ${assister})` : ''}`);
    });

    document.getElementById('live-add-opponent-goal').addEventListener('click', () => {
        AppState.matchEvents.push({
            quarter: AppState.liveQuarter,
            type: 'opponentGoal',
            scorer: null,
            assister: null,
        });
        recalcFromEvents();
        renderLiveRecorder();
        showToast('🔴 상대팀 득점');
    });

    // 기록 삭제
    container.querySelectorAll('.event-delete').forEach(btn => {
        btn.addEventListener('click', () => removeMatchEvent(parseInt(btn.dataset.idx, 10)));
    });

    // 기록 수정 시작 (인라인 폼 열기)
    container.querySelectorAll('.event-edit').forEach(btn => {
        btn.addEventListener('click', () => {
            AppState.editingEventIdx = parseInt(btn.dataset.idx, 10);
            renderLiveRecorder();
        });
    });

    // 기록 수정 취소
    container.querySelectorAll('.ev-edit-cancel').forEach(btn => {
        btn.addEventListener('click', () => {
            AppState.editingEventIdx = null;
            renderLiveRecorder();
        });
    });

    // 기록 수정 저장
    container.querySelectorAll('.ev-edit-save').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.idx, 10);
            const ev = AppState.matchEvents[idx];
            const form = btn.closest('.event-edit-form');
            if (!ev || !form) { AppState.editingEventIdx = null; renderLiveRecorder(); return; }

            const qSel = form.querySelector('.ev-edit-quarter');
            const newQuarter = qSel ? qSel.value : ev.quarter;

            if (ev.type === 'goal') {
                const scorer = form.querySelector('.ev-edit-scorer').value;
                if (!scorer) { showToast('득점자를 선택해주세요.', 'error'); return; }
                const assister = form.querySelector('.ev-edit-assister').value || null;
                if (assister && assister === scorer) {
                    showToast('득점자와 도움이 같을 수 없습니다.', 'error'); return;
                }
                ev.scorer = scorer;
                ev.assister = assister;
            }
            ev.quarter = newQuarter;

            AppState.editingEventIdx = null;
            AppState.liveQuarter = newQuarter; // 수정한 쿼터로 포커스 이동
            recalcFromEvents();
            renderLiveRecorder();
            showToast('기록을 수정했습니다. ✏️');
        });
    });
}

function removeMatchEvent(idx) {
    AppState.matchEvents.splice(idx, 1);
    // 삭제 시 인덱스가 밀리므로 수정 중 상태는 해제
    AppState.editingEventIdx = null;
    recalcFromEvents();
    renderLiveRecorder();
}

// ── 자동저장 ─────────────────────────────────────────────────────────────────
function startAutoSave() {
    stopAutoSave();
    AppState.autoSaveTimer = setInterval(async () => {
        if (!AppState.isEditor || AppState.attendees.length === 0) return;
        try {
            // 조용히 저장 (handleSave 로직 간소화)
            await handleSave(true, true); // isDraft=true, overwrite=true
            AppState.lastAutoSave = new Date();
            updateAutoSaveStatus();
        } catch (e) {
            console.error('자동저장 실패:', e);
        }
    }, 2 * 60 * 1000); // 2분
}

function stopAutoSave() {
    if (AppState.autoSaveTimer) {
        clearInterval(AppState.autoSaveTimer);
        AppState.autoSaveTimer = null;
    }
}

function updateAutoSaveStatus() {
    const el = document.getElementById('autosave-status');
    if (!el) return;
    if (AppState.lastAutoSave) {
        const t = AppState.lastAutoSave;
        const hh = String(t.getHours()).padStart(2, '0');
        const mm = String(t.getMinutes()).padStart(2, '0');
        el.textContent = `💾 자동저장: ${hh}:${mm} (2분 간격)`;
    } else {
        el.textContent = '💾 자동저장: 2분 간격으로 임시 저장됩니다';
    }
}

// ── Tab 1 이벤트 초기화 ────────────────────────────────────────────────────
function initTab1Events() {
    // 날짜/장소/상대팀 입력
    document.getElementById('match-date').addEventListener('change', e => {
        AppState.matchDate = e.target.value;
    });

    // 경기장 드롭다운
    const locSel = document.getElementById('match-location');
    locSel.addEventListener('change', e => {
        const val = e.target.value;
        if (val === '__custom__') {
            document.getElementById('venue-custom-row').style.display = 'flex';
            document.getElementById('venue-custom-input').focus();
        } else {
            document.getElementById('venue-custom-row').style.display = 'none';
            AppState.matchLocation = val;
        }
    });

    document.getElementById('venue-add-btn').addEventListener('click', () => {
        const inp = document.getElementById('venue-custom-input');
        const name = inp.value.trim();
        if (!name) return;
        saveCustomVenue(name);
        AppState.matchLocation = name;
        populateVenueSelect(name);
        document.getElementById('venue-custom-row').style.display = 'none';
        inp.value = '';
        showToast(`경기장 "${name}" 추가 완료!`);
    });
    document.getElementById('venue-custom-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') document.getElementById('venue-add-btn').click();
    });
    document.getElementById('match-opponent').addEventListener('input', e => {
        AppState.matchOpponent = e.target.value;
    });

    // 게스트 추가
    document.getElementById('add-guest-btn').addEventListener('click', () => {
        const inp = document.getElementById('guest-name-input');
        const name = inp.value.trim();
        if (!name) return;
        if (!AppState.roster[name]) {
            AppState.roster[name] = 'Guest';
            saveRoster().catch(() => { });
        }
        if (!AppState.attendees.includes(name)) {
            AppState.attendees.push(name);
            AppState.squadPlan[name] = { '1Q': false, '2Q': false, '3Q': false, '4Q': false };
        }
        inp.value = '';
        renderPlayerChecklist();
        renderSquadTable();
        renderPlaytimeStats();
        renderLiveRecorder();
        renderFormationBuilder();
        showToast(`${name} (용병) 추가 완료!`);
    });
    document.getElementById('guest-name-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') document.getElementById('add-guest-btn').click();
    });

    // 쿼터 선택
    document.getElementById('quarter-selector').addEventListener('click', e => {
        const btn = e.target.closest('.qbtn');
        if (!btn) return;
        AppState.currentQuarter = btn.dataset.q;
        document.querySelectorAll('.qbtn').forEach(b => b.classList.toggle('active', b.dataset.q === AppState.currentQuarter));
        // 포메이션 타입 셀렉트 동기화
        document.getElementById('formation-type-select').value = AppState.formationTypes[AppState.currentQuarter];
        renderFormationBuilder();
    });

    // 포메이션 타입 변경
    document.getElementById('formation-type-select').addEventListener('change', e => {
        const q = AppState.currentQuarter;
        const newType = e.target.value;
        AppState.formationTypes[q] = newType;
        // 해당 쿼터 배치·커스텀 좌표 초기화
        AppState.formationState[q] = {};
        AppState.formationSubs[q] = {};
        AppState.formationCoords[q] = {};
        renderFormationBuilder();
        renderFormationOverview();
    });

    // 포지션 위치 초기화 (커스텀 배치 → 포메이션 기본값)
    const resetBtn = document.getElementById('formation-reset-btn');
    if (resetBtn) resetBtn.addEventListener('click', () => {
        const q = AppState.currentQuarter;
        AppState.formationCoords[q] = {};
        renderFormationBuilder();
        renderFormationOverview();
        showToast(`${q} 포지션 위치를 기본 배치로 되돌렸습니다. ↺`);
    });

    // 포메이션 이미지 다운로드
    document.getElementById('export-formation-btn').addEventListener('click', exportCombinedFormation);

    // 임시 저장
    document.getElementById('draft-save-btn').addEventListener('click', () => handleSave(true));
    // 확정 저장
    document.getElementById('final-save-btn').addEventListener('click', () => handleSave(false));
    // 새 경기 (초기화)
    document.getElementById('new-match-btn').addEventListener('click', () => {
        if (confirm('현재 입력 내용을 초기화하고 새 경기를 시작하시겠습니까?')) {
            resetMatchState();
            const fp = document.getElementById('match-date')._flatpickr;
            if (fp) fp.setDate(today()); else document.getElementById('match-date').value = today();
            populateVenueSelect('잠실유수지');
            document.getElementById('venue-custom-row').style.display = 'none';
            document.getElementById('match-opponent').value = '상대팀';
            renderTab1();
            showToast('새 경기 준비 완료!');
        }
    });

    // 자동저장 시작
    startAutoSave();
    updateAutoSaveStatus();
}

// ── 저장 로직 ──────────────────────────────────────────────────────────────
async function handleSave(isDraft, overwrite = false) {
    if (!checkEditorAccess()) return;
    if (AppState.attendees.length === 0) {
        showToast('참석자를 선택해주세요.', 'error');
        return;
    }

    const matchId = `${AppState.matchDate}_${AppState.matchLocation}_${AppState.matchOpponent}`;
    const matchTitle = `${AppState.matchLocation} vs ${AppState.matchOpponent} (${AppState.matchDate})`;

    // 중복 체크
    if (!overwrite && AppState.editModeId !== matchId) {
        const dup = AppState.matches.find(m => m.id === matchId);
        if (dup) {
            AppState.dupConfirmId = matchId;
            AppState.dupConfirmAction = isDraft ? 'draft' : 'final';
            renderDuplicateWarning(matchTitle, isDraft);
            return;
        }
    }

    // 기존 같은 ID 삭제 (덮어쓰기 or 수정모드)
    if (overwrite || (AppState.editModeId && AppState.editModeId === matchId)) {
        AppState.matches = AppState.matches.filter(m => m.id !== matchId);
    } else if (AppState.editModeId) {
        AppState.matches = AppState.matches.filter(m => m.id !== AppState.editModeId);
    }

    // matchStats 배열 구성
    const statsRecords = AppState.attendees.map(name => {
        const s = AppState.matchStats[name] || { goals: 0, assists: 0 };
        return { 이름: name, 골: s.goals, 어시스트: s.assists };
    });

    // squadPlan 배열 구성
    const squadRecords = AppState.attendees.map(name => {
        const sp = AppState.squadPlan[name] || {};
        return { 이름: name, '1Q': sp['1Q'] || false, '2Q': sp['2Q'] || false, '3Q': sp['3Q'] || false, '4Q': sp['4Q'] || false };
    });

    const matchRecord = {
        id: matchId,
        date: AppState.matchDate,
        location: AppState.matchLocation,
        opponent: AppState.matchOpponent,
        title: matchTitle,
        attendees: [...AppState.attendees],
        scores: JSON.parse(JSON.stringify(AppState.quarterScores)),
        squad_plan: squadRecords,
        formation_types: { ...AppState.formationTypes },
        formation_plan: JSON.parse(JSON.stringify(AppState.formationState)),
        formation_subs: JSON.parse(JSON.stringify(AppState.formationSubs)),
        formation_coords: JSON.parse(JSON.stringify(AppState.formationCoords || {})),
        match_stats: statsRecords,
        match_events: JSON.parse(JSON.stringify(AppState.matchEvents || [])),
        is_draft: isDraft,
    };

    AppState.matches.push(matchRecord);

    try {
        await saveMatches();
        AppState.editModeId = null;
        hideDuplicateWarning();
        updateEditModeNotice();
        const action = isDraft ? '임시 저장' : '확정 저장';
        showToast(`${action} 완료! ✅`);
        if (!isDraft) {
            // 스코어 소결 표시
            const totUs = QUARTERS.reduce((a, q) => a + AppState.quarterScores[q][0], 0);
            const totThem = QUARTERS.reduce((a, q) => a + AppState.quarterScores[q][1], 0);
            showToast(`최종 스코어: 바르자 ${totUs} : ${totThem} 상대팀 🎉`, 'success');
        }
    } catch (e) {
        showToast('저장 실패: ' + e.message, 'error');
    }
}

function renderDuplicateWarning(matchTitle, isDraft) {
    const el = document.getElementById('duplicate-warning');
    if (!el) return;
    el.innerHTML = `
    <div class="dup-box">
      <p>⚠️ <strong>${escapeHtml(matchTitle)}</strong> 기록이 이미 존재합니다.</p>
      <div class="dup-actions">
        <button class="btn-overwrite" onclick="handleSave(${isDraft}, true)">
          덮어쓰기 (${isDraft ? '임시' : '확정'})
        </button>
        <button class="btn-cancel" onclick="hideDuplicateWarning()">취소</button>
      </div>
    </div>`;
    el.style.display = 'block';
}

function hideDuplicateWarning() {
    const el = document.getElementById('duplicate-warning');
    if (el) el.style.display = 'none';
    AppState.dupConfirmId = null;
}

// ── 기록에서 불러오기 (Tab3 → Tab1) ────────────────────────────────────────
function loadMatchToEditor(matchData) {
    if (!checkEditorAccess()) return;
    // 게스트 명단 통합
    matchData.attendees.forEach(name => {
        if (!AppState.roster[name]) AppState.roster[name] = 'Guest';
    });

    AppState.matchDate = matchData.date;
    AppState.matchLocation = matchData.location;
    AppState.matchOpponent = matchData.opponent;
    AppState.attendees = [...matchData.attendees];
    AppState.editModeId = matchData.id;

    // Squad plan
    AppState.squadPlan = {};
    (matchData.squad_plan || []).forEach(row => {
        AppState.squadPlan[row['이름']] = {
            '1Q': row['1Q'] || false, '2Q': row['2Q'] || false,
            '3Q': row['3Q'] || false, '4Q': row['4Q'] || false,
        };
    });

    const savedTypes = matchData.formation_types || {};
    AppState.formationTypes = {
        '1Q': savedTypes['1Q'] || '4-2-3-1',
        '2Q': savedTypes['2Q'] || '4-2-3-1',
        '3Q': savedTypes['3Q'] || '4-2-3-1',
        '4Q': savedTypes['4Q'] || '4-2-3-1',
    };
    const savedPlan = matchData.formation_plan || {};
    AppState.formationState = {
        '1Q': savedPlan['1Q'] || {},
        '2Q': savedPlan['2Q'] || {},
        '3Q': savedPlan['3Q'] || {},
        '4Q': savedPlan['4Q'] || {},
    };
    const savedSubs = matchData.formation_subs || {};
    AppState.formationSubs = {
        '1Q': savedSubs['1Q'] || {},
        '2Q': savedSubs['2Q'] || {},
        '3Q': savedSubs['3Q'] || {},
        '4Q': savedSubs['4Q'] || {},
    };
    const savedCoords = matchData.formation_coords || {};
    AppState.formationCoords = {
        '1Q': savedCoords['1Q'] || {},
        '2Q': savedCoords['2Q'] || {},
        '3Q': savedCoords['3Q'] || {},
        '4Q': savedCoords['4Q'] || {},
    };
    AppState.quarterScores = matchData.scores || { '1Q': [0, 0], '2Q': [0, 0], '3Q': [0, 0], '4Q': [0, 0] };

    AppState.matchStats = {};
    (matchData.match_stats || []).forEach(row => {
        AppState.matchStats[row['이름']] = { goals: row['골'] || 0, assists: row['어시스트'] || 0 };
    });

    // 이벤트 로그 복원
    AppState.matchEvents = matchData.match_events || [];
    AppState.editingEventIdx = null;

    // UI 동기화
    const fp = document.getElementById('match-date')._flatpickr;
    if (fp) fp.setDate(matchData.date); else document.getElementById('match-date').value = matchData.date;
    // 경기장이 기본/커스텀 목록에 없으면 추가
    saveCustomVenue(matchData.location);
    populateVenueSelect(matchData.location);
    AppState.matchLocation = matchData.location;
    document.getElementById('venue-custom-row').style.display = 'none';
    document.getElementById('match-opponent').value = matchData.opponent;
    document.getElementById('formation-type-select').value = AppState.formationTypes[AppState.currentQuarter];

    renderTab1();
    setTimeout(() => {
        switchTab('tab1');
        showToast(`"${matchData.title}" 불러오기 완료 ✏️`);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 0);
}

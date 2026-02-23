// =============================================
// FC 바르자 팀 매니저 - Tab 1: 당일 경기 운영
// =============================================

// ── Tab 1 전체 렌더링 ──────────────────────────────────────────────────────
function renderTab1() {
    renderPlayerChecklist();
    renderSquadTable();
    renderPlaytimeStats();
    renderScoreInputs();
    renderStatsTable();
    renderFormationBuilder();
    updateFormationPreview();
    updateEditModeNotice();
    renderFormationOverview();
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

        const positions = Object.keys(formation);
        const formationType = AppState.formationTypes[q] || '4-2-3-1';
        // 포지션별 y좌표 계산 (피치를 행으로 나눔)
        const rows = {
            GK: 0.88, LB: 0.72, RB: 0.72, LCB: 0.72, RCB: 0.72, CB: 0.72,
            LDM: 0.57, RDM: 0.57, CDM: 0.57,
            LM: 0.42, CM: 0.42, RM: 0.42, LW: 0.42, RW: 0.42, CAM: 0.42,
            ST: 0.15, CF: 0.15
        };
        const rowPlayers = {};
        positions.forEach(pos => {
            const player = formation[pos];
            if (!player) return;
            const yRatio = rows[pos] || 0.5;
            if (!rowPlayers[yRatio]) rowPlayers[yRatio] = [];
            rowPlayers[yRatio].push({ pos, player });
        });

        Object.entries(rowPlayers).forEach(([yRatio, items]) => {
            const y = H * parseFloat(yRatio);
            items.forEach((item, i) => {
                const x = W * (i + 1) / (items.length + 1);
                // 점
                ctx.beginPath();
                ctx.arc(x, y, W * 0.038, 0, Math.PI * 2);
                ctx.fillStyle = '#8C1C2B';
                ctx.fill();
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1;
                ctx.stroke();
                // 이름 (앞 2글자)
                ctx.fillStyle = '#fff';
                ctx.font = `bold ${W * 0.055}px Pretendard, sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                const name = (item.player || '').slice(0, 2);
                ctx.fillText(name, x, y + W * 0.045);
            });
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
        return `
      <label class="player-check-item ${isGuest ? 'is-guest' : ''}">
        <input type="checkbox" class="player-cb" data-name="${name}" ${checked}>
        <span>${name}${isGuest ? ' <em>(용병)</em>' : ''}</span>
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
            renderStatsTable();
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
        const qCells = QUARTERS.map(q => {
            const checked = sp[q] ? 'checked' : '';
            return `<td><input type="checkbox" class="squad-cb" data-name="${name}" data-q="${q}" ${checked}></td>`;
        }).join('');
        const participation = getParticipation(name);
        return `<tr>
      <td class="squad-name">${formatPlayerName(name)}</td>
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

// ── 포메이션 빌더 ──────────────────────────────────────────────────────────
function renderFormationBuilder() {
    const container = document.getElementById('formation-builder');
    if (!container) return;

    const q = AppState.currentQuarter;
    const fType = AppState.formationTypes[q];
    const fDef = FORMATION_POSITIONS[fType];
    const fMap = AppState.formationState[q];
    const fSubs = AppState.formationSubs[q];

    // 이미 배정된 선수 목록 (포지션별)
    const assignedMain = new Set();
    const assignedSub = new Set();
    for (const [pos, player] of Object.entries(fMap)) {
        if (player && player !== '-') assignedMain.add(player);
        const sub = fSubs[pos];
        if (sub && sub !== '-') assignedSub.add(sub);
    }

    function buildOptions(pos, type) {
        const current = type === 'main' ? (fMap[pos] || '-') : (fSubs[pos] || '-');

        // 현재 포지션을 제외하고 배치된 선수 집합 계산
        // → 같은 포지션의 현재 선수는 블록하지 않아야 드롭다운에 표시됨
        const assignedMainOther = new Set();
        const assignedSubOther = new Set();
        for (const [p, player] of Object.entries(fMap)) {
            if (p === pos) continue; // 현재 포지션 제외
            if (player && player !== '-') assignedMainOther.add(player);
            const sub = fSubs[p];
            if (sub && sub !== '-') assignedSubOther.add(sub);
        }

        const pool = AppState.attendees;
        const participation = {};
        pool.forEach(n => participation[n] = getParticipation(n));

        const opts = pool.filter(n => {
            if (n === current) return true;
            if (type === 'main') return !assignedMainOther.has(n) && !assignedSubOther.has(n);
            // 교체 슬롯: 같은 포지션 main에 배치된 선수도 제외
            return !assignedMainOther.has(n) && !assignedSubOther.has(n) && n !== (fMap[pos] || '');
        });

        const optionHtml = opts.map(n => {
            const qCnt = participation[n] || 0;
            const role = AppState.roster[n] === 'Guest' ? ' (용병)' : '';
            const label = type === 'main'
                ? `${n}${role} (${qCnt % 1 === 0 ? qCnt : qCnt.toFixed(1)}Q)`
                : `🔄 ${n}${role} (${qCnt % 1 === 0 ? qCnt : qCnt.toFixed(1)}Q)`;
            return `<option value="${n}" ${n === current ? 'selected' : ''}>${label}</option>`;
        }).join('');

        const noneLabel = type === 'main' ? '- 없음 -' : '🔄 교체없음';
        return `<option value="-" ${current === '-' ? 'selected' : ''}>${noneLabel}</option>${optionHtml}`;
    }

    function buildPosCell(pos) {
        const label = (POSITION_DISPLAY_LABELS[fType] || {})[pos] || pos;
        return `
      <div class="pos-cell" data-pos="${pos}">
        <div class="pos-label">${label}</div>
        <select class="pos-main-sel" data-pos="${pos}">${buildOptions(pos, 'main')}</select>
        <select class="pos-sub-sel" data-pos="${pos}">${buildOptions(pos, 'sub')}</select>
      </div>`;
    }

    const rowsHtml = fDef.rows.map(row => `
    <div class="formation-row row-${row.key}">
      ${row.positions.map(pos => buildPosCell(pos)).join('')}
    </div>`).join('');

    container.innerHTML = rowsHtml;

    // 이벤트 핸들러
    container.querySelectorAll('.pos-main-sel').forEach(sel => {
        sel.addEventListener('change', () => {
            const pos = sel.dataset.pos;
            const val = sel.value;
            AppState.formationState[q][pos] = val;
            // 해당 선수 squadron 자동 체크
            if (val !== '-') {
                if (!AppState.squadPlan[val]) AppState.squadPlan[val] = {};
                AppState.squadPlan[val][q] = true;
            }
            renderFormationBuilder();
            renderSquadTable();
            renderPlaytimeStats();
            updateFormationPreview();
            renderFormationOverview();
        });
    });

    container.querySelectorAll('.pos-sub-sel').forEach(sel => {
        sel.addEventListener('change', () => {
            const pos = sel.dataset.pos;
            const val = sel.value;
            AppState.formationSubs[q][pos] = val;
            if (val !== '-') {
                if (!AppState.squadPlan[val]) AppState.squadPlan[val] = {};
                AppState.squadPlan[val][q] = true;
            }
            renderFormationBuilder();
            renderSquadTable();
            renderPlaytimeStats();
            updateFormationPreview();
            renderFormationOverview();
        });
    });
}

// ── 스코어 입력 ─────────────────────────────────────────────────────────────
function renderScoreInputs() {
    const container = document.getElementById('scores-section');
    if (!container) return;
    container.innerHTML = QUARTERS.map(q => {
        const [us, them] = AppState.quarterScores[q];
        return `
      <div class="score-row">
        <span class="q-label">${q}</span>
        <div class="score-inputs">
          <span class="team-label">🔵 바르자</span>
          <input type="number" class="score-input" data-q="${q}" data-side="us" min="0" value="${us}">
          <span class="score-sep">:</span>
          <input type="number" class="score-input" data-q="${q}" data-side="them" min="0" value="${them}">
          <span class="team-label">🔴 상대팀</span>
        </div>
      </div>`;
    }).join('');

    container.querySelectorAll('.score-input').forEach(inp => {
        inp.addEventListener('change', () => {
            const q = inp.dataset.q;
            const side = inp.dataset.side;
            const val = parseInt(inp.value) || 0;
            if (side === 'us') AppState.quarterScores[q][0] = val;
            else AppState.quarterScores[q][1] = val;
        });
    });
}

// ── 개인 스탯 테이블 ────────────────────────────────────────────────────────
function renderStatsTable() {
    const container = document.getElementById('stats-section');
    if (!container || AppState.attendees.length === 0) {
        if (container) container.innerHTML = '<p class="empty-hint">참석자를 선택하면 스탯 입력이 활성화됩니다.</p>';
        return;
    }
    const rows = AppState.attendees.map(name => {
        const s = AppState.matchStats[name] || { goals: 0, assists: 0 };
        return `
      <tr>
        <td>${formatPlayerName(name)}</td>
        <td><input type="number" class="stat-input" data-name="${name}" data-field="goals" min="0" value="${s.goals}"></td>
        <td><input type="number" class="stat-input" data-name="${name}" data-field="assists" min="0" value="${s.assists}"></td>
      </tr>`;
    }).join('');

    container.innerHTML = `
    <table class="stats-table">
      <thead><tr><th>이름</th><th>⚽ 골</th><th>👟 어시스트</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;

    container.querySelectorAll('.stat-input').forEach(inp => {
        inp.addEventListener('change', () => {
            const name = inp.dataset.name;
            const field = inp.dataset.field;
            if (!AppState.matchStats[name]) AppState.matchStats[name] = { goals: 0, assists: 0 };
            AppState.matchStats[name][field] = parseInt(inp.value) || 0;
        });
    });
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
        renderStatsTable();
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
        updateFormationPreview();
    });

    // 포메이션 타입 변경
    document.getElementById('formation-type-select').addEventListener('change', e => {
        const q = AppState.currentQuarter;
        const newType = e.target.value;
        AppState.formationTypes[q] = newType;
        // 해당 쿼터 배치 초기화
        AppState.formationState[q] = {};
        AppState.formationSubs[q] = {};
        renderFormationBuilder();
        updateFormationPreview();
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
}

// ── 저장 로직 ──────────────────────────────────────────────────────────────
async function handleSave(isDraft, overwrite = false) {
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
        match_stats: statsRecords,
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
      <p>⚠️ <strong>${matchTitle}</strong> 기록이 이미 존재합니다.</p>
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
    AppState.quarterScores = matchData.scores || { '1Q': [0, 0], '2Q': [0, 0], '3Q': [0, 0], '4Q': [0, 0] };

    AppState.matchStats = {};
    (matchData.match_stats || []).forEach(row => {
        AppState.matchStats[row['이름']] = { goals: row['골'] || 0, assists: row['어시스트'] || 0 };
    });

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

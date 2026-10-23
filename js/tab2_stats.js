// =============================================
// FC 바르자 팀 매니저 - Tab 2: 시즌 통계 (대시보드 지표 + 시즌 필터 + 선수별 상세)
// =============================================
//
//  참석      = attendees 에 포함된 경기 수          출전(참여횟수) = 실 참여 쿼터 > 0 인 경기 수
//  총 쿼터   = 실 참여 쿼터 합 (교체 0.5)            평균 쿼터      = 총 쿼터 ÷ 출전 경기
//  골/어시   = 경기별 stats 합                        공격P          = 골 + 어시
//  팀        = 승/무/패, 승률, 득실, 쿼터별 득/실점   경기 평균쿼터  = 경기별 AVERAGEIF(>0) 의 평균

const STATS_COLUMNS = [
    { key: 'name', label: '이름', text: true },
    { key: 'attended', label: '참석' },
    { key: 'matches', label: '출전' },
    { key: 'quarters', label: '총 쿼터', fmt: v => fmtQ(v) },
    { key: 'avgQ', label: '평균 Q', fmt: v => fmtQ(v) },
    { key: 'goals', label: '골' },
    { key: 'assists', label: '도움' },
    { key: 'attackPoints', label: '공격P' },
    { key: 'subCount', label: '교체' },
];

function statsFilter() {
    if (!AppState.statsFilter) AppState.statsFilter = { year: 'all', includeIntra: false, status: 'final' };
    return AppState.statsFilter;
}

function statsYears() {
    const years = new Set(AppState.matches.map(m => String(m.date || '').slice(0, 4)).filter(Boolean));
    return [...years].sort().reverse();
}

function seasonMatches() {
    const f = statsFilter();
    return AppState.matches.filter(m =>
        (f.status === 'all' || m.status === 'final')
        && (f.includeIntra || (m.type || 'match') === 'match')
        && (f.year === 'all' || String(m.date || '').startsWith(f.year))
    ).sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function matchResult(m) {
    const scores = m.scores || {};
    let u = 0, t = 0;
    Object.values(scores).forEach(s => { u += (s && s[0]) || 0; t += (s && s[1]) || 0; });
    const known = m.scoresKnown !== false;
    return { u, t, known, key: !known ? 'unknown' : u > t ? 'win' : u < t ? 'loss' : 'draw' };
}

function aggregateSeason(matches) {
    const agg = {};
    const get = n => (agg[n] = agg[n] || {
        name: n, attended: 0, matches: 0, quarters: 0, goals: 0, assists: 0, subCount: 0,
        positions: {}, perMatch: [],
    });
    let win = 0, draw = 0, loss = 0, gf = 0, ga = 0;
    const byQuarter = {};
    const avgList = [];
    const results = [];

    matches.forEach(m => {
        const qs = recordQuarters(m);
        const part = Quota.computeParticipation(m.quarters || {}, qs);
        const res = matchResult(m);
        const played = Object.entries(part).filter(([, r]) => r.credit > 0);
        if (played.length) avgList.push(played.reduce((s, [, r]) => s + r.credit, 0) / played.length);

        const names = new Set([...(m.attendees || []), ...Object.keys(part), ...Object.keys(m.stats || {})]);
        names.forEach(n => {
            const a = get(n);
            const r = part[n];
            const st = (m.stats && m.stats[n]) || { goals: 0, assists: 0 };
            const positions = [];
            qs.forEach(q => {
                const lineup = ((m.quarters || {})[q] || {}).lineup || {};
                Object.entries(lineup).forEach(([pos, who]) => { if (who === n) positions.push(pos); });
            });
            if ((m.attendees || []).includes(n) || (r && r.credit > 0)) a.attended += 1;
            if (r && r.credit > 0) { a.matches += 1; a.quarters += r.credit; a.subCount += r.subCount; }
            a.goals += st.goals || 0;
            a.assists += st.assists || 0;
            positions.forEach(p => { a.positions[p] = (a.positions[p] || 0) + 1; });
            a.perMatch.push({
                id: m.id, date: m.date, opponent: m.opponent, type: m.type, result: res,
                credit: r ? r.credit : 0, subCount: r ? r.subCount : 0, goals: st.goals || 0, assists: st.assists || 0,
                positions,
            });
        });

        Object.entries(m.scores || {}).forEach(([q, s]) => {
            const [a, b] = s || [0, 0];
            byQuarter[q] = byQuarter[q] || [0, 0];
            byQuarter[q][0] += a; byQuarter[q][1] += b;
        });
        gf += res.u; ga += res.t;
        if (res.known) { if (res.key === 'win') win++; else if (res.key === 'loss') loss++; else draw++; }
        results.push({ id: m.id, date: m.date, opponent: m.opponent, venue: m.venue, type: m.type, ...res, attendees: (m.attendees || []).length });
    });

    const players = Object.values(agg).map(p => ({
        ...p, attackPoints: p.goals + p.assists, avgQ: p.matches ? p.quarters / p.matches : 0,
    }));
    return {
        players, win, draw, loss, gf, ga, byQuarter, results,
        avgQuarter: avgList.length ? avgList.reduce((a, b) => a + b, 0) / avgList.length : 0,
    };
}

// ── 렌더링 ───────────────────────────────────────────────────────────────────
function renderStatsTab() {
    const container = document.getElementById('tab2-content');
    if (!container) return;
    const f = statsFilter();
    const years = statsYears();
    const matches = seasonMatches();

    const filterBar = `
    <div class="stats-filter">
      <label>시즌
        <select id="stats-year">
          <option value="all" ${f.year === 'all' ? 'selected' : ''}>전체</option>
          ${years.map(y => `<option value="${y}" ${f.year === y ? 'selected' : ''}>${y}</option>`).join('')}
        </select>
      </label>
      <label class="stats-check"><input type="checkbox" id="stats-intra" ${f.includeIntra ? 'checked' : ''}> 자체전 포함</label>
      <label class="stats-check"><input type="checkbox" id="stats-draft" ${f.status === 'all' ? 'checked' : ''}> 임시 저장 포함</label>
      <span class="hint-text">${matches.length}경기 집계</span>
    </div>`;

    if (matches.length === 0) {
        container.innerHTML = filterBar + `
      <div class="empty-state">
        <p>📭 조건에 맞는 경기 기록이 없습니다.</p>
        <p>경기를 "확정 저장"하면 여기에 통계가 집계됩니다.</p>
      </div>`;
        bindStatsFilter();
        return;
    }

    const s = aggregateSeason(matches);
    const players = s.players;
    const by = (key) => [...players].sort((a, b) => b[key] - a[key] || b.quarters - a.quarters || a.name.localeCompare(b.name, 'ko')).slice(0, 10);
    const quarterKeys = Object.keys(s.byQuarter).sort((a, b) => parseInt(a) - parseInt(b));
    const total = s.win + s.draw + s.loss;

    // 최근 전적 스트립 (최신이 오른쪽)
    const form = s.results.slice(-12).map(r => {
        const cls = r.key === 'unknown' ? 'draw' : r.key;
        const label = r.key === 'win' ? '승' : r.key === 'loss' ? '패' : r.key === 'draw' ? '무' : '?';
        return `<button type="button" class="form-chip ${cls}" data-id="${escapeHtml(r.id)}" title="${escapeHtml(r.date)} vs ${escapeHtml(r.opponent)} ${r.u}:${r.t}">
          <span class="form-res">${label}</span><span class="form-score">${r.u}:${r.t}</span><span class="form-date">${escapeHtml(String(r.date).slice(5))}</span>
        </button>`;
    }).join('');

    const sort = AppState.statsSort || { key: 'quarters', dir: -1 };
    const sorted = [...players].sort((a, b) => {
        const col = STATS_COLUMNS.find(c => c.key === sort.key) || STATS_COLUMNS[3];
        const va = a[col.key], vb = b[col.key];
        const cmp = col.text ? String(va).localeCompare(String(vb), 'ko') : (va - vb);
        return cmp ? cmp * sort.dir : (b.quarters - a.quarters || a.name.localeCompare(b.name, 'ko'));
    });
    const headerCells = STATS_COLUMNS.map(c => {
        const active = sort.key === c.key;
        return `<th class="sortable ${active ? 'active' : ''}" data-key="${c.key}">${c.label}${active ? (sort.dir < 0 ? ' ▾' : ' ▴') : ''}</th>`;
    }).join('');
    const fullRows = sorted.map((p, i) => `<tr>
        <td class="rank-cell">${i + 1}</td>
        ${STATS_COLUMNS.map(c => c.text
            ? `<td class="name-cell"><button type="button" class="player-link" data-name="${escapeHtml(p.name)}">${escapeHtml(formatPlayerName(p.name))}</button></td>`
            : `<td class="num-cell">${c.fmt ? c.fmt(p[c.key]) : p[c.key]}</td>`).join('')}
      </tr>`).join('');

    container.innerHTML = filterBar + `
    <div class="stats-summary-bar">
      <div class="summary-item"><span class="summary-num">${matches.length}</span><span class="summary-label">경기</span></div>
      <div class="summary-item"><span class="summary-num">${s.win}승 ${s.draw}무 ${s.loss}패</span><span class="summary-label">승률 ${total ? Math.round(s.win / total * 100) : 0}%</span></div>
      <div class="summary-item"><span class="summary-num">${s.gf} : ${s.ga}</span><span class="summary-label">득실 ${s.gf - s.ga >= 0 ? '+' : ''}${s.gf - s.ga}</span></div>
      <div class="summary-item"><span class="summary-num">${s.avgQuarter.toFixed(2)}</span><span class="summary-label">경기 평균 쿼터</span></div>
      <div class="summary-item"><span class="summary-num">${players.length}</span><span class="summary-label">선수</span></div>
    </div>

    <div class="leaderboard-card form-card">
      <h3>📅 최근 전적 <small class="hint-text">누르면 기록으로 이동</small></h3>
      <div class="form-strip">${form}</div>
    </div>

    <div class="leaderboard-grid">
      <div class="leaderboard-card">
        <h3>⚽ 득점 Top 10</h3>
        ${buildLeaderboardTable(by('goals'), [{ key: 'goals', label: '골' }, { key: 'matches', label: '출전' }])}
      </div>
      <div class="leaderboard-card">
        <h3>👟 도움 Top 10</h3>
        ${buildLeaderboardTable(by('assists'), [{ key: 'assists', label: '도움' }, { key: 'matches', label: '출전' }])}
      </div>
      <div class="leaderboard-card">
        <h3>🔥 공격포인트 Top 10</h3>
        ${buildLeaderboardTable(by('attackPoints'), [{ key: 'attackPoints', label: '공격P' }, { key: 'goals', label: '골' }, { key: 'assists', label: '도움' }])}
      </div>
      <div class="leaderboard-card">
        <h3>🏃 출전 Top 10</h3>
        ${buildLeaderboardTable(by('quarters'), [{ key: 'matches', label: '출전' }, { key: 'quarters', label: '총 쿼터', fmt: fmtQ }, { key: 'avgQ', label: '평균', fmt: fmtQ }])}
      </div>
    </div>

    <div class="leaderboard-card" style="margin-top:0.75rem">
      <h3>🏟️ 쿼터별 득·실점</h3>
      <table class="leaderboard-table">
        <thead><tr><th>쿼터</th><th>득점</th><th>실점</th><th>득실</th></tr></thead>
        <tbody>${quarterKeys.map(q => { const [a, b] = s.byQuarter[q]; return `<tr><td class="name-cell">${q}</td><td class="num-cell">${a}</td><td class="num-cell">${b}</td><td class="num-cell ${a - b > 0 ? 'pos' : a - b < 0 ? 'neg' : ''}">${a - b > 0 ? '+' : ''}${a - b}</td></tr>`; }).join('')}</tbody>
      </table>
    </div>

    <div class="leaderboard-card" style="margin-top:0.75rem">
      <h3>👥 전체 선수 기록 <small class="hint-text">열 제목을 눌러 정렬 · 이름을 누르면 상세</small></h3>
      <div class="table-scroll">
        <table class="leaderboard-table full-stats">
          <thead><tr><th>#</th>${headerCells}</tr></thead>
          <tbody>${fullRows}</tbody>
        </table>
      </div>
    </div>

    <div class="export-row">
      <button class="btn-secondary" id="stats-export-btn">📥 CSV 다운로드 (현재 필터)</button>
    </div>`;

    bindStatsFilter();
    container.querySelectorAll('.form-chip').forEach(btn => btn.addEventListener('click', () => {
        switchTab('tab3');
        renderHistoryTab(btn.dataset.id);
    }));
    container.querySelectorAll('th.sortable').forEach(th => th.addEventListener('click', () => {
        const key = th.dataset.key;
        const cur = AppState.statsSort || { key: 'quarters', dir: -1 };
        AppState.statsSort = { key, dir: cur.key === key ? -cur.dir : (key === 'name' ? 1 : -1) };
        renderStatsTab();
    }));
    container.querySelectorAll('.player-link').forEach(btn => btn.addEventListener('click', () => openPlayerDetail(btn.dataset.name, s)));
    const exp = document.getElementById('stats-export-btn');
    if (exp) exp.addEventListener('click', exportSeasonCsv);
}

function bindStatsFilter() {
    const f = statsFilter();
    const y = document.getElementById('stats-year');
    if (y) y.addEventListener('change', () => { f.year = y.value; renderStatsTab(); });
    const i = document.getElementById('stats-intra');
    if (i) i.addEventListener('change', () => { f.includeIntra = i.checked; renderStatsTab(); });
    const d = document.getElementById('stats-draft');
    if (d) d.addEventListener('change', () => { f.status = d.checked ? 'all' : 'final'; renderStatsTab(); });
}

function buildLeaderboardTable(players, columns) {
    if (players.length === 0) return '<p class="empty-hint">데이터 없음</p>';
    const headers = ['순위', '이름', ...columns.map(c => c.label)].map(h => `<th>${h}</th>`).join('');
    const rows = players.map((p, i) => {
        const cells = [`<td class="rank-cell">${i + 1}</td>`,
            `<td class="name-cell"><button type="button" class="player-link" data-name="${escapeHtml(p.name)}">${escapeHtml(formatPlayerName(p.name))}</button></td>`,
            ...columns.map(c => `<td class="num-cell">${c.fmt ? c.fmt(p[c.key]) : p[c.key]}</td>`)].join('');
        return `<tr class="${i < 3 ? 'top-' + (i + 1) : ''}">${cells}</tr>`;
    }).join('');
    return `<table class="leaderboard-table"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
}

// ── 선수별 상세 (시트) ─────────────────────────────────────────────────────
function openPlayerDetail(name, season) {
    const sheet = document.getElementById('pick-sheet');
    const body = document.getElementById('pick-sheet-body');
    if (!sheet || !body) return;
    const p = season.players.find(x => x.name === name);
    if (!p) return;
    const player = getPlayer(name) || {};
    const posEntries = Object.entries(p.positions).sort((a, b) => b[1] - a[1]);
    const posTotal = posEntries.reduce((s, [, n]) => s + n, 0);
    const posHtml = posEntries.length
        ? posEntries.slice(0, 6).map(([pos, n]) => `<span class="pos-chip">${escapeHtml(pos)} <em>${n}</em><i style="width:${Math.round(n / posTotal * 100)}%"></i></span>`).join('')
        : '<span class="empty-hint">라인업 기록 없음</span>';
    const rows = [...p.perMatch].sort((a, b) => String(b.date).localeCompare(String(a.date))).map(m => {
        const res = m.result.key === 'unknown' ? '-' : { win: '승', draw: '무', loss: '패' }[m.result.key];
        const resCls = m.result.key === 'unknown' ? '' : m.result.key;
        const qBar = `<span class="q-bar"><i style="width:${Math.min(100, m.credit / 5 * 100)}%"></i></span>`;
        return `<tr class="${m.credit === 0 ? 'stat-dim' : ''}">
          <td><button type="button" class="player-link" data-match="${escapeHtml(m.id)}">${escapeHtml(String(m.date).slice(2))}</button></td>
          <td class="opp-cell">${escapeHtml(m.opponent || '')}${m.type === 'intra' ? ' <small>자체</small>' : ''}</td>
          <td class="num-cell res-${resCls}">${res} <small>${m.result.u}:${m.result.t}</small></td>
          <td class="num-cell">${fmtQ(m.credit)}${m.subCount ? '<small>⇄</small>' : ''} ${qBar}</td>
          <td class="num-cell">${m.goals || ''}</td>
          <td class="num-cell">${m.assists || ''}</td>
          <td class="pos-cell-text">${m.positions.map(escapeHtml).join(' ') || '-'}</td>
        </tr>`;
    }).join('');

    body.innerHTML = `
      <div class="pick-head">
        <span class="pick-title">${escapeHtml(formatPlayerName(name))}${player.fullName && player.fullName !== name ? ` <small>${escapeHtml(player.fullName)}</small>` : ''}${player.jerseyNo != null ? ` <small>#${player.jerseyNo}</small>` : ''}</span>
        <button type="button" class="pick-close" data-close="1" aria-label="닫기">✕</button>
      </div>
      <div class="hint-text" style="margin-bottom:0.5rem">선호 포지션: ${(player.positions || []).join(', ') || '-'}</div>
      <div class="stats-summary-bar compact">
        <div class="summary-item"><span class="summary-num">${p.attended}</span><span class="summary-label">참석</span></div>
        <div class="summary-item"><span class="summary-num">${p.matches}</span><span class="summary-label">출전</span></div>
        <div class="summary-item"><span class="summary-num">${fmtQ(p.quarters)}</span><span class="summary-label">총 쿼터</span></div>
        <div class="summary-item"><span class="summary-num">${fmtQ(p.avgQ)}</span><span class="summary-label">평균 쿼터</span></div>
        <div class="summary-item"><span class="summary-num">${p.goals}</span><span class="summary-label">골</span></div>
        <div class="summary-item"><span class="summary-num">${p.assists}</span><span class="summary-label">도움</span></div>
        <div class="summary-item"><span class="summary-num">${p.subCount}</span><span class="summary-label">교체 관여</span></div>
      </div>
      <div class="pick-section"><div class="pick-section-title">실제 뛴 포지션 <small>쿼터 수</small></div><div class="pos-chips">${posHtml}</div></div>
      <div class="pick-section"><div class="pick-section-title">경기별 기록 <small>날짜를 누르면 기록 탭</small></div>
        <div class="table-scroll">
          <table class="leaderboard-table player-matches">
            <thead><tr><th>날짜</th><th>상대</th><th>결과</th><th>쿼터</th><th>골</th><th>도움</th><th>포지션</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="7" class="empty-hint">기록 없음</td></tr>'}</tbody>
          </table>
        </div>
      </div>
      <div class="pick-actions"><button type="button" class="btn-secondary" data-close="1">닫기</button></div>`;
    sheet.hidden = false;
    document.body.classList.add('sheet-open');
    const close = () => { sheet.hidden = true; document.body.classList.remove('sheet-open'); };
    sheet.querySelectorAll('[data-close]').forEach(el => { el.onclick = close; });
    body.querySelectorAll('[data-match]').forEach(btn => btn.addEventListener('click', () => {
        close();
        switchTab('tab3');
        renderHistoryTab(btn.dataset.match);
    }));
}

function exportSeasonCsv() {
    const s = aggregateSeason(seasonMatches());
    const rows = [['이름', '참석', '출전', '총 쿼터', '평균 쿼터', '골', '어시스트', '공격포인트', '교체 관여']];
    [...s.players].sort((a, b) => b.quarters - a.quarters).forEach(p => {
        rows.push([p.name, p.attended, p.matches, p.quarters, p.avgQ.toFixed(2), p.goals, p.assists, p.attackPoints, p.subCount]);
    });
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const f = statsFilter();
    a.download = `fc_barza_stats_${f.year === 'all' ? 'all' : f.year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

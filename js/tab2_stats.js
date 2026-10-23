// =============================================
// FC 바르자 팀 매니저 - Tab 2: 시즌 통계 (대시보드 지표와 동일 기준)
// =============================================
//
//  참여횟수 = 실 참여 쿼터 > 0 인 경기 수      총 쿼터 = 실 참여 쿼터 합 (교체 0.5)
//  골/어시  = 경기별 stats 합                   공격P   = 골 + 어시
//  팀       = 승/무/패, 승률, 쿼터별 득/실점    평균쿼터 = 경기별 평균쿼터의 평균

function seasonMatches() {
    // 확정 + 정식 경기만 (자체전 제외)
    return AppState.matches.filter(m => m.status === 'final' && (m.type || 'match') === 'match');
}

function aggregateSeason(matches) {
    const agg = {};
    const get = n => (agg[n] = agg[n] || { name: n, matches: 0, quarters: 0, goals: 0, assists: 0 });
    let win = 0, draw = 0, loss = 0, gf = 0, ga = 0;
    const byQuarter = {};
    const avgList = [];
    matches.forEach(m => {
        const credits = recordParticipation(m);
        const played = Object.entries(credits).filter(([, c]) => c > 0);
        played.forEach(([n, c]) => { const a = get(n); a.matches += 1; a.quarters += c; });
        if (played.length) avgList.push(played.reduce((s, [, c]) => s + c, 0) / played.length);
        Object.entries(m.stats || {}).forEach(([n, s]) => {
            const a = get(n); a.goals += s.goals || 0; a.assists += s.assists || 0;
        });
        let u = 0, t = 0;
        Object.entries(m.scores || {}).forEach(([q, s]) => {
            const [a, b] = s || [0, 0];
            u += a; t += b;
            byQuarter[q] = byQuarter[q] || [0, 0];
            byQuarter[q][0] += a; byQuarter[q][1] += b;
        });
        gf += u; ga += t;
        if (m.scoresKnown !== false) {
            if (u > t) win++; else if (u < t) loss++; else draw++;
        }
    });
    const players = Object.values(agg).map(p => ({ ...p, attackPoints: p.goals + p.assists }));
    return {
        players, win, draw, loss, gf, ga, byQuarter,
        avgQuarter: avgList.length ? avgList.reduce((a, b) => a + b, 0) / avgList.length : 0,
    };
}

function renderStatsTab() {
    const container = document.getElementById('tab2-content');
    if (!container) return;

    const matches = seasonMatches();
    if (matches.length === 0) {
        container.innerHTML = `
      <div class="empty-state">
        <p>📭 확정 저장된 경기 기록이 없습니다.</p>
        <p>경기를 "확정 저장"하면 여기에 통계가 집계됩니다.</p>
      </div>`;
        return;
    }

    const s = aggregateSeason(matches);
    const players = s.players;
    const by = (key) => [...players].sort((a, b) => b[key] - a[key] || b.quarters - a.quarters || a.name.localeCompare(b.name, 'ko')).slice(0, 10);
    const quarterKeys = Object.keys(s.byQuarter).sort((a, b) => parseInt(a) - parseInt(b));
    const total = s.win + s.draw + s.loss;

    container.innerHTML = `
    <div class="stats-summary-bar">
      <div class="summary-item"><span class="summary-num">${matches.length}</span><span class="summary-label">경기</span></div>
      <div class="summary-item"><span class="summary-num">${s.win}승 ${s.draw}무 ${s.loss}패</span><span class="summary-label">승률 ${total ? Math.round(s.win / total * 100) : 0}%</span></div>
      <div class="summary-item"><span class="summary-num">${s.gf}</span><span class="summary-label">득점</span></div>
      <div class="summary-item"><span class="summary-num">${s.ga}</span><span class="summary-label">실점</span></div>
      <div class="summary-item"><span class="summary-num">${s.avgQuarter.toFixed(2)}</span><span class="summary-label">평균 쿼터</span></div>
      <div class="summary-item"><span class="summary-num">${players.length}</span><span class="summary-label">선수</span></div>
    </div>

    <div class="leaderboard-grid">
      <div class="leaderboard-card">
        <h3>⚽ 득점 Top 10</h3>
        ${buildLeaderboardTable(by('goals'), [{ key: 'goals', label: '⚽ 골' }, { key: 'matches', label: '경기' }])}
      </div>
      <div class="leaderboard-card">
        <h3>👟 도움 Top 10</h3>
        ${buildLeaderboardTable(by('assists'), [{ key: 'assists', label: '👟 도움' }, { key: 'matches', label: '경기' }])}
      </div>
      <div class="leaderboard-card">
        <h3>🔥 공격포인트 Top 10</h3>
        ${buildLeaderboardTable(by('attackPoints'), [{ key: 'attackPoints', label: '🔥 공격P' }, { key: 'goals', label: '골' }, { key: 'assists', label: '도움' }])}
      </div>
      <div class="leaderboard-card">
        <h3>📅 출석 Top 10</h3>
        ${buildLeaderboardTable(by('matches'), [{ key: 'matches', label: '경기' }, { key: 'quarters', label: '총 쿼터', fmt: fmtQ }])}
      </div>
    </div>

    <div class="leaderboard-card" style="margin-top:0.75rem">
      <h3>🏟️ 쿼터별 득·실점</h3>
      <table class="leaderboard-table">
        <thead><tr><th>쿼터</th><th>득점</th><th>실점</th></tr></thead>
        <tbody>${quarterKeys.map(q => `<tr><td class="name-cell">${q}</td><td class="num-cell">${s.byQuarter[q][0]}</td><td class="num-cell">${s.byQuarter[q][1]}</td></tr>`).join('')}</tbody>
      </table>
    </div>

    <div class="leaderboard-card" style="margin-top:0.75rem">
      <h3>👥 전체 선수 기록</h3>
      ${buildLeaderboardTable([...players].sort((a, b) => b.quarters - a.quarters || a.name.localeCompare(b.name, 'ko')), [
        { key: 'matches', label: '경기' }, { key: 'quarters', label: '총 쿼터', fmt: fmtQ },
        { key: 'goals', label: '골' }, { key: 'assists', label: '도움' }, { key: 'attackPoints', label: '공격P' },
    ])}
    </div>

    <div class="export-row">
      <button class="btn-secondary" onclick="exportSeasonCsv()">📥 시즌 데이터 CSV 다운로드</button>
    </div>`;
}

function buildLeaderboardTable(players, columns) {
    if (players.length === 0) return '<p class="empty-hint">데이터 없음</p>';
    const headers = ['순위', '이름', ...columns.map(c => c.label)].map(h => `<th>${h}</th>`).join('');
    const rows = players.map((p, i) => {
        const cells = [`<td class="rank-cell">${i + 1}</td>`, `<td class="name-cell">${escapeHtml(formatPlayerName(p.name))}</td>`,
        ...columns.map(c => `<td class="num-cell">${c.fmt ? c.fmt(p[c.key]) : p[c.key]}</td>`)].join('');
        return `<tr class="${i < 3 ? 'top-' + (i + 1) : ''}">${cells}</tr>`;
    }).join('');
    return `<table class="leaderboard-table"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
}

function exportSeasonCsv() {
    const s = aggregateSeason(seasonMatches());
    const rows = [['이름', '참여횟수', '총 쿼터', '골', '어시스트', '공격포인트']];
    [...s.players].sort((a, b) => b.quarters - a.quarters).forEach(p => {
        rows.push([p.name, p.matches, p.quarters, p.goals, p.assists, p.attackPoints]);
    });
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fc_barza_season_stats.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

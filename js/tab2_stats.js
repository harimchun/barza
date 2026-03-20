// =============================================
// FC 바르자 팀 매니저 - Tab 2: 시즌 통계
// =============================================

function renderStatsTab() {
    const container = document.getElementById('tab2-content');
    if (!container) return;

    // 확정 저장된 경기만 집계
    const finalMatches = AppState.matches.filter(m => !m.is_draft);

    // 집계: 선수별 골/어시스트/경기수
    const agg = {};
    finalMatches.forEach(match => {
        (match.match_stats || []).forEach(row => {
            const name = row['이름'];
            if (!name) return;
            if (!agg[name]) agg[name] = { goals: 0, assists: 0, appearances: 0 };
            agg[name].goals += (row['골'] || 0);
            agg[name].assists += (row['어시스트'] || 0);
            agg[name].appearances += 1;
        });
    });

    // 전체 총 스탯 + CSV 업로드 집계 합산 (업로드 상태 확인)
    const uploadedRows = window._uploadedCsvRows || [];
    uploadedRows.forEach(row => {
        const name = row['이름'];
        if (!name) return;
        if (!agg[name]) agg[name] = { goals: 0, assists: 0, appearances: 0 };
        agg[name].goals += (row['골'] || 0);
        agg[name].assists += (row['어시스트'] || 0);
        agg[name].appearances += (row['출석'] || 1);
    });

    const players = Object.entries(agg).map(([name, s]) => ({
        name, ...s,
        attackPoints: s.goals + s.assists,
    }));

    if (finalMatches.length === 0 && uploadedRows.length === 0) {
        container.innerHTML = `
      <div class="empty-state">
        <p>📭 확정 저장된 경기 기록이 없습니다.</p>
        <p>경기를 "확정 저장"하면 여기에 통계가 집계됩니다.</p>
      </div>
      ${buildCsvUploadSection()}`;
        initCsvUploadEvents();
        return;
    }

    const byGoals = [...players].sort((a, b) => b.goals - a.goals).slice(0, 10);
    const byAssists = [...players].sort((a, b) => b.assists - a.assists).slice(0, 10);
    const byAttackPoints = [...players].sort((a, b) => b.attackPoints - a.attackPoints).slice(0, 10);
    const byApp = [...players].sort((a, b) => b.appearances - a.appearances).slice(0, 10);

    const totalGF = QUARTERS.reduce((sum, q) => {
        return sum + finalMatches.reduce((s, m) => s + (m.scores?.[q]?.[0] || 0), 0);
    }, 0);
    const totalGA = QUARTERS.reduce((sum, q) => {
        return sum + finalMatches.reduce((s, m) => s + (m.scores?.[q]?.[1] || 0), 0);
    }, 0);

    container.innerHTML = `
    <div class="stats-summary-bar">
      <div class="summary-item"><span class="summary-num">${finalMatches.length}</span><span class="summary-label">경기</span></div>
      <div class="summary-item"><span class="summary-num">${totalGF}</span><span class="summary-label">득점</span></div>
      <div class="summary-item"><span class="summary-num">${totalGA}</span><span class="summary-label">실점</span></div>
      <div class="summary-item"><span class="summary-num">${players.length}</span><span class="summary-label">선수</span></div>
    </div>

    <div class="leaderboard-grid">
      <div class="leaderboard-card">
        <h3>⚽ 득점 Top 10</h3>
        ${buildLeaderboardTable(byGoals, [
        { key: 'goals', label: '⚽ 골' },
        { key: 'appearances', label: '경기' },
    ])}
      </div>
      <div class="leaderboard-card">
        <h3>👟 도움 Top 10</h3>
        ${buildLeaderboardTable(byAssists, [
        { key: 'assists', label: '👟 도움' },
        { key: 'appearances', label: '경기' },
    ])}
      </div>
      <div class="leaderboard-card">
        <h3>🔥 공격포인트 Top 10</h3>
        ${buildLeaderboardTable(byAttackPoints, [
        { key: 'attackPoints', label: '🔥 공격P' },
        { key: 'goals', label: '골' },
        { key: 'assists', label: '도움' },
    ])}
      </div>
      <div class="leaderboard-card">
        <h3>📅 출석 Top 10</h3>
        ${buildLeaderboardTable(byApp, [
        { key: 'appearances', label: '경기수' },
        { key: 'goals', label: '골' },
    ])}
      </div>
    </div>

    ${buildCsvUploadSection()}

    <div class="export-row">
      <button class="btn-secondary" onclick="exportSeasonCsv()">📥 시즌 데이터 CSV 다운로드</button>
    </div>`;

    initCsvUploadEvents();
}

function buildLeaderboardTable(players, columns) {
    if (players.length === 0) return '<p class="empty-hint">데이터 없음</p>';
    const headers = ['순위', '이름', ...columns.map(c => c.label)].map(h => `<th>${h}</th>`).join('');
    const rows = players.map((p, i) => {
        const cells = [`<td class="rank-cell">${i + 1}</td>`, `<td class="name-cell">${p.name}</td>`,
        ...columns.map(c => `<td class="num-cell">${p[c.key]}</td>`)].join('');
        return `<tr class="${i < 3 ? 'top-' + (i + 1) : ''}">${cells}</tr>`;
    }).join('');
    return `<table class="leaderboard-table"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
}

function buildCsvUploadSection() {
    return `
    <div class="csv-upload-section">
      <h3>📂 과거 기록 CSV 업로드</h3>
      <p class="hint-text">기존 CSV 파일(이름/골/어시스트/출석 컬럼)을 업로드하면 통계에 합산됩니다.</p>
      <input type="file" id="csv-upload-input" accept=".csv" multiple>
      <div id="csv-upload-status"></div>
    </div>`;
}

function initCsvUploadEvents() {
    const inp = document.getElementById('csv-upload-input');
    if (!inp) return;
    inp.addEventListener('change', async () => {
        const files = Array.from(inp.files);
        const rows = [];
        for (const file of files) {
            try {
                const text = await file.text();
                const parsed = parseCsv(text, file.name.replace('.csv', ''));
                rows.push(...parsed);
            } catch (e) {
                showToast(`${file.name} 파싱 오류: ${e.message}`, 'error');
            }
        }
        window._uploadedCsvRows = rows;
        document.getElementById('csv-upload-status').textContent = `${rows.length}개 기록 업로드됨`;
        renderStatsTab();
    });
}

function parseCsv(text, filename) {
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim().replace(/^\uFEFF/, ''));
    const nameIdx = headers.indexOf('이름');
    const goalIdx = headers.indexOf('골');
    const asIdx = headers.indexOf('어시스트');
    if (nameIdx === -1) throw new Error('이름 컬럼 없음');

    return lines.slice(1).map(line => {
        const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        const name = cols[nameIdx];
        if (!name) return null;
        return {
            '이름': name,
            '골': goalIdx >= 0 ? (parseFloat(cols[goalIdx]) || 0) : 0,
            '어시스트': asIdx >= 0 ? (parseFloat(cols[asIdx]) || 0) : 0,
            '출석': 1,
        };
    }).filter(Boolean);
}

function exportSeasonCsv() {
    const finalMatches = AppState.matches.filter(m => !m.is_draft);
    const agg = {};
    finalMatches.forEach(match => {
        (match.match_stats || []).forEach(row => {
            const name = row['이름'];
            if (!agg[name]) agg[name] = { goals: 0, assists: 0, appearances: 0 };
            agg[name].goals += (row['골'] || 0);
            agg[name].assists += (row['어시스트'] || 0);
            agg[name].appearances += 1;
        });
    });

    const rows = [['이름', '골', '어시스트', '경기']];
    Object.entries(agg).forEach(([name, s]) => {
        rows.push([name, s.goals, s.assists, s.appearances]);
    });

    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fc_barza_season_stats.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

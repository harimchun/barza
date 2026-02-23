// =============================================
// FC 바르자 팀 매니저 - Tab 4: 선수단 관리
// =============================================

function renderRosterTab() {
    const container = document.getElementById('tab4-content');
    if (!container) return;

    const roster = AppState.roster;
    const members = Object.entries(roster).filter(([, r]) => r === 'Member').sort((a, b) => a[0].localeCompare(b[0], 'ko'));
    const guests = Object.entries(roster).filter(([, r]) => r === 'Guest').sort((a, b) => a[0].localeCompare(b[0], 'ko'));

    const buildRows = (entries, isGuest) => entries.map(([name, role]) => `
    <tr>
      <td class="roster-name">${name}</td>
      <td><span class="role-badge ${isGuest ? 'guest' : 'member'}">${isGuest ? '용병' : '멤버'}</span></td>
      <td class="roster-actions">
        ${isGuest
            ? `<button class="btn-sm btn-promote" onclick="promotePlayer('${name}')">멤버로 승격</button>`
            : `<button class="btn-sm btn-demote" onclick="demotePlayer('${name}')">용병으로 변경</button>`}
        <button class="btn-sm btn-delete-player" onclick="deletePlayer('${name}')">🗑️</button>
      </td>
    </tr>`).join('');

    container.innerHTML = `
    <div class="roster-add-card">
      <h3>➕ 선수 / 용병 등록</h3>
      <div class="roster-add-form">
        <input type="text" id="new-player-name" placeholder="이름 입력">
        <select id="new-player-role">
          <option value="Member">멤버</option>
          <option value="Guest">용병</option>
        </select>
        <button class="btn-primary" onclick="addPlayer()">등록하기</button>
      </div>
    </div>

    <div class="roster-grid">
      <div class="roster-section">
        <h3>👕 정식 멤버 <span class="count-badge">${members.length}</span></h3>
        <table class="roster-table">
          <thead><tr><th>이름</th><th>구분</th><th>관리</th></tr></thead>
          <tbody>${buildRows(members, false)}</tbody>
        </table>
      </div>
      <div class="roster-section">
        <h3>用 용병 <span class="count-badge guest">${guests.length}</span></h3>
        <table class="roster-table">
          <thead><tr><th>이름</th><th>구분</th><th>관리</th></tr></thead>
          <tbody>${buildRows(guests, true)}</tbody>
        </table>
      </div>
    </div>`;

    // Enter key for new player
    document.getElementById('new-player-name').addEventListener('keydown', e => {
        if (e.key === 'Enter') addPlayer();
    });
}

async function addPlayer() {
    const nameInp = document.getElementById('new-player-name');
    const roleSel = document.getElementById('new-player-role');
    const name = nameInp.value.trim();
    if (!name) return;
    if (AppState.roster[name]) {
        showToast(`"${name}"은(는) 이미 등록되어 있습니다.`, 'error');
        return;
    }
    AppState.roster[name] = roleSel.value;
    nameInp.value = '';
    await persistRosterChange();
    showToast(`${name} 등록 완료! (${roleSel.value === 'Guest' ? '용병' : '멤버'})`);
}

async function promotePlayer(name) {
    AppState.roster[name] = 'Member';
    await persistRosterChange();
    showToast(`${name}님을 정식 멤버로 승격했습니다! 🎉`);
}

async function demotePlayer(name) {
    AppState.roster[name] = 'Guest';
    await persistRosterChange();
    showToast(`${name}님을 용병으로 변경했습니다.`);
}

async function deletePlayer(name) {
    if (!confirm(`"${name}"을(를) 선수단에서 삭제하시겠습니까?`)) return;
    delete AppState.roster[name];
    await persistRosterChange();
    showToast(`${name} 삭제 완료.`);
}

async function persistRosterChange() {
    try {
        await saveRoster();
    } catch (e) {
        showToast('명단 저장 실패: ' + e.message, 'error');
    }
    renderRosterTab();
    // 참석자 체크리스트도 업데이트
    renderPlayerChecklist();
}

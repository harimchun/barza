// =============================================
// FC 바르자 팀 매니저 - 자동 초안 엔진 (순수 함수, 브라우저/Node 공용)
// =============================================
//
// 입력: 참석자, 선수별 선호 포지션(우선순위 순), 쿼터 수, 쿼터당 출전 인원, 쿼터별 포메이션,
//       잠근 배치(locks), 쿼터별 출전 불가(unavailable)
// 출력: 쿼터별 라인업 + 선수별 쿼터 + 배치 근거
//
// 알고리즘 (쿼터 순서대로):
//   1. 출전 선수 선택 — 누적 쿼터가 적은 선수 우선, 같으면 직전 쿼터에 쉰 선수 우선, 그래도 같으면 시드 순.
//      GK 가능 선수가 있으면 최소 1명은 포함.
//   2. 포지션 배정 — 선수×슬롯 적합도(1순위 3점 · 같은 계열 2.5점 · 같은 라인 1.5점 · 인접 라인 0.7점,
//      우선순위가 뒤로 갈수록 ×0.85) 행렬을 헝가리안 알고리즘으로 최대화. 직전 쿼터와 같은 슬롯이면 소폭 가점.
//   3. 잠근 슬롯은 그대로 두고 나머지만 계산.
//
// 사용: 브라우저에서는 전역 `AutoDraft`, Node에서는 require('./autodraft.js')

(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.AutoDraft = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

    // ── 슬롯 정의: 라인 / 측면 / 계열 ────────────────────────────────────
    // line: GK, DF, DM, MF, AM, FW   side: L, C, R   family: 포지션 계열 (선호 표기 매칭용)
    const SLOTS = {
        GK: { line: 'GK', side: 'C', family: ['GK'] },
        LB: { line: 'DF', side: 'L', family: ['FB', 'WB'] },
        RB: { line: 'DF', side: 'R', family: ['FB', 'WB'] },
        LCB: { line: 'DF', side: 'C', family: ['CB'] },
        RCB: { line: 'DF', side: 'C', family: ['CB'] },
        LDM: { line: 'DM', side: 'L', family: ['DM', 'CM'] },
        RDM: { line: 'DM', side: 'R', family: ['DM', 'CM'] },
        LCM: { line: 'MF', side: 'L', family: ['CM'] },
        CM: { line: 'MF', side: 'C', family: ['CM'] },
        RCM: { line: 'MF', side: 'R', family: ['CM'] },
        MF0: { line: 'MF', side: 'L', family: ['CM'] },
        MF1: { line: 'MF', side: 'C', family: ['CM'] },
        MF2: { line: 'MF', side: 'R', family: ['CM'] },
        LM: { line: 'MF', side: 'L', family: ['WM', 'W'] },
        RM: { line: 'MF', side: 'R', family: ['WM', 'W'] },
        CAM: { line: 'AM', side: 'C', family: ['AM'] },
        LW: { line: 'AM', side: 'L', family: ['W', 'WF'] },
        RW: { line: 'AM', side: 'R', family: ['W', 'WF'] },
        ST: { line: 'FW', side: 'C', family: ['ST'] },
    };

    // ── 선호 포지션 표기 → { line, side, family } ───────────────────────────
    // 시트에 쓰인 표기: RB, GK, CAM, LDM, SW, LS, LWB, WF, WB, MF, DM, CB, LC, CM, LCM, LM, RM, ST, LW, RW, RWB, LAM, RS, FB, W …
    const PREF_ALIASES = {
        'SW': { line: 'DF', side: 'C', family: 'CB' },
        'CB': { line: 'DF', side: 'C', family: 'CB' },
        'LCB': { line: 'DF', side: 'L', family: 'CB' },
        'RCB': { line: 'DF', side: 'R', family: 'CB' },
        'LB': { line: 'DF', side: 'L', family: 'FB' },
        'RB': { line: 'DF', side: 'R', family: 'FB' },
        'FB': { line: 'DF', side: null, family: 'FB' },
        'WB': { line: 'DF', side: null, family: 'WB' },
        'LWB': { line: 'DF', side: 'L', family: 'WB' },
        'RWB': { line: 'DF', side: 'R', family: 'WB' },
        'DM': { line: 'DM', side: null, family: 'DM' },
        'CDM': { line: 'DM', side: null, family: 'DM' },
        'LDM': { line: 'DM', side: 'L', family: 'DM' },
        'RDM': { line: 'DM', side: 'R', family: 'DM' },
        'CM': { line: 'MF', side: 'C', family: 'CM' },
        'MF': { line: 'MF', side: null, family: 'CM' },
        'LCM': { line: 'MF', side: 'L', family: 'CM' },
        'RCM': { line: 'MF', side: 'R', family: 'CM' },
        'LC': { line: 'MF', side: 'L', family: 'CM' },
        'RC': { line: 'MF', side: 'R', family: 'CM' },
        'LM': { line: 'MF', side: 'L', family: 'WM' },
        'RM': { line: 'MF', side: 'R', family: 'WM' },
        'AM': { line: 'AM', side: null, family: 'AM' },
        'CAM': { line: 'AM', side: 'C', family: 'AM' },
        'LAM': { line: 'AM', side: 'L', family: 'AM' },
        'RAM': { line: 'AM', side: 'R', family: 'AM' },
        'W': { line: 'AM', side: null, family: 'W' },
        'LW': { line: 'AM', side: 'L', family: 'W' },
        'RW': { line: 'AM', side: 'R', family: 'W' },
        'WF': { line: 'AM', side: null, family: 'WF' },
        'LWF': { line: 'AM', side: 'L', family: 'WF' },
        'RWF': { line: 'AM', side: 'R', family: 'WF' },
        'ST': { line: 'FW', side: 'C', family: 'ST' },
        'CF': { line: 'FW', side: 'C', family: 'ST' },
        'FW': { line: 'FW', side: null, family: 'ST' },
        'LS': { line: 'FW', side: 'L', family: 'ST' },
        'RS': { line: 'FW', side: 'R', family: 'ST' },
        'GK': { line: 'GK', side: 'C', family: 'GK' },
        // 한글 표기
        '중미': { line: 'MF', side: 'C', family: 'CM' },
        '센백': { line: 'DF', side: 'C', family: 'CB' },
        '수미': { line: 'DM', side: null, family: 'DM' },
        '공미': { line: 'AM', side: 'C', family: 'AM' },
        '윙': { line: 'AM', side: null, family: 'W' },
        '윙백': { line: 'DF', side: null, family: 'WB' },
        '풀백': { line: 'DF', side: null, family: 'FB' },
        '골키퍼': { line: 'GK', side: 'C', family: 'GK' },
        '공격수': { line: 'FW', side: null, family: 'ST' },
    };

    const LINE_ORDER = ['GK', 'DF', 'DM', 'MF', 'AM', 'FW'];
    // 계열끼리의 근접성 (같은 라인 내에서 다른 계열이라도 어느 정도 호환)
    const FAMILY_NEIGHBORS = {
        FB: ['WB'], WB: ['FB', 'WM', 'W'], CB: ['DM'], DM: ['CM', 'CB'], CM: ['DM', 'AM'], WM: ['W', 'WB'],
        AM: ['CM', 'ST', 'W'], W: ['WF', 'WM', 'AM'], WF: ['W', 'ST'], ST: ['WF', 'AM'], GK: [],
    };

    function parsePref(code) {
        const c = String(code || '').trim().toUpperCase();
        return PREF_ALIASES[c] || PREF_ALIASES[String(code || '').trim()] || null;
    }

    const SCORE = { exact: 3, family: 2.5, line: 1.5, neighbor: 1.0, adjacentLine: 0.5, none: 0 };
    const RANK_DECAY = 0.85;
    const GK_PENALTY = -6;          // GK 선호가 없는 선수를 GK에 두는 비용
    const NON_GK_PENALTY = -2;      // GK 전담 선수를 필드에 두는 비용 (GK만 적어 둔 선수)
    const CONTINUITY_BONUS = 0.2;   // 직전 쿼터와 같은 슬롯

    // 선수의 선호 목록과 슬롯의 적합도 (0~3, GK 예외는 음수)
    function fitScore(prefs, slotKey) {
        const slot = SLOTS[slotKey];
        if (!slot) return 0;
        const parsed = (prefs || []).map(parsePref).filter(Boolean);
        const hasGK = parsed.some(p => p.line === 'GK');
        if (slot.line === 'GK') return hasGK ? SCORE.exact : GK_PENALTY;
        if (parsed.length && parsed.every(p => p.line === 'GK')) return NON_GK_PENALTY;

        let best = 0, bestReason = 'none', bestRank = -1;
        parsed.forEach((p, i) => {
            if (p.line === 'GK') return;
            let s = SCORE.none, reason = 'none';
            const sameFamily = slot.family.includes(p.family);
            const sideOk = !p.side || p.side === slot.side || (p.side === 'C' && slot.side === 'C');
            if (sameFamily && sideOk && p.line === slot.line) { s = SCORE.exact; reason = 'exact'; }
            else if (sameFamily && p.line === slot.line) { s = SCORE.family; reason = 'family'; }
            else if (sameFamily) { s = SCORE.family - 0.5; reason = 'family'; }
            else if (p.line === slot.line) {
                const near = slot.family.some(f => (FAMILY_NEIGHBORS[p.family] || []).includes(f));
                s = near ? SCORE.line : SCORE.line - 0.5; reason = 'line';
            } else if (Math.abs(LINE_ORDER.indexOf(p.line) - LINE_ORDER.indexOf(slot.line)) === 1) {
                const near = slot.family.some(f => (FAMILY_NEIGHBORS[p.family] || []).includes(f));
                s = near ? SCORE.neighbor : SCORE.adjacentLine; reason = 'adjacent';
            }
            s *= Math.pow(RANK_DECAY, i);
            if (s > best) { best = s; bestReason = reason; bestRank = i; }
        });
        fitScore.lastReason = { reason: bestReason, rank: bestRank };
        return best;
    }

    function fitDetail(prefs, slotKey) {
        const score = fitScore(prefs, slotKey);
        return { score, ...(fitScore.lastReason || { reason: 'none', rank: -1 }) };
    }

    // ── 헝가리안 알고리즘 (최대 가중 매칭, 직사각 행렬 지원) ───────────────
    // rows: 선수, cols: 슬롯. 반환: rowAssign[i] = j (또는 -1)
    function hungarianMax(matrix) {
        const n = matrix.length;
        const m = matrix[0] ? matrix[0].length : 0;
        if (!n || !m) return [];
        const size = Math.max(n, m);
        let maxVal = -Infinity;
        matrix.forEach(r => r.forEach(v => { if (v > maxVal) maxVal = v; }));
        // 비용 행렬로 변환 (정사각 패딩)
        const cost = Array.from({ length: size }, (_, i) =>
            Array.from({ length: size }, (_, j) => (i < n && j < m) ? (maxVal - matrix[i][j]) : (maxVal + 100)));
        const u = new Array(size + 1).fill(0), v = new Array(size + 1).fill(0);
        const p = new Array(size + 1).fill(0), way = new Array(size + 1).fill(0);
        for (let i = 1; i <= size; i++) {
            p[0] = i;
            let j0 = 0;
            const minv = new Array(size + 1).fill(Infinity);
            const used = new Array(size + 1).fill(false);
            do {
                used[j0] = true;
                const i0 = p[j0];
                let delta = Infinity, j1 = 0;
                for (let j = 1; j <= size; j++) {
                    if (used[j]) continue;
                    const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
                    if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
                    if (minv[j] < delta) { delta = minv[j]; j1 = j; }
                }
                for (let j = 0; j <= size; j++) {
                    if (used[j]) { u[p[j]] += delta; v[j] -= delta; }
                    else minv[j] -= delta;
                }
                j0 = j1;
            } while (p[j0] !== 0);
            do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
        }
        const assign = new Array(n).fill(-1);
        for (let j = 1; j <= size; j++) {
            const i = p[j];
            if (i >= 1 && i <= n && j <= m) assign[i - 1] = j - 1;
        }
        return assign;
    }

    // 시드 기반 결정적 셔플 (재생성 시 동점 순서만 바뀜)
    function seededOrder(names, seed) {
        let x = (seed >>> 0) || 1;
        const rnd = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
        return names.map(n => ({ n, r: rnd() })).sort((a, b) => a.r - b.r).map(o => o.n);
    }

    /**
     * 자동 초안 생성
     * @param {Object} opts
     *   attendees: string[]
     *   positions: { name: string[] }          선호 포지션 (우선순위 순)
     *   quarterCount: number, onFieldSize: number
     *   formations: { q: '4-2-3-1' }           쿼터별 포메이션 (없으면 기본)
     *   formationSlots: { '4-2-3-1': ['ST', ...] }  포메이션별 슬롯 키 목록
     *   locks: { q: { pos: name } }            고정 배치
     *   unavailable: { name: ['1Q'] }          출전 불가 쿼터
     *   seed: number
     * @returns {Object} { quarters: { q: { formation, lineup, reasons } }, credits, target, bench: { q: [] }, warnings: [] }
     */
    function generate(opts) {
        const attendees = [...new Set(opts.attendees || [])];
        const positions = opts.positions || {};
        const quarterCount = opts.quarterCount || 4;
        const onFieldSize = opts.onFieldSize || 11;
        const quarters = Array.from({ length: quarterCount }, (_, i) => `${i + 1}Q`);
        const locks = opts.locks || {};
        const unavailable = opts.unavailable || {};
        const seed = opts.seed || 1;
        const warnings = [];

        const credits = {};
        attendees.forEach(n => { credits[n] = 0; });
        const benchedLast = {};
        let prevLineup = {};
        const order = seededOrder(attendees, seed);
        const rankOf = {};
        order.forEach((n, i) => { rankOf[n] = i; });

        const result = { quarters: {}, bench: {} };

        quarters.forEach((q, qi) => {
            const formation = (opts.formations && opts.formations[q]) || opts.defaultFormation || '4-2-3-1';
            const slots = (opts.formationSlots && opts.formationSlots[formation]) || Object.keys(SLOTS).slice(0, onFieldSize);
            const qLocks = locks[q] || {};
            const lineup = {};
            const reasons = {};

            // 1) 잠근 배치 반영
            Object.entries(qLocks).forEach(([pos, name]) => {
                if (name && attendees.includes(name) && slots.includes(pos) && !Object.values(lineup).includes(name)) {
                    lineup[pos] = name;
                    reasons[pos] = { name, score: fitScore(positions[name], pos), reason: 'locked', rank: -1 };
                }
            });

            // 2) 출전 선수 선택
            const available = attendees.filter(n => !(unavailable[n] || []).includes(q));
            const chosen = new Set(Object.values(lineup));
            const need = Math.min(slots.length, available.length) - chosen.size;
            const pool = available.filter(n => !chosen.has(n));
            const sortKey = n => [credits[n], benchedLast[n] ? 0 : 1, rankOf[n]];
            pool.sort((a, b) => {
                const ka = sortKey(a), kb = sortKey(b);
                for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
                return 0;
            });
            const picked = pool.slice(0, Math.max(0, need));

            // GK 보장: 선택된 인원 중 GK 가능 선수가 없고 풀에 있으면 교체
            const needsGK = slots.includes('GK') && !lineup.GK;
            const isGK = n => (positions[n] || []).some(c => (parsePref(c) || {}).line === 'GK');
            if (needsGK && !picked.some(isGK) && !Object.values(lineup).some(isGK)) {
                const gkCand = pool.filter(n => !picked.includes(n) && isGK(n))[0];
                if (gkCand) {
                    // 선택된 선수 중 크레딧이 가장 높은 비GK를 빼고 GK 투입
                    let out = -1;
                    for (let i = picked.length - 1; i >= 0; i--) { if (!isGK(picked[i])) { out = i; break; } }
                    if (out >= 0) picked[out] = gkCand;
                } else if (!available.some(isGK)) {
                    warnings.push(`${q}: GK 선호 선수가 없어 적합도만으로 GK를 배정했습니다.`);
                }
            }

            // 3) 포지션 배정 (헝가리안)
            const openSlots = slots.filter(p => !lineup[p]);
            if (picked.length && openSlots.length) {
                const matrix = picked.map(n => openSlots.map(pos => {
                    let s = fitScore(positions[n], pos);
                    if (prevLineup[pos] === n) s += CONTINUITY_BONUS;
                    return s;
                }));
                const assign = hungarianMax(matrix);
                assign.forEach((j, i) => {
                    if (j < 0) return;
                    const pos = openSlots[j], name = picked[i];
                    lineup[pos] = name;
                    reasons[pos] = { name, ...fitDetail(positions[name], pos) };
                });
            }

            // 4) 크레딧/벤치 갱신
            const onField = new Set(Object.values(lineup));
            attendees.forEach(n => {
                if (onField.has(n)) credits[n] += 1;
                benchedLast[n] = !onField.has(n);
            });
            result.quarters[q] = { formation, lineup, reasons };
            result.bench[q] = attendees.filter(n => !onField.has(n));
            prevLineup = lineup;
        });

        const slotsTotal = onFieldSize * quarterCount;
        const target = attendees.length ? slotsTotal / attendees.length : 0;
        const vals = Object.values(credits);
        const maxC = vals.length ? Math.max(...vals) : 0, minC = vals.length ? Math.min(...vals) : 0;
        const spread = maxC - minC;
        if (spread >= 2) {
            const most = attendees.filter(n => credits[n] === maxC).join(', ');
            const least = attendees.filter(n => credits[n] === minC).join(', ');
            warnings.push(`출전 쿼터 차이 ${spread}Q — 최다 ${maxC}Q: ${most} / 최소 ${minC}Q: ${least} (GK 전담·잠금·출전 불가 때문일 수 있음)`);
        }
        return { quarters: result.quarters, bench: result.bench, credits, target, warnings };
    }

    // 근거 표시용 라벨
    function reasonLabel(r) {
        if (!r) return '';
        switch (r.reason) {
            case 'locked': return '🔒 고정';
            case 'exact': return r.rank === 0 ? '1순위' : `${r.rank + 1}순위`;
            case 'family': return `${r.rank + 1}순위 계열`;
            case 'line': return '같은 라인';
            case 'adjacent': return '인접 라인';
            default: return '대체';
        }
    }

    return { SLOTS, PREF_ALIASES, parsePref, fitScore, fitDetail, hungarianMax, generate, reasonLabel, seededOrder };
});

// 자동 초안 엔진 테스트 — 실행: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const AutoDraft = require('../js/autodraft.js');

const F4231 = ['ST', 'LW', 'CAM', 'RW', 'LDM', 'RDM', 'LB', 'LCB', 'RCB', 'RB', 'GK'];
const FORMATION_SLOTS = { '4-2-3-1': F4231 };

// 2026.10.17 참석자 + 시트의 선호 포지션
const POSITIONS = {
    우성: ['ST', 'LS'], 형록: ['RM', 'RB'], 승문: ['RB', 'CAM'], 현재: ['RCB', 'LCB'], 진환: ['LW', 'CAM'],
    준현: ['CAM', 'DM'], 재성: ['RWB', 'RW'], 지호: ['ST'], 지용: ['RW'], 영현: ['DM'],
    백승진: ['ST', 'WB'], 송하명: ['WB', 'W'], 유신: ['CB'], 장재혁: ['CM'],
    주열: ['RB', 'GK'], 경환: ['GK'],
};
const ATTENDEES_14 = ['우성', '형록', '승문', '현재', '진환', '준현', '재성', '지호', '지용', '영현', '백승진', '송하명', '유신', '장재혁'];

test('fitScore: 정확 일치 3, 같은 계열 다른 측면 2.5, 인접 라인 1, GK 예외', () => {
    assert.equal(AutoDraft.fitScore(['RB'], 'RB'), 3);
    assert.equal(AutoDraft.fitScore(['LB'], 'RB'), 2.5);
    assert.equal(AutoDraft.fitScore(['CB'], 'LCB'), 3);
    assert.equal(AutoDraft.fitScore(['WB'], 'LB'), 3);
    assert.equal(AutoDraft.fitScore(['DM'], 'RDM'), 3);
    assert.equal(AutoDraft.fitScore(['중미'], 'CM'), 3);
    assert.equal(AutoDraft.fitScore(['ST'], 'LW'), 1);          // 인접 라인 + 이웃 계열
    assert.equal(AutoDraft.fitScore(['ST'], 'GK'), -6);         // GK 선호 없음
    assert.equal(AutoDraft.fitScore(['GK'], 'GK'), 3);
    assert.equal(AutoDraft.fitScore(['GK'], 'RB'), -2);         // GK 전담
    assert.equal(AutoDraft.fitScore(['RB', 'GK'], 'GK'), 3);    // 둘 다 가능
    assert.ok(AutoDraft.fitScore(['RB', 'GK'], 'RB') === 3);
    // 2순위는 0.85배
    assert.ok(Math.abs(AutoDraft.fitScore(['ST', 'RB'], 'RB') - 3 * 0.85) < 1e-9);
    assert.equal(AutoDraft.fitScore([], 'CAM'), 0);
});

test('hungarianMax: 최대 가중 매칭 (정사각·직사각)', () => {
    const a = AutoDraft.hungarianMax([[3, 1, 0], [0, 3, 1], [1, 0, 3]]);
    assert.deepEqual(a, [0, 1, 2]);
    const b = AutoDraft.hungarianMax([[1, 5, 1], [5, 1, 1]]);  // 2명 × 3슬롯
    assert.deepEqual(b, [1, 0]);
    const c = AutoDraft.hungarianMax([[0, 10], [10, 9]]);      // 탐욕(둘째 행 10)이 아닌 전체 최적(10+10)
    assert.deepEqual(c, [1, 0]);
});

test('generate: 14명 4쿼터 11명 (교체 없이) → 모두 3~4쿼터, 매 쿼터 11명 중복 없음', () => {
    const r = AutoDraft.generate({ attendees: ATTENDEES_14, positions: POSITIONS, quarterCount: 4, onFieldSize: 11,
        formations: {}, defaultFormation: '4-2-3-1', formationSlots: FORMATION_SLOTS, seed: 7, allowSubs: false });
    const credits = Object.values(r.credits);
    assert.equal(credits.length, 14);
    assert.equal(credits.reduce((a, b) => a + b, 0), 44);
    assert.ok(credits.every(c => c === 3 || c === 4));
    assert.equal(credits.filter(c => c === 4).length, 2);
    for (const q of ['1Q', '2Q', '3Q', '4Q']) {
        const names = Object.values(r.quarters[q].lineup);
        assert.equal(names.length, 11, q);
        assert.equal(new Set(names).size, 11, q);
        assert.equal(Object.keys(r.quarters[q].lineup).sort().join(), [...F4231].sort().join(), q);
        assert.equal(r.bench[q].length, 3);
    }
    // 아무도 두 쿼터 연속으로 쉬지 않음 (14명 중 3명씩 쉬면 가능)
    const benchSets = ['1Q', '2Q', '3Q', '4Q'].map(q => new Set(r.bench[q]));
    for (let i = 1; i < 4; i++) for (const n of benchSets[i]) assert.ok(!benchSets[i - 1].has(n), `${n} 연속 벤치`);
    assert.ok(r.target - 44 / 14 < 1e-9);
});

test('generate: 선호 포지션이 지켜짐 (ST 지호/우성, CB 현재/유신, 측면 미드 없음 → 윙은 윙 선호자)', () => {
    const r = AutoDraft.generate({ attendees: ATTENDEES_14, positions: POSITIONS, quarterCount: 4, onFieldSize: 11,
        defaultFormation: '4-2-3-1', formationSlots: FORMATION_SLOTS, seed: 3 });
    for (const q of ['1Q', '2Q', '3Q', '4Q']) {
        const l = r.quarters[q].lineup;
        assert.ok(['지호', '우성', '백승진'].includes(l.ST), `${q} ST=${l.ST}`);
        assert.ok(['현재', '유신'].includes(l.LCB) || ['현재', '유신'].includes(l.RCB), `${q} CB`);
        assert.ok(['영현', '준현', '장재혁'].includes(l.LDM) || ['영현', '준현', '장재혁'].includes(l.RDM), `${q} DM`);
    }
});

test('generate: GK 선호 선수가 있으면 매 쿼터 GK는 그 선수', () => {
    const att = [...ATTENDEES_14, '주열', '경환'];
    const r = AutoDraft.generate({ attendees: att, positions: POSITIONS, quarterCount: 4, onFieldSize: 11,
        defaultFormation: '4-2-3-1', formationSlots: FORMATION_SLOTS, seed: 1 });
    for (const q of ['1Q', '2Q', '3Q', '4Q']) {
        assert.ok(['주열', '경환'].includes(r.quarters[q].lineup.GK), `${q} GK=${r.quarters[q].lineup.GK}`);
    }
    assert.equal(r.warnings.filter(w => w.includes('GK')).length, 0);
});

test('generate: 잠금과 출전 불가가 지켜짐', () => {
    const r = AutoDraft.generate({ attendees: ATTENDEES_14, positions: POSITIONS, quarterCount: 4, onFieldSize: 11,
        defaultFormation: '4-2-3-1', formationSlots: FORMATION_SLOTS, seed: 5,
        locks: { '1Q': { ST: '장재혁' }, '3Q': { GK: '지호' } },
        unavailable: { 우성: ['1Q', '2Q'] } });
    assert.equal(r.quarters['1Q'].lineup.ST, '장재혁');
    assert.equal(r.quarters['1Q'].reasons.ST.reason, 'locked');
    assert.equal(r.quarters['3Q'].lineup.GK, '지호');
    assert.ok(!Object.values(r.quarters['1Q'].lineup).includes('우성'));
    assert.ok(!Object.values(r.quarters['2Q'].lineup).includes('우성'));
    assert.equal(r.credits['우성'], 2);
});

test('generate: 인원이 슬롯보다 적으면 전원 출전, 빈 슬롯 남김', () => {
    const att = ATTENDEES_14.slice(0, 9);
    const r = AutoDraft.generate({ attendees: att, positions: POSITIONS, quarterCount: 4, onFieldSize: 11,
        defaultFormation: '4-2-3-1', formationSlots: FORMATION_SLOTS, seed: 2 });
    for (const q of ['1Q', '2Q', '3Q', '4Q']) {
        assert.equal(Object.keys(r.quarters[q].lineup).length, 9, q);
        assert.equal(r.bench[q].length, 0);
    }
    assert.ok(Object.values(r.credits).every(c => c === 4));
});

test('generate: 같은 시드는 같은 결과', () => {
    const a = AutoDraft.generate({ attendees: ATTENDEES_14, positions: POSITIONS, quarterCount: 4, onFieldSize: 11, defaultFormation: '4-2-3-1', formationSlots: FORMATION_SLOTS, seed: 9 });
    const b = AutoDraft.generate({ attendees: ATTENDEES_14, positions: POSITIONS, quarterCount: 4, onFieldSize: 11, defaultFormation: '4-2-3-1', formationSlots: FORMATION_SLOTS, seed: 9 });
    assert.deepEqual(a.quarters, b.quarters);
});

test('reasonLabel', () => {
    assert.equal(AutoDraft.reasonLabel({ reason: 'exact', rank: 0 }), '1순위');
    assert.equal(AutoDraft.reasonLabel({ reason: 'exact', rank: 1 }), '2순위');
    assert.equal(AutoDraft.reasonLabel({ reason: 'locked' }), '🔒 고정');
    assert.equal(AutoDraft.reasonLabel({ reason: 'none' }), '대체');
});

const GUEST_POS = { ...POSITIONS, 용병A: ['CM'], 용병B: ['ST'], 용병C: ['CB'] };
const ATT_15 = [...ATTENDEES_14.slice(0, 12), '용병A', '용병B', '용병C'];

test('generate: 용병 최소 3쿼터 보장', () => {
    const r = AutoDraft.generate({ attendees: ATT_15, positions: GUEST_POS, quarterCount: 4, onFieldSize: 11,
        defaultFormation: '4-2-3-1', formationSlots: FORMATION_SLOTS, seed: 4, allowSubs: false,
        minCredits: { 용병A: 3, 용병B: 3, 용병C: 3 } });
    for (const g of ['용병A', '용병B', '용병C']) assert.ok(r.credits[g] >= 3, `${g} ${r.credits[g]}`);
    assert.equal(Object.values(r.credits).reduce((a, b) => a + b, 0), 44);
    assert.equal(r.warnings.filter(w => w.includes('보장')).length, 0);
});

test('generate: 교체로 0.5 보정 → 최대-최소 차이가 1 미만', () => {
    // 15명 × 44슬롯: 정수로는 2/3/4 가 섞이지만 교체를 쓰면 2.5~3.5 안으로
    const r = AutoDraft.generate({ attendees: ATT_15, positions: GUEST_POS, quarterCount: 4, onFieldSize: 11,
        defaultFormation: '4-2-3-1', formationSlots: FORMATION_SLOTS, seed: 4, allowSubs: true });
    const vals = Object.values(r.credits);
    assert.ok(Math.max(...vals) - Math.min(...vals) < 1, `spread ${Math.max(...vals) - Math.min(...vals)}`);
    assert.ok(r.subCount > 0);
    // 교체 쌍 유효성: in 은 그 쿼터 벤치, out 은 라인업의 해당 슬롯, 합계는 여전히 44
    for (const q of ['1Q', '2Q', '3Q', '4Q']) {
        const qd = r.quarters[q];
        for (const sb of qd.subs) {
            assert.equal(qd.lineup[sb.pos], sb.out, `${q} ${sb.pos}`);
            assert.ok(!Object.values(qd.lineup).includes(sb.in), `${q} in on field`);
            assert.notEqual(sb.pos, 'GK');
        }
    }
    assert.ok(Math.abs(vals.reduce((a, b) => a + b, 0) - 44) < 1e-9);
    // 교체를 반영한 크레딧이 Quota 엔진 계산과 일치
    const Quota = require('../js/quota.js');
    const p = Quota.computeParticipation(r.quarters);
    for (const n of ATT_15) assert.equal(p[n] ? p[n].credit : 0, r.credits[n], n);
});

test('generate: 출전 불가 쿼터 선수는 교체로도 투입되지 않음', () => {
    const r = AutoDraft.generate({ attendees: ATT_15, positions: GUEST_POS, quarterCount: 4, onFieldSize: 11,
        defaultFormation: '4-2-3-1', formationSlots: FORMATION_SLOTS, seed: 2, allowSubs: true,
        unavailable: { 우성: ['4Q'], 형록: ['3Q', '4Q'] } });
    const q4 = r.quarters['4Q'];
    assert.ok(!Object.values(q4.lineup).includes('우성') && !q4.subs.some(s => s.in === '우성' || s.out === '우성'));
    assert.ok(!Object.values(r.quarters['3Q'].lineup).includes('형록') && !r.quarters['3Q'].subs.some(s => s.in === '형록'));
});

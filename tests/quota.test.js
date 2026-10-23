// 쿼터 보장 엔진 테스트 — 실행: node --test tests/
// 기준: 스프레드시트 "세곡체육공원(2026.10.17 토요일 8-10)" 시트의 X열(실 참여횟수)·참여인원·예상 평균쿼터
const test = require('node:test');
const assert = require('node:assert/strict');
const Quota = require('../js/quota.js');

// 2026-10-17 세곡 vs 세리에 (시트 보드 그대로; 4Q 에서 재혁(장재혁) In ↔ 지용 Out)
const SEGOK = {
    attendees: ['백승진', '송하명', '승문', '영현', '우성', '유신', '장재혁', '재성', '준현', '지용', '지호', '진환', '현재', '형록'],
    quarters: {
        '1Q': { lineup: { ST: '우성', LW: '지호', RW: '백승진', CAM: '진환', LDM: '지용', RDM: '장재혁', LB: '송하명', RB: '재성', LCB: '영현', RCB: '현재', GK: '형록' }, subs: [] },
        '2Q': { lineup: { ST: '지호', LW: '진환', RW: '백승진', CAM: '준현', LDM: '지용', RDM: '장재혁', LB: '송하명', RB: '승문', LCB: '유신', RCB: '형록', GK: '현재' }, subs: [] },
        '3Q': { lineup: { ST: '우성', LW: '진환', RW: '지호', CAM: '준현', LDM: '지용', RDM: '장재혁', LB: '승문', RB: '재성', LCB: '유신', RCB: '영현', GK: '형록' }, subs: [] },
        '4Q': { lineup: { ST: '우성', LW: '백승진', RW: '송하명', CAM: '준현', LDM: '지용', RDM: '영현', LB: '승문', RB: '재성', LCB: '유신', RCB: '형록', GK: '현재' }, subs: [{ in: '장재혁', out: '지용', pos: 'LDM' }] },
    },
};

test('quarterCredit: 주전 1, 교체 관여 0.5, 미출전 0', () => {
    const q = SEGOK.quarters['4Q'];
    assert.equal(Quota.quarterCredit(q.lineup, q.subs, '우성'), 1);
    assert.equal(Quota.quarterCredit(q.lineup, q.subs, '지용'), 0.5);   // Out
    assert.equal(Quota.quarterCredit(q.lineup, q.subs, '장재혁'), 0.5); // In (보드에 없음)
    assert.equal(Quota.quarterCredit(q.lineup, q.subs, '지호'), 0);
});

test('quarterCredit: 한 쿼터에 두 번 교체 관여하면 0 (음수 없음)', () => {
    const lineup = { ST: 'A' };
    const subs = [{ in: 'B', out: 'A' }, { in: 'A', out: 'B' }];
    assert.equal(Quota.quarterCredit(lineup, subs, 'A'), 0);
    assert.equal(Quota.quarterCredit(lineup, subs, 'B'), 0);
});

test('computeParticipation: 시트 X열(실 참여횟수)과 일치', () => {
    const p = Quota.computeParticipation(SEGOK.quarters);
    const expected = {
        우성: 3, 형록: 4, 승문: 3, 현재: 3, 진환: 3, 준현: 3, 재성: 3, 지호: 3,
        지용: 3.5, 영현: 3, 백승진: 3, 송하명: 3, 유신: 3, 장재혁: 3.5,
    };
    for (const [name, credit] of Object.entries(expected)) {
        assert.equal(p[name].credit, credit, name);
    }
    assert.equal(p['지용'].subCount, 1);
    assert.equal(p['형록'].played, 4);
    assert.deepEqual(p['장재혁'].byQuarter, { '1Q': 1, '2Q': 1, '3Q': 1, '4Q': 0.5 });
});

test('computeTargets: 참여인원 14, 예상 평균 44/14, 실제 평균(AVERAGEIF>0)', () => {
    const t = Quota.computeTargets({ ...SEGOK, quarterCount: 4, onFieldSize: 11 });
    assert.equal(t.attendees, 14);
    assert.equal(t.slots, 44);
    assert.equal(t.actualSlots, 44);
    assert.ok(Math.abs(t.target - 44 / 14) < 1e-9);
    // 시트의 실제 평균은 재혁/장재혁 표기 차이로 3.125 였고, 별칭을 합치면 44/14 = 3.142857
    assert.ok(Math.abs(t.avg - 44 / 14) < 1e-9);
    assert.deepEqual(t.perQuarter, { '1Q': 11, '2Q': 11, '3Q': 11, '4Q': 11 });
    assert.equal(t.min, 3);
    assert.equal(t.max, 4);
    assert.equal(t.balanced, true);
    assert.deepEqual(t.under, []);
    assert.deepEqual(t.over, []);
    assert.deepEqual(t.unplayed, []);
});

test('computeTargets: 5쿼터 경기는 55/N, 출전 인원 10명이면 40/N', () => {
    const t5 = Quota.computeTargets({ quarters: {}, attendees: Array.from({ length: 15 }, (_, i) => `p${i}`), quarterCount: 5, onFieldSize: 11 });
    assert.equal(t5.slots, 55);
    assert.ok(Math.abs(t5.target - 55 / 15) < 1e-9);
    assert.deepEqual(t5.quarterKeys, ['1Q', '2Q', '3Q', '4Q', '5Q']);
    const t10 = Quota.computeTargets({ quarters: {}, attendees: ['a', 'b', 'c', 'd'], quarterCount: 4, onFieldSize: 10 });
    assert.equal(t10.slots, 40);
    assert.equal(t10.target, 10);
});

test('computeTargets: 목표 대비 1쿼터 이상 차이 나면 under/over, 미출전은 unplayed', () => {
    const quarters = {
        '1Q': { lineup: { ST: 'A', GK: 'B' }, subs: [] },
        '2Q': { lineup: { ST: 'A', GK: 'B' }, subs: [] },
        '3Q': { lineup: { ST: 'A', GK: 'C' }, subs: [] },
        '4Q': { lineup: { ST: 'A', GK: 'C' }, subs: [{ in: 'D', out: 'C' }] },
    };
    const t = Quota.computeTargets({ quarters, attendees: ['A', 'B', 'C', 'D', 'E'], quarterCount: 4, onFieldSize: 2 });
    assert.equal(t.target, 8 / 5);          // 1.6
    assert.equal(t.status.A, 'over');       // 4
    assert.equal(t.status.B, 'ok');         // 2
    assert.equal(t.status.C, 'ok');         // 1.5
    assert.equal(t.status.D, 'under');      // 0.5
    assert.deepEqual(t.unplayed, ['E']);
    assert.equal(t.balanced, false);        // 4 - 0 >= 2
    assert.equal(t.actualSlots, 8);
});

test('participationStatus / fmt', () => {
    assert.equal(Quota.participationStatus(2, 3.1), 'under');
    assert.equal(Quota.participationStatus(2.5, 3.1), 'ok');
    assert.equal(Quota.participationStatus(4.2, 3.1), 'over');
    assert.equal(Quota.fmt(3), '3');
    assert.equal(Quota.fmt(3.5), '3.5');
    assert.equal(Quota.fmt(44 / 14), '3.14');
    assert.equal(Quota.fmt(2.5, 1), '2.5');
});

test('quarterKeys: 기본 4, 잘못된 값은 4로', () => {
    assert.deepEqual(Quota.quarterKeys(4), ['1Q', '2Q', '3Q', '4Q']);
    assert.deepEqual(Quota.quarterKeys(undefined), ['1Q', '2Q', '3Q', '4Q']);
    assert.deepEqual(Quota.quarterKeys(5).length, 5);
});

test('computeTargets: 일부 쿼터만 참석하는 선수는 개인 목표가 비율로 줄고 나머지는 늘어남', () => {
    const attendees = Array.from({ length: 12 }, (_, i) => `p${i}`);
    const t = Quota.computeTargets({ quarters: {}, attendees, quarterCount: 4, onFieldSize: 11,
        availability: { p0: ['1Q', '2Q'], p1: ['1Q', '2Q', '3Q'] } });
    assert.equal(t.availableCount.p0, 2);
    assert.equal(t.availableCount.p1, 3);
    assert.equal(t.availableCount.p2, 4);
    // 가능 쿼터 합 = 2 + 3 + 10×4 = 45, 슬롯 44 → p0: 44×2/45, p2: 44×4/45
    assert.ok(Math.abs(t.personalTarget.p0 - 44 * 2 / 45) < 1e-9);
    assert.ok(Math.abs(t.personalTarget.p2 - 44 * 4 / 45) < 1e-9);
    const sum = Object.values(t.personalTarget).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 44) < 1e-9);
    // 전원 전 쿼터면 기존과 동일
    const t2 = Quota.computeTargets({ quarters: {}, attendees, quarterCount: 4, onFieldSize: 11 });
    assert.ok(Object.values(t2.personalTarget).every(v => Math.abs(v - 44 / 12) < 1e-9));
});

test('computeTargets: 전 쿼터 GK로 뛴 전담 GK는 초과·범위·균형 판정에서 제외', () => {
    const quarters = {};
    ['1Q', '2Q', '3Q', '4Q'].forEach((q, i) => {
        quarters[q] = { lineup: { GK: '키퍼', ST: i % 2 ? 'A' : 'B', CAM: 'C' }, subs: [] };
    });
    const t = Quota.computeTargets({ quarters, attendees: ['키퍼', 'A', 'B', 'C'], quarterCount: 4, onFieldSize: 3 });
    assert.equal(t.status['키퍼'], 'gk');
    assert.deepEqual(t.gkExempt, ['키퍼']);
    assert.ok(!t.over.includes('키퍼'));        // 키퍼 4쿼터지만 초과 아님
    assert.equal(t.max, 4);                     // C 가 4쿼터 (CAM)
    assert.equal(t.status['C'], 'over');
    // 키퍼를 빼고 보면 A/B 2, C 4 → 차이 2 → 불균형 (GK 때문은 아님)
    assert.equal(t.balanced, false);
    const t2 = Quota.computeTargets({ quarters: {
        '1Q': { lineup: { GK: '키퍼', ST: 'A' } }, '2Q': { lineup: { GK: '키퍼', ST: 'B' } },
        '3Q': { lineup: { GK: '키퍼', ST: 'A' } }, '4Q': { lineup: { GK: '키퍼', ST: 'B' } } },
        attendees: ['키퍼', 'A', 'B'], quarterCount: 4, onFieldSize: 2 });
    assert.equal(t2.balanced, true);            // 키퍼 4 vs A/B 2 지만 전담 GK 제외 → 균형
    assert.equal(t2.min, 2); assert.equal(t2.max, 2);
    // GK 로도 뛰고 필드로도 뛰면 전담이 아님
    const t3 = Quota.computeTargets({ quarters: {
        '1Q': { lineup: { GK: '키퍼', ST: 'A' } }, '2Q': { lineup: { GK: 'A', ST: '키퍼' } },
        '3Q': { lineup: { GK: '키퍼', ST: 'A' } }, '4Q': { lineup: { GK: '키퍼', ST: 'A' } } },
        attendees: ['키퍼', 'A', 'B'], quarterCount: 4, onFieldSize: 2 });
    assert.notEqual(t3.status['키퍼'], 'gk');
});

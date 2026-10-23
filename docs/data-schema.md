# 데이터 스키마 v2 (Firebase Realtime Database)

Phase 0에서 정리한 구조. 쓰기는 항상 레코드 단위(`/matches/{id}`, `/roster/{name}`)로 하여
두 사람이 동시에 편집해도 서로의 레코드를 덮어쓰지 않는다.

```
/roster/{name}              선수 1명
/matches/{matchId}          경기 1건
/settings/venues            ["잠실유수지", "탄천유수지", ...]
/settings/editors/{emailKey}      편집 가능한 구글 계정 { email, name, addedAt, addedBy }
/settings/editorRequests/{uid}    편집 권한 요청 { email, name, requestedAt }
/settings/schemaVersion     2

emailKey = 소문자 이메일의 '.' 을 ',' 로 바꾼 값 (Firebase 키 제약). DB 규칙은 auth.token.email 을 같은 식으로 변환해 editors 에 있는지 검사한다 (README 3단계).
```

## 선수 `/roster/{name}`

```json
{
  "name": "주열",              // 표시 이름 = 키. 멤버는 두 글자, 용병은 보통 본명
  "fullName": "정주열",        // 본명 (없으면 null)
  "role": "member",           // "member" | "guest"
  "positions": ["RB", "GK"],  // 선호 포지션, 우선순위 순 (시트 P열 표기 그대로, 대문자)
  "jerseyNo": 4,              // 등번호 (없으면 null)
  "aliases": [],              // 기록에 쓰인 다른 표기 (예: 장재혁 → ["재혁"])
  "active": true              // 멤버의 현재 활동 여부 (명단 그룹 표시용)
}
```

## 경기 `/matches/{matchId}`

`matchId` = 경기 날짜 `YYYY-MM-DD`. 같은 날 두 경기면 `YYYY-MM-DD-b`, `-c` …

```json
{
  "id": "2026-10-17",
  "date": "2026-10-17",
  "venue": "세곡체육공원",
  "opponent": "세리에",
  "title": "세곡체육공원 vs 세리에",
  "timeSlot": "8-10시",          // 시트 제목의 시간 (선택)
  "notes": "",                   // 리그전 등 메모
  "type": "match",               // "match" | "intra"(자체전, 시즌 통계 제외)
  "status": "final",             // "final" | "draft"
  "quarterCount": 4,             // 4 또는 5
  "onFieldSize": 11,             // 쿼터당 출전 인원 (목표 쿼터 계산용)
  "attendees": ["우성", "형록", "..."],
  "availability": { "우성": ["1Q", "2Q", "3Q"] },   // 일부 쿼터만 참석하는 선수 (없으면 전 쿼터). 개인 목표 = 슬롯 × 가능 쿼터 ÷ 전원 가능 쿼터 합
  "quarters": {
    "1Q": {
      "formation": "4-2-3-1",
      "lineup": { "ST": "우성", "LW": "지호", "GK": "형록", "...": "..." },
      "coords": { "ST": { "left": 50, "top": 13 }, "...": {} },   // 카드 위치(%) — 시트 격자/드래그 위치
      "subs": [ { "in": "장재혁", "out": "지용", "pos": "LDM" } ]  // 교체 쌍. pos는 out 선수의 슬롯(없으면 null)
    },
    "2Q": { "...": "..." }
  },
  "scores": { "1Q": [1, 0], "2Q": [0, 1], "3Q": [2, 3], "4Q": [1, 1] },  // [우리, 상대]
  "scoresKnown": true,           // false면 스코어 미기록 (승/무/패 집계 제외)
  "stats": { "지호": { "goals": 1, "assists": 1 } },                      // 골/어시 합계 (이벤트 로그가 있으면 거기서 재계산)
  "events": [ { "quarter": "2Q", "type": "goal", "scorer": "지호", "assister": "진환" } ],
  "source": { "kind": "sheet", "sheet": "세곡체육공원(2026.10.17 토요일 8-10)" },  // "sheet" | "dashboard" | "app" | "app-v1"
  "updatedAt": "2026-10-23T02:33:54+00:00"
}
```

### 쿼터 참여 계산 (스프레드시트 수식과 동일)

```
쿼터 참여 = 보드(lineup)에 있으면 1
          − 그 쿼터 subs 의 in/out 에 등장할 때마다 0.5   (최소 0)
실 참여 쿼터 = 쿼터 참여 합
참여횟수(경기) = 실 참여 쿼터 > 0 인 경기 수
목표 쿼터 = onFieldSize × quarterCount / 참석자 수     (4Q 11명이면 44/N, 5Q면 55/N)
```

구현: `js/quota.js` (`Quota.quarterCredit`, `computeParticipation`, `computeTargets`) — 브라우저/Node 공용, 테스트는 `tests/quota.test.js`.
시트 쪽 동일 규칙: `participation()` (tools/import_sheet.py).

`quarterCount`(4|5)와 `onFieldSize`는 경기 정보에서 선택하며, 편집기는 그 수만큼 쿼터 보드·개요·기록 버튼을 만든다.

## v1 → v2 변환

- v1은 `/matches` 가 배열이었고 ID가 `날짜_장소_상대팀` 이었다. 앱은 배열을 만나면 메모리에서 v2로 변환해 읽기만 허용하고(`migrateLegacyMatch`), 저장은 이관 후에만 가능하다.
- `tools/import_sheet.py --upload` 가 `/roster`, `/matches`, `/settings/venues`, `/settings/schemaVersion` 을 v2로 덮어쓴다 (`--backup` 으로 기존 DB 스냅샷 저장).

## 로컬 확인 모드

`index.html?local=1` 로 열면 DB 대신 `data/import/*.json` 을 읽고, 쓰기는 콘솔에만 기록한다.
이관 결과를 업로드 전에 앱에서 미리 볼 때 사용한다.

```bash
python3 -m http.server 8765
# → http://localhost:8765/index.html?local=1
```

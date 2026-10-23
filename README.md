# ⚽ FC 바르자 팀 매니저 — 설정 가이드

> 저장소: **Firebase Realtime Database** (팀 전체 공유, 로그인 불필요)

---

## 한 번만 하는 초기 설정 (약 3분)

### 1단계: Firebase 프로젝트 만들기

1. [Firebase 콘솔](https://console.firebase.google.com/) 접속 (Google 계정 로그인)
2. **"프로젝트 추가"** 클릭 → 이름: `FC Barza` → 만들기

### 2단계: Realtime Database 생성

1. 왼쪽 메뉴 → **"빌드"** → **"Realtime Database"**
2. **"데이터베이스 만들기"**
3. 위치: 본인 가까운 곳 선택 (기본값 OK)
4. 보안 규칙 → **"테스트 모드에서 시작"** 선택 → **"사용 설정"**

### 3단계: 보안 규칙 수정 (읽기 공개 · 쓰기는 인증 필요)

Database 탭 → **"규칙"** 탭 → 아래 내용으로 교체 후 **"게시"**:

```json
{
  "rules": {
    ".read": true,
    ".write": "auth != null"
  }
}
```

> 누구나 **볼** 수 있지만, **쓰기**는 인증된 요청만 허용합니다. 앱이 자동으로 **익명 로그인**하여
> 쓰기 토큰을 얻으므로 팀원 개별 로그인은 필요 없습니다. (외부에서 주소만으로 데이터를 지우는 것을 막아줍니다.)

### 3.5단계: 익명 로그인 켜기 (쓰기에 필요)

**"빌드" → "Authentication" → "Sign-in method"** 탭 → **"익명(Anonymous)"** → **사용 설정** → 저장.

> 이걸 켜지 않으면 저장 시 "DB 쓰기 실패"가 납니다. (보기는 됨)

### 4단계: DB URL 복사 → config.js 에 붙여넣기

Database 탭 상단에 표시된 URL (`https://fc-barza-xxxxx-default-rtdb.firebaseio.com`) 을 복사하여  
`js/config.js` 파일을 열고:

```js
FIREBASE_DB_URL: 'https://fc-barza-xxxxx-default-rtdb.firebaseio.com',
```

---

## 데이터 구조 / 스프레드시트 이관

- DB 구조(v2)는 [docs/data-schema.md](docs/data-schema.md) 참고. 경기는 `/matches/{날짜}`, 선수는 `/roster/{이름}` 단위로 저장됩니다.
- 기존 팀 스프레드시트(경기 시트 + 대시보드)를 한 번에 가져오려면:

```bash
# 1) 구글 시트를 xlsx로 내려받기 (파일 > 다운로드 > Microsoft Excel)
# 2) 결과 미리보기 (data/import/ 에 JSON + report.md 생성)
python3 tools/import_sheet.py ~/Downloads/바르자.xlsx --out data/import
# 3) 앱에서 확인: python3 -m http.server 8765 → http://localhost:8765/index.html?local=1
# 4) 문제 없으면 업로드 (기존 DB는 data/import/backup-*.json 으로 백업)
python3 tools/import_sheet.py ~/Downloads/바르자.xlsx --out data/import --upload --backup
```

> `scipy`, `numpy` 필요 (`pip install scipy numpy`). `report.md` 에 대시보드 대조 결과·별칭 해석·포메이션 추정 내역이 정리됩니다.

## 쿼터 보장 계산 (js/quota.js)

스프레드시트 수식을 그대로 옮긴 순수 함수 모듈입니다. 경기 정보에서 **쿼터 수(4/5)** 와 **쿼터당 출전 인원**을 고르면
목표 쿼터 = 출전 인원 × 쿼터 수 ÷ 참석자 수 로 계산되고, 교체 In/Out 은 0.5쿼터로 차감됩니다.

```bash
node --test tests/*.test.js   # 시트의 실제 경기(2026.10.17)로 X열 값과 대조하는 테스트
```

## 앱 실행

```bash
python3 -m http.server 8080
```
→ 브라우저에서 `http://localhost:8080` 접속

---

## 팀과 공유하기

### GitHub Pages (추천)

1. 이 폴더를 GitHub 저장소에 업로드
2. Settings → Pages → Source: `main` 브랜치
3. 생성된 URL을 카카오톡 공유

> ✅ **팀원 누구나 별도 로그인 없이** 같은 URL에서 같은 데이터를 바로 **볼** 수 있습니다.

---

## 편집 권한 (공유 암호)

기록을 **보는 것**은 누구나 가능하지만, **수정·저장**은 공유 편집 암호로 잠겨 있습니다.

1. 앱 우측 상단 **"🔓 편집 잠금 해제"** 클릭
2. 처음이라면 → 팀에서 함께 쓸 **편집 암호를 설정**합니다 (DB에 안전하게 해시로 저장됨)
3. 이후엔 그 암호를 입력하면 **편집 모드**로 전환됩니다 (기기에 기억되어 다음부터 자동 유지)
4. 편집할 팀원에게 **카카오톡으로 암호를 공유**하면, 그 팀원도 똑같이 편집할 수 있습니다

> 🔑 암호 변경: **선수단 관리 → 편집 설정 → "편집 암호 변경"**. 변경하면 기존 암호로 해제했던 다른 기기는 다시 잠깁니다.
>
> ⚠️ 동작 방식: 앱이 자동으로 **익명 로그인**해서 DB 쓰기 토큰을 얻고(외부에서 주소만으로 무단 수정하는 것을 차단), 그 위에서 **공유 암호**가 "누가 편집 UI를 켜는지"를 제어합니다. 즉 암호는 팀원 간 *실수 방지*용 잠금입니다. 더 엄격히 막고 싶으면 팀원별 로그인(구글 등) + 이메일 기반 규칙으로 확장할 수 있습니다.

---

## 주요 기능

| 탭 | 기능 |
|---|---|
| 📋 당일 경기 운영 | 참석자 선택, 포메이션 배치(4종), 교체(In/Out) 기록, 쿼터 참여(교체 0.5)·목표 쿼터 자동 계산, 실시간 골/스코어 기록, 임시/확정 저장 |
| 📈 시즌 스탯 | 승/무/패, 쿼터별 득실, 골/도움/공격포인트/출석·총 쿼터 리더보드, CSV 다운로드 |
| 📚 기록 조회 & 수정 | 경기 목록, 포메이션 이미지(4·5쿼터), 교체 내역, 명단·쿼터, 수정, 삭제 |
| 👥 선수단 관리 | 멤버/용병 등록, 본명·선호 포지션·등번호·별칭 편집, 활동 여부 |

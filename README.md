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

### 3단계: 보안 규칙 수정 (기간 만료 방지)

Database 탭 → **"규칙"** 탭 → 아래 내용으로 교체 후 **"게시"**:

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

### 4단계: DB URL 복사 → config.js 에 붙여넣기

Database 탭 상단에 표시된 URL (`https://fc-barza-xxxxx-default-rtdb.firebaseio.com`) 을 복사하여  
`js/config.js` 파일을 열고:

```js
FIREBASE_DB_URL: 'https://fc-barza-xxxxx-default-rtdb.firebaseio.com',
```

---

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

> ✅ **팀원 누구나 별도 로그인 없이** 같은 URL에서 같은 데이터를 바로 사용할 수 있습니다.

---

## 주요 기능

| 탭 | 기능 |
|---|---|
| 📋 당일 경기 운영 | 참석자 선택, 포메이션 배치(4종), 출전시간 균형, 실시간 골/스코어 기록·수정, 임시/확정 저장 |
| 📈 시즌 스탯 | 골/도움/출석 리더보드, CSV 업로드·다운로드 |
| 📚 기록 조회 & 수정 | 경기 목록, 포메이션 이미지, 수정, 삭제 |
| 👥 선수단 관리 | 멤버 추가·삭제, 용병↔멤버 전환 |

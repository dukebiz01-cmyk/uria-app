# URIA — 라이브 개발 가이드

## 내 URL: https://[계정명].github.io/uria-app

---

## 처음 한 번만: GitHub Pages 활성화 (3분)

1. github.com 접속 → 새 레포지토리 생성
   - 이름: `uria-app`
   - Public 선택
   - Create repository

2. 이 폴더 파일 전체 업로드
   - "uploading an existing file" 클릭
   - 파일 전체 드래그앤드롭
   - Commit changes

3. Pages 활성화
   - Settings → Pages
   - Source: **GitHub Actions** 선택
   - Save

4. 2분 후 자동 배포 완료
   - Actions 탭에서 진행 확인
   - URL: `https://[계정명].github.io/uria-app`

---

## 이후 수정 방법 (반복)

### 방법 A: GitHub 웹에서 직접 수정 (코드 몰라도 됨)
1. github.com/[계정]/uria-app
2. `index.html` 클릭 → 연필 아이콘(Edit)
3. 수정 → Commit changes
4. 2분 후 URL 자동 업데이트

### 방법 B: Claude에게 수정 요청
Claude에게 "홈 화면에 ~~ 추가해줘" 요청
→ 수정된 index.html 받기
→ GitHub에서 파일 교체
→ 2분 후 반영

---

## 수정 → 배포 전체 흐름

```
Claude가 코드 수정
       ↓
index.html 다운로드
       ↓
GitHub에서 파일 교체
       ↓
GitHub Actions 자동 실행 (2분)
       ↓
https://[계정].github.io/uria-app 업데이트
       ↓
폰에서 확인
```

---

## 모바일 앱처럼 설치하기 (PWA)

Chrome에서 URL 접속 →
주소창 우측 메뉴(⋮) →
"앱 설치" 또는 "홈 화면에 추가" →
아이콘으로 실행 가능

---

## 백엔드 연결 시 수정할 곳 (index.html)

```javascript
// [1] ⚙️ CONFIG 부분에서
const FIREBASE_CONFIG = {
  apiKey: "여기에 Firebase 키",
  // ...
};
const CLAUDE_API_KEY = "여기에 Claude API 키";
```

---

## 개발 단계별 URL

| 단계 | URL | 용도 |
|------|-----|------|
| 지금 | github.io/uria-app | UI 테스트 + 데모 |
| 2주 후 | uria-api.onrender.com | 실제 백엔드 |
| 출시 | uria.app (도메인 구입) | 프로덕션 |

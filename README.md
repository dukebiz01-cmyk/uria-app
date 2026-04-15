# URIA — You Really Into Available?

> 어른들의 솔직한 인스턴트 만남

모노레포 구성: 웹앱(루트) + 백엔드(`/backend`)

---

## 📁 구조

```
uria-app/
├── index.html, styles.css, app.js, config.js   ← 웹앱 (PWA)
├── service-worker.js, manifest.json
├── icon-192.png, icon-512.png
├── render.yaml                                   ← Render Blueprint
├── backend/
│   ├── src/                                      ← 11개 모듈
│   │   ├── modules/
│   │   │   ├── auth, users, match, signals
│   │   │   ├── chat (WebSocket), moments
│   │   │   ├── coins, passport, reputation
│   │   │   └── reports, admin
│   │   ├── services/  (wallet, fcm, portone, passport.calculator, reputation.calculator)
│   │   └── jobs/      (signalExpiry, momentExpiry)
│   ├── db/migrations/  ← 14개 SQL
│   └── package.json
└── .github/workflows/
    ├── deploy-pages.yml   ← 웹앱 → GitHub Pages
    └── deploy-backend.yml ← 백엔드 → Render
```

---

## 🚀 배포

### 1단계 — 웹앱 (GitHub Pages)
```
1. 이 폴더 전체를 dukebiz01-cmyk/uria-app에 push
2. Settings → Pages → Source: GitHub Actions
3. 5분 후 → https://dukebiz01-cmyk.github.io/uria-app
```

### 2단계 — 백엔드 (Render)
```
1. render.com → New → Blueprint
2. uria-app 레포 선택 → render.yaml 자동 감지
3. Apply → Singapore 리전, Postgres + Redis 자동 생성
4. Shell에서: cd backend && node db/migrate.js
5. /health 확인: https://uria-api.onrender.com/health
```

### 3단계 — 연결
```
config.js 수정:
  MODE: 'demo' → 'live'
  API_BASE: 'https://uria-api.onrender.com/api'
git push → Pages 자동 재배포
```

---

## 💰 SAFE BET 코인 흐름

| 이벤트 | 코인 변동 |
|--------|----------|
| Signal 전송 | -3 (에스크로 hold) |
| Signal 수락 | 0 (변동 없음) |
| Moment 완료 | +1 환불 (순비용 2C) |
| 거절/만료 | +3 전액 환불 |

**여성 보상**: Signal 수락 +10pt · Moment 검증 +50pt

---

## 🎯 핵심 도메인

| 개념 | 설명 |
|------|------|
| **Signal** | 매칭 신호 (3코인 에스크로, 12시간 만료) |
| **Moment** | 실제 만남 (GPS 체크인 30분 윈도우) |
| **Passport** | 여성 신뢰점수 (`37~45°C` 등 온도 표현) |
| **Reputation** | 남성 평판점수 (모멘트/노쇼 기반) |
| **Tonight Mode** | 18:00~24:00 활성화 |

---

## 🔐 외부 연동 (환경변수)

- **KMC PASS** — 실명 OTP
- **PortOne** — 결제
- **Firebase FCM** — 푸시
- **AWS S3** — 사진/셀카

자세한 키 설정: `GITHUB_SECRETS.md` 참조

---

## ⚠️ Phase 2 TODO

- [ ] PortOne 실결제 E2E
- [ ] KMC PASS 실 OTP 연동
- [ ] WebSocket 실시간 채팅
- [ ] FCM 푸시 실기기 검증
- [ ] 관리자 MOMENT 검토 UI
- [ ] React Native 네이티브 빌드 환경

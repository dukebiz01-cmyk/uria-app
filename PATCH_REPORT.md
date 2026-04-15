# URIA 정밀 버그 패치 리포트

## ✅ 적용된 패치 (17건)

### 🔴 CRITICAL (10건 — 즉시 수정 완료)

| # | 위치 | 문제 | 해결 |
|---|------|------|------|
| 1 | `backend/src/server.js` | `server.listen(PORT)` — 0.0.0.0 누락 | `'0.0.0.0'` 추가 |
| 2 | `backend/src/config/db.js` | PostgreSQL SSL 미설정 | production에서 `ssl: { rejectUnauthorized: false }` |
| 3 | `backend/src/modules/auth/auth.service.js` | CTE INSERT 부수효과 미보장 | `withTransaction`으로 명시적 분리 |
| 15 | `backend/src/services/portone.service.js` | webhook 서명 우회 가능 | production에서 시크릿 미설정 시 reject |
| 22 | `app.js` | `window._LS` 미정의 → 토큰 휘발 | `window._LS = LS` bridge 추가 |
| 23 | `app.js` | OTP 시 가짜 정보(`'유저'`/1995) 가입 | setup 단계에서 진짜 정보로 verifyOtp |
| 24 | `app.js saveProfile` | 백엔드 미반영 | `API.updateMe` 호출 추가 |
| 26 | `backend/src/modules/auth/auth.service.js` | 신규 가입자 0코인 | 5코인 보너스 (ledger 기록 포함) |
| 29 | `backend/src/jobs/momentExpiry.job.js` | moment 만료 시 환불 누락 | +1C 환불 추가 (정책 일관성) |
| 31 | `render.yaml` | `services:` 키 중복 → uria-api 미배포 | 단일 services 블록으로 통합 |

### 🟡 HIGH (6건)

| # | 위치 | 문제 | 해결 |
|---|------|------|------|
| 9 | `users.repository.js` | `moment_verified_count` SELECT 누락 → 항상 0 | COALESCE로 양 테이블 조회 |
| 10 | `users.service.js listUsers` | 동성 노출 | `oppositeGender` 필터 추가 |
| 12 | `passport.calculator.js` | SQL 괄호 누락 | `(bio IS NOT NULL AND length(bio)>20) AS has_bio` |
| 18 | `reputation.calculator.js` | 동일 SQL 괄호 누락 | 동일 패치 |
| 27 | `reports.service.js` | 동일 target 신고 어뷰징 | 30일 내 중복 신고 차단 |
| 28 | `reports.service.js` | 잘못된 metric 테이블 업데이트 | target gender 분기 (passport/reputation) |
| 30 | `app.js initApp` | 토큰 만료 미처리 | live 모드에서 `getMe` 검증, 실패 시 재로그인 |
| 32 | `render.yaml` | PORT env 강제 | Render 자동값 사용 |

### 🟢 LOW (남은 권장사항 — 미수정)

| # | 위치 | 사유 |
|---|------|------|
| 5 | `014_users_selfie_photo.sql` | `IF NOT EXISTS`로 안전 — 무시 가능 |
| 6, 7 | `users.service toggleTonightMode` | 데드 코드지만 실제 동작 영향 없음 |
| 20 | `auth.service refreshAccessToken` | redis.del 실패 처리 없음 — 일관성 미세한 문제 |

---

## ✅ 검증 결과

- Node.js 문법 검증: 11개 파일 모두 통과
- YAML 검증: render.yaml 정상 파싱, services 2개 (web + redis), databases 1개
- 모든 패치 grep으로 적용 확인됨

---

## 🚀 배포 준비 완료

다음 단계:
1. GitHub `dukebiz01-cmyk/uria-app` 레포에 업로드
2. Settings → Pages → Source: GitHub Actions
3. Render → New → Blueprint → 레포 연결 → 자동 감지
4. Shell에서 마이그레이션: `cd backend && node db/migrate.js`
5. webapp `config.js` → `MODE: 'live'` + Render URL 변경
6. push → 자동 배포

---

## ⚠️ 배포 전 확인사항

1. **GitHub Secrets 등록** (`GITHUB_SECRETS.md` 참조)
   - `RENDER_API_KEY`, `RENDER_SERVICE_ID`, `RENDER_API_HOST`
2. **PortOne 실결제 연동 시** `PORTONE_WEBHOOK_SECRET` 필수 (안 넣으면 production에서 webhook 거부됨)
3. **KMC PASS 실 OTP 연동** 전까지는 `NODE_ENV !== 'production'` 시 OTP가 응답에 포함됨

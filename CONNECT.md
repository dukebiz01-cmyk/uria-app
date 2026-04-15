# URIA End-to-End 연결 가이드

## 1단계: 백엔드 Render 배포

render.com → New → Blueprint → uria-app 레포 연결 → render.yaml 감지 → Apply

필수 환경변수 설정:
```
JWT_ACCESS_SECRET   = (32자 이상 랜덤)
JWT_REFRESH_SECRET  = (32자 이상 랜덤)
ADMIN_SECRET        = (16자 이상)
```

배포 후 Shell에서:
```
node migrate.js
```

배포 완료 URL: https://uria-api.onrender.com

## 2단계: 백엔드 연결 확인

브라우저에서:
```
https://uria-api.onrender.com/health
```
→ {"status":"ok"} 나오면 성공

## 3단계: 프론트 config.js 수정

config.js 첫 줄:
```js
MODE: 'live',   // 'demo' → 'live'
```

## 4단계: GitHub에 올리기

uria-split 폴더 전체를 dukebiz01-cmyk/uria-app 에 업로드
→ 2분 후 자동 배포

## E2E 플로우 테스트 순서

### 1. 로그인
- 전화번호 입력 → 인증번호 받기
- 데모: OTP 123456 입력
- 라이브: 실제 문자 (KMC 연동 전까지 콘솔 확인)

### 2. Tonight Mode
- Home → Tonight 토글 ON
- 오후 6시~자정 시간 제약 (live 모드)
- 주변 유저 리스트 로드

### 3. Signal 전송
- List → 유저 선택 → Signal 작성
- 3C 에스크로 차감 확인
- /api/signals POST 호출

### 4. Signal 수락 (SAFE BET)
- 받은 Signal → 수락
- 1C 확정 (추가 차감 없음)
- 채팅방 생성 확인

### 5. Moment
- Moment 화면 → GPS 체크인
- 양측 확인 → 완료
- +1C 환불 (순 비용 2C 확인)

### 6. Passport (°C)
- °C 탭 → 여성: Trust Score 업데이트
- 남성: Score + 온도 레벨 확인

## API 매핑 요약

| 프론트 호출 | 백엔드 라우트 |
|------------|--------------|
| API.requestOtp | POST /api/auth/request-otp |
| API.verifyOtp | POST /api/auth/verify-otp |
| API.getMe | GET /api/users/me |
| API.toggleTonight | POST /api/users/me/tonight |
| API.getNearby | POST /api/match/list |
| API.getWallet | GET /api/coins/balance |
| API.sendSignal | POST /api/signals |
| API.respondSignal | POST /api/signals/:id/respond |
| API.createMoment | POST /api/moments |
| API.checkinMoment | POST /api/moments/:id/checkin |
| API.reviewMoment | POST /api/moments/:id/review |
| API.getPassport | GET /api/passport/me |
| API.getReputation | GET /api/reputation/me |

## 아직 미연결 (Phase 2)

- WebSocket 실시간 채팅 (/ws/chat/:roomId)
- FCM 푸시 알림
- KMC PASS 실 OTP
- PortOne 실결제

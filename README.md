# URIA — 구조 분리 버전

## 파일 구조
```
index.html        — HTML 셸
styles.css        — 전체 CSS
app.js            — 앱 로직 (XSS 방어, API 연결)
config.js         — 설정 + API 클라이언트 (데모/라이브 분리)
service-worker.js — PWA 앱셸 캐싱
manifest.json     — PWA 설정 (상대경로 수정)
```

## 모드 전환
config.js에서 `MODE: 'demo'` → `MODE: 'live'`로 변경 후
`API_BASE`를 실제 Render URL로 수정

## SAFE BET 코인 흐름 (사양 기준)
- Signal 전송: -3C 에스크로
- 수락 시: 1C 확정 (추가 차감 없음)
- Moment 완료: +1C 환불 → 순 비용 2C
- 거절/만료: +3C 전액 환불

## 보안
- 브라우저에서 Firebase/Claude 비밀키 직접 사용 없음
- AI 채팅은 백엔드 프록시 경유 (live 모드)
- XSS: 모든 렌더링에 esc() 함수 적용

## Tonight Mode
- 오후 6시~자정만 활성화 (live 모드)
- demo 모드에서는 시간 제약 없음

## GitHub Pages 배포
1. 이 폴더 내용을 GitHub 레포에 업로드
2. Settings → Pages → GitHub Actions
3. push 시 자동 배포

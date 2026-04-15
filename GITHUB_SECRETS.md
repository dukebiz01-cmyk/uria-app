# URIA — GitHub Secrets 설정 가이드
# GitHub → Settings → Secrets and variables → Actions → New repository secret

## 필수 Secrets

| 이름 | 값 | 어디서 |
|------|----|--------|
| `RENDER_API_KEY` | Render API 키 | render.com → Account Settings → API Keys |
| `RENDER_SERVICE_ID` | 서비스 ID | Render 대시보드 → 서비스 → URL에서 확인 |
| `RENDER_API_HOST` | 배포된 API 호스트 | 예: `uria-api.onrender.com` |

## APK 서명용 Secrets (Google Play 제출 시)

| 이름 | 값 |
|------|----|
| `KEYSTORE_B64` | 키스토어 파일 base64 인코딩 |
| `KEY_ALIAS` | 키 별칭 (예: `uria-key`) |
| `KEY_PASSWORD` | 키 비밀번호 |
| `STORE_PASSWORD` | 키스토어 비밀번호 |

### 키스토어 생성 방법
```bash
keytool -genkey -v \
  -keystore uria-release.jks \
  -alias uria-key \
  -keyalg RSA -keysize 2048 \
  -validity 10000

# Base64 변환 (Mac)
base64 -i uria-release.jks | pbcopy

# Base64 변환 (Linux)
base64 uria-release.jks | xclip -selection clipboard
```

## 사용 방법
1. GitHub 레포 → Settings → Secrets and variables → Actions
2. "New repository secret" 클릭
3. 위 표의 이름과 값 입력

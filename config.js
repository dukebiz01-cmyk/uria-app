// Storage 안전 래퍼 (config.js용)
const _cfgMem = {};
const _LS = {
  get(k)   { try { return window._LS.get(k); }    catch { return _cfgMem[k]??null; } },
  set(k,v) { try { window._LS.set(k,v); }          catch { _cfgMem[k]=v; } },
  del(k)   { try { window._LS.del(k); }         catch { delete _cfgMem[k]; } },
};
/**
 * URIA config.js v2
 * MODE: 'demo' → localStorage mock
 * MODE: 'live' → Render 백엔드 실제 연결
 *
 * 백엔드 실제 라우트 (uria-complete 기준):
 *   POST /api/auth/request-otp
 *   POST /api/auth/verify-otp
 *   POST /api/auth/refresh
 *   POST /api/auth/logout
 *   GET  /api/users/me
 *   PATCH /api/users/me
 *   POST /api/users/me/tonight
 *   POST /api/users/me/push-token
 *   GET  /api/users/nearby
 *   POST /api/match/list          ← 추가된 편의 라우트
 *   GET  /api/coins/balance
 *   GET  /api/coins/ledger
 *   POST /api/coins/purchase
 *   POST /api/signals
 *   GET  /api/signals
 *   GET  /api/signals/:id
 *   POST /api/signals/:id/respond
 *   POST /api/signals/:id/cancel
 *   POST /api/moments
 *   POST /api/moments/:id/checkin
 *   POST /api/moments/:id/review
 *   GET  /api/passport/:userId
 *   GET  /api/passport/me         ← 추가된 편의 라우트
 *   GET  /api/reputation/me       ← 추가된 편의 라우트
 *   POST /api/reports
 */

const URIA_CONFIG = {
  MODE: 'demo',  // 'demo' | 'live'

  // Render 배포 후 이 URL로 변경
  API_BASE: 'https://uria-api.onrender.com/api',

  TONIGHT_START: 18,
  TONIGHT_END:   24,

  // SAFE BET (사양 기준)
  SIGNAL_ESCROW_COINS: 3,   // hold
  SIGNAL_ACCEPT_COST:  1,   // 수락 시 확정 (추가 차감 없음 — 에스크로 내)
  MOMENT_COST:         1,   // moment 완료 시 추가 확정
  MAX_REAL_COST:       2,   // 최대 실제 비용
  SIGNAL_EXPIRY_HOURS: 12,
};

// ── API 클라이언트 ─────────────────────────────────────
const API = {
  _token: null,
  setToken(t)  { this._token = t; _LS.set('uria_token',t); },
  getToken()   { return this._token || _LS.get('uria_token'); },
  clearToken() { this._token = null; _LS.del('uria_token'); },

  async _fetch(method, path, body) {
    if (URIA_CONFIG.MODE === 'demo') {
      const mock = DEMO_API[method + ':' + path] || DEMO_API[path];
      if (mock) return typeof mock === 'function' ? mock(body) : mock;
      return { ok: true };
    }
    const res = await fetch(URIA_CONFIG.API_BASE + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(this.getToken() ? { Authorization: `Bearer ${this.getToken()}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `HTTP ${res.status}`);
    }
    const data = await res.json();
    return data.data ?? data;
  },

  get:   (path)       => API._fetch('GET',   path),
  post:  (path, body) => API._fetch('POST',  path, body),
  put:   (path, body) => API._fetch('PUT',   path, body),
  patch: (path, body) => API._fetch('PATCH', path, body),

  // ── 인증 ──────────────────────────────────────────
  requestOtp:   (phone)        => API.post('/auth/request-otp', { phone }),
  verifyOtp:    (phone, otp, p) => API.post('/auth/verify-otp', { phone, otp, ...p }),
  refreshToken: (token)        => API.post('/auth/refresh', { refresh_token: token }),
  logout:       (token)        => API.post('/auth/logout',  { refresh_token: token }),

  // ── 유저 ──────────────────────────────────────────
  getMe:         ()       => API.get('/users/me'),
  updateMe:      (body)   => API.patch('/users/me', body),
  toggleTonight: (active) => API.post('/users/me/tonight', { active }),
  registerPushToken: (body) => API.post('/users/me/push-token', body),

  // ── 매칭 ──────────────────────────────────────────
  getNearby: (params) => API.post('/match/list', params),

  // ── 코인/크레딧 ────────────────────────────────────
  getWallet:  ()     => API.get('/coins/balance'),
  getLedger:  ()     => API.get('/coins/ledger'),
  purchase:   (body) => API.post('/coins/purchase', body),

  // ── Signal ────────────────────────────────────────
  sendSignal:    (body)       => API.post('/signals', body),
  listSignals:   (dir)        => API.get(`/signals?direction=${dir}`),
  getSignal:     (id)         => API.get(`/signals/${id}`),
  respondSignal: (id, action) => API.post(`/signals/${id}/respond`, { action }),
  cancelSignal:  (id)         => API.post(`/signals/${id}/cancel`),

  // ── Moment ────────────────────────────────────────
  createMoment:  (signal_id)  => API.post('/moments', { signal_id }),
  checkinMoment: (id, coords) => API.post(`/moments/${id}/checkin`, coords),
  reviewMoment:  (id, body)   => API.post(`/moments/${id}/review`, body),

  // ── Passport / Reputation ────────────────────────
  getPassport:   () => API.get('/passport/me'),
  getReputation: () => API.get('/reputation/me'),

  // ── 신고 ──────────────────────────────────────────
  report: (body) => API.post('/reports', body),
};

// ── Demo Mock ─────────────────────────────────────────
const DEMO_API = {
  '/auth/request-otp': (b) => ({ message: 'OTP sent', otp: '123456' }),

  '/auth/verify-otp': (b) => {
    const user = {
      id: 'demo_' + Date.now(),
      nickname: b.nickname || '데모유저',
      gender: b.gender || 'M',
      birth_year: b.birth_year || 1995,
      coin_balance: 30,
    };
    _LS.set('uria_user',JSON.stringify(user));
    _LS.set('uria_token','demo_token');
    return { access_token: 'demo_token', is_new_user: false, user };
  },

  '/users/me': () => JSON.parse(_LS.get('uria_user') || 'null'),

  '/coins/balance': () => {
    const u = JSON.parse(_LS.get('uria_profile') || '{}');
    return { coin_balance: u.coins ?? 30, point_balance: u.points ?? 0 };
  },

  '/match/list': () => ({
    items: [
      { id:'u1', nickname:'J', age:'31세', distance_m:1200, trust_score:94, available:'오늘 저녁 가능' },
      { id:'u2', nickname:'S', age:'29세', distance_m:1800, trust_score:87, available:'밤 10시까지' },
      { id:'u3', nickname:'Y', age:'33세', distance_m:2300, trust_score:81, available:'오늘 자정까지' },
      { id:'u4', nickname:'M', age:'27세', distance_m:3100, trust_score:76, available:'저녁 가능' },
    ],
    total: 4,
  }),

  '/passport/me': () => ({
    trust_score: 62, tier: '37~45°C',
    response_rate: 85, moment_count: 3,
    pledge_rate: 90, report_count: 0,
    points_this_week: 180,
  }),

  '/reputation/me': () => ({
    score: 104, level: '46~60°C',
    no_show_rate: 100, moment_count: 3, report_count: 0,
  }),

  '/signals': () => ({ items: [], pagination: { has_more: false } }),

  'POST:/signals': (b) => ({ id: 'sig_' + Date.now(), status: 'pending', ...b }),

  'POST:/moments': (b) => ({ id: 'mom_' + Date.now(), status: 'pending', signal_id: b.signal_id }),
};

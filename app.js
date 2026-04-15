/**
 * URIA App — app.js v3 (통합본)
 * XSS 방어 | SAFE BET 2C | °C 온도 | 실시간 타이머 | GPS 거리 | 데모/라이브
 */
'use strict';

const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── 유틸 ────────────────────────────────────────────
function formatDist(km) {
  if (km == null) return '—';
  return km < 1 ? Math.round(km * 1000) + 'm' : km.toFixed(1) + 'km';
}
function haversine(lat1,lon1,lat2,lon2) {
  const R=6371, dLat=(lat2-lat1)*Math.PI/180, dLon=(lon2-lon1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function getAvatarColor(name) {
  const c=['#6d28d9','#0e7490','#92400e','#065f46','#7c2d12','#1e3a8a','#5b21b6'];
  return name ? c[name.charCodeAt(0)%c.length] : c[0];
}
function getRelativeDate(d){ const dt=new Date(); dt.setDate(dt.getDate()-d); return `${dt.getMonth()+1}/${dt.getDate()}`; }
function formatPhone(input){ let v=input.value.replace(/\D/g,''); if(v.startsWith('0'))v=v.slice(1); input.value=v.replace(/(\d{2,3})(\d{3,4})(\d{4})/,'$1-$2-$3'); }
function showLoading(show){ const el=document.getElementById('loading'); if(el)el.style.display=show?'flex':'none'; }
function countMsg(el){ const c=document.getElementById('sig-cnt'); if(c)c.textContent=el.value.length+'/20'; }
function isTonightHour(){ const h=new Date().getHours(); return h>=URIA_CONFIG.TONIGHT_START&&h<URIA_CONFIG.TONIGHT_END; }

// ── 상태 ────────────────────────────────────────────
const state = { user:null,profile:null,tonight:false,coins:0,points:0,matches:[],signals:[],selectedMatch:null,location:null,devMode:false };

// ── 데모 데이터 ──────────────────────────────────────
const DEMO_MATCHES = [
  { id:'u1',nick:'J',age:'31세',dist:1.2,trustScore:94,available:'오늘 저녁 가능',color:'#6d28d9' },
  { id:'u2',nick:'S',age:'29세',dist:1.8,trustScore:87,available:'밤 10시까지',color:'#0e7490' },
  { id:'u3',nick:'Y',age:'33세',dist:2.3,trustScore:81,available:'오늘 자정까지',color:'#92400e' },
  { id:'u4',nick:'M',age:'27세',dist:3.1,trustScore:76,available:'저녁 가능',color:'#065f46' },
];
const DEMO_SIGNALS = [
  { id:'s1',sender:{nickname:'K',age:32},message:'오늘 저녁 어때요?',coin_hold:3 },
];

// ── 초기화 ──────────────────────────────────────────
async function initApp() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
  startClock(); startMarketTimer();
  const saved = loadProfileLocal();
  if (saved) { state.profile=saved; state.coins=saved.coins||0; enterApp(); return; }
  goScreen('screen-splash');
}

function enterApp() { document.getElementById('nav').style.display='flex'; goScreen('screen-home'); renderHome(); getLocation(); }

// ── 화면 전환 ────────────────────────────────────────
const NAV_MAP = { 'screen-home':'n-home','screen-ai':'n-ai','screen-market':'n-market','screen-list':'n-market','screen-passport':'n-pp','screen-rep':'n-pp','screen-settings':'n-settings','screen-signal':'n-home','screen-moment':'n-home' };

function goScreen(id) {
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
  document.querySelectorAll('.ni').forEach(n=>n.classList.remove('on'));
  const nid=NAV_MAP[id]; if(nid) document.getElementById(nid)?.classList.add('on');
  if(id==='screen-home')renderHome();
  if(id==='screen-list')renderList();
  if(id==='screen-passport')renderPassport();
  if(id==='screen-rep')renderReputation();
  if(id==='screen-market')renderMarket();
  if(id==='screen-settings')renderSettings();
  if(id==='screen-ai')initChat();
}
function goBack(){ goScreen('screen-home'); }
function goPP(){
  document.getElementById('n-pp-lbl').textContent='°C';
  goScreen((state.profile?.gender||'M')==='f'?'screen-passport':'screen-rep');
}

// ── 인증 ────────────────────────────────────────────
async function sendOTP() {
  const raw=document.getElementById('phone-input').value.replace(/\D/g,'');
  if(raw.length<10)return showToast('전화번호를 입력해주세요');
  const btn=document.getElementById('send-otp-btn'); btn.disabled=true; btn.textContent='전송 중...'; showLoading(true);
  try {
    const res=await API.requestOtp('0'+raw);
    if(URIA_CONFIG.MODE==='demo')showToast(`[데모] OTP: ${res.otp}`); else showToast('인증번호가 발송됐습니다');
    state._phone='0'+raw; document.getElementById('otp-section').style.display='block';
    document.querySelector('.otp-digit')?.focus();
  } catch(e){ showToast(e.message||'전송 실패'); }
  finally{ btn.disabled=false; btn.textContent='인증번호 받기'; showLoading(false); }
}
function otpInput(el,idx) {
  if(el.value.length===1){ const next=document.querySelectorAll('.otp-digit')[idx+1]; if(next)next.focus(); }
  const all=Array.from(document.querySelectorAll('.otp-digit')).map(i=>i.value).join('');
  if(all.length===6)verifyOTP(all);
}
async function verifyOTP(code) {
  if(!code)code=Array.from(document.querySelectorAll('.otp-digit')).map(i=>i.value).join('');
  if(code.length!==6)return showToast('6자리 인증번호를 입력해주세요');
  showLoading(true);
  try {
    const res=await API.verifyOtp(state._phone,code,{gender:'M',birth_year:1995,nickname:'유저'});
    API.setToken(res.access_token); state.user=res.user;
    goScreen('screen-onboarding');
  } catch(e){ showToast(e.message||'인증 실패'); }
  finally{ showLoading(false); }
}
function selectGender(g){
  state._gender=g;
  document.querySelectorAll('.gender-btn').forEach(b=>b.classList.remove('sel'));
  document.getElementById('g-'+g)?.classList.add('sel');
}
async function saveProfile(){
  const nick=document.getElementById('nick-input')?.value.trim();
  if(!nick)return showToast('닉네임을 입력해주세요');
  const by=parseInt(document.getElementById('birth-input')?.value)||1995;
  showLoading(true); await sleep(600);
  state.profile={nick,gender:state._gender||'M',birth_year:by,coins:10,trustScore:0,momentCount:0,responseRate:100,repScore:65};
  state.coins=10; saveProfileLocal(); showLoading(false); enterApp();
}
function devBypass(){
  state.devMode=true;
  state.profile={nick:'Dev',gender:'M',birth_year:1995,coins:47,trustScore:62,momentCount:3,responseRate:88,repScore:104,reportCount:0};
  state.coins=47; saveProfileLocal(); enterApp();
}
function saveProfileLocal(){ try{ localStorage.setItem('uria_profile',JSON.stringify(state.profile)); }catch{} }
function loadProfileLocal(){ try{ return JSON.parse(localStorage.getItem('uria_profile')||'null'); }catch{ return null; } }

// ── 지갑 ────────────────────────────────────────────
async function loadWallet(){
  try{ const w=await API.getWallet(); state.coins=w.coin_balance??0; state.points=w.point_balance??0; if(state.profile)state.profile.coins=state.coins; updateCoinsUI(); }catch{}
}
function updateCoinsUI(){
  document.querySelectorAll('.coin-display').forEach(el=>el.textContent=state.coins+'C');
  const sc=document.getElementById('settings-coins'); if(sc)sc.textContent=`잔액 ${state.coins}C`;
}

// ── GPS ─────────────────────────────────────────────
function getLocation(){
  if(!navigator.geolocation)return;
  navigator.geolocation.getCurrentPosition(pos=>{ state.location={lat:pos.coords.latitude,lng:pos.coords.longitude}; updateDistances(); },()=>{},{timeout:8000,maximumAge:60000});
}
function updateDistances(){
  if(!state.location)return;
  state.matches=state.matches.map(m=>({...m,dist:m.lat&&m.lng?haversine(state.location.lat,state.location.lng,m.lat,m.lng):m.dist}));
}

// ── 타이머 ──────────────────────────────────────────
function startClock(){
  const tick=()=>{ const n=new Date(); const t=n.getHours().toString().padStart(2,'0')+':'+n.getMinutes().toString().padStart(2,'0'); ['home-clk','home-time'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent=t;}); };
  tick(); setInterval(tick,10000);
}
function startMarketTimer(){
  const upd=()=>{ const n=new Date(),h=n.getHours(),m=n.getMinutes(),live=isTonightHour(); let s; if(live){const r=(URIA_CONFIG.TONIGHT_END-h-1)*60+(60-m);s=Math.floor(r/60).toString().padStart(2,'0')+':'+((r%60)).toString().padStart(2,'0');}else{s=h<URIA_CONFIG.TONIGHT_START?(URIA_CONFIG.TONIGHT_START-h)+'시간 후':'내일 6PM';} ['mkt-timer','market-timer'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent=s;}); };
  upd(); setInterval(upd,30000);
}

// ── Tonight ──────────────────────────────────────────
async function toggleTonight(){
  if(URIA_CONFIG.MODE==='live'&&!isTonightHour()){ showToast(`Tonight Mode는 오후 ${URIA_CONFIG.TONIGHT_START}시~자정만 이용 가능합니다`); return; }
  state.tonight=!state.tonight;
  document.getElementById('tonight-sw')?.classList.toggle('on',state.tonight);
  document.getElementById('tonight-toggle')?.classList.toggle('on',state.tonight);
  const sub=document.getElementById('tonight-sub'); if(sub)sub.textContent=state.tonight?'지금 가능한 사람들과 연결 중':'오늘 가능한 사람들과 연결';
  document.getElementById('app')?.classList.toggle('tonight-on',state.tonight);
  document.body.classList.toggle('tonight-on',state.tonight);
  document.querySelector('meta[id="theme-color-meta"]')?.setAttribute('content',state.tonight?'#0c0c0e':'#ffffff');
  if(state.tonight)await loadMatches(); else state.matches=[];
  try{ await API.toggleTonight(state.tonight); }catch{}
  showToast(state.tonight?'Tonight Mode ON — 매칭 시작!':'Tonight Mode OFF');
  renderHome();
}

// ── 홈 ──────────────────────────────────────────────
async function renderHome(){
  updateCoinsUI();
  const a=state.tonight?state.matches.length:0;
  if(document.getElementById('stat-active'))document.getElementById('stat-active').textContent=state.tonight?a:'—';
  if(document.getElementById('stat-dist'))document.getElementById('stat-dist').textContent=state.tonight?'2.1':'—';
  if(document.getElementById('stat-new'))document.getElementById('stat-new').textContent=state.tonight?Math.max(1,Math.floor(a*0.6)):'—';
  const ls=document.getElementById('list-count-sub'); if(ls)ls.textContent=state.tonight?`${a}명 주변`:'주변 추천';
  renderIncomingSignals();
}

function renderIncomingSignals(){
  const c=document.getElementById('signal-list'); if(!c)return;
  const sigs=state.signals.length?state.signals:(state.devMode?DEMO_SIGNALS:[]);
  if(!sigs.length){ c.innerHTML=`<div class="empty-state"><div class="empty-icon">→</div><div class="empty-title">받은 Signal이 없어요</div><div class="empty-sub">Tonight Mode를 켜면 Signal이 도착합니다</div></div>`; return; }
  c.innerHTML=sigs.map((s,i)=>`<div class="signal-card"><div class="sig-av" style="background:${getAvatarColor(s.sender?.nickname)}">${esc((s.sender?.nickname||'?')[0])}</div><div class="sig-info"><div class="sig-name">${esc(s.sender?.nickname)} ${esc(String(s.sender?.age||''))}세</div><div class="sig-msg">${esc(s.message||'')}</div><div class="sig-tags"><span class="tag">Free Try</span><span class="tag">최대 ${URIA_CONFIG.MAX_REAL_COST}C</span></div></div><div class="sig-actions"><button class="btn btn-sm btn-p" onclick="acceptSignal(${i})">수락</button><button class="btn btn-sm btn-s" onclick="rejectSignal(${i})">거절</button></div></div>`).join('');
}

// ── Signal 응답 ──────────────────────────────────────
async function acceptSignal(idx){
  const sig=(state.signals.length?state.signals:DEMO_SIGNALS)[idx]; if(!sig)return;
  try{ await API.respondSignal(sig.id,'accept'); }catch{}
  showToast(`${esc(sig.sender?.nickname)}님과 연결! (1C 확정)`);
  if(state.signals.length)state.signals.splice(idx,1); renderIncomingSignals();
}
async function rejectSignal(idx){
  const sig=(state.signals.length?state.signals:DEMO_SIGNALS)[idx]; if(!sig)return;
  try{ await API.respondSignal(sig.id,'reject'); }catch{}
  showToast('Signal 거절 — 3C 전액 환불됨');
  if(state.signals.length)state.signals.splice(idx,1); renderIncomingSignals();
}

// ── 매칭 리스트 ──────────────────────────────────────
async function loadMatches(){
  try{
    const res=await API.getNearby({lat:state.location?.lat||37.5,lng:state.location?.lng||127.0,radius_km:5});
    state.matches=(res.items||[]).map(u=>({...u,dist:u.distance_m?u.distance_m/1000:null,nick:u.nickname,color:getAvatarColor(u.nickname)}));
  }catch{ state.matches=DEMO_MATCHES; }
  updateDistances();
}
function renderList(){
  const list=document.getElementById('match-list'),badge=document.getElementById('list-count-badge'); if(!list)return;
  if(!state.matches.length){ list.innerHTML=`<div class="empty-state"><div class="empty-icon">🔍</div><div class="empty-title">Tonight Mode를 켜면 리스트가 나와요</div><div class="empty-sub">오늘 밤 가능한 분들이 여기 나타납니다</div></div>`; if(badge)badge.textContent=''; return; }
  if(badge)badge.textContent=`${state.matches.length}명`;
  list.innerHTML=state.matches.map((m,i)=>`<div class="person-card${i>=3?' locked':''}" onclick="${i<3?`selectMatch(${i})`:'openCoinModal()'}"><div class="pav pav-online" style="background:${m.color||getAvatarColor(m.nick)}">${esc((m.nick||'?')[0])}</div><div style="flex:1"><div class="pname">${esc(m.nick)}님 ${esc(m.age||'')}</div><div class="pmeta">${formatDist(m.dist)} · ${esc(m.available||'오늘 가능')}</div></div><div class="tscore"><div class="ts-n">${m.trustScore||0}</div><div class="ts-l">Trust</div></div>${i>=3?'<div style="font-size:10px;color:var(--t3)">1C</div>':''}</div>`).join('');
}
function selectMatch(idx){
  state.selectedMatch=state.matches[idx]; const m=state.selectedMatch;
  const av=document.getElementById('sig-avatar'); if(av){av.textContent=esc((m.nick||'?')[0]);av.style.background=m.color||getAvatarColor(m.nick);}
  const sn=document.getElementById('sig-name'); if(sn)sn.textContent=esc(m.nick)+'님';
  const sm=document.getElementById('sig-meta'); if(sm)sm.textContent=`Trust ${m.trustScore||0} · ${formatDist(m.dist)} · ${esc(m.available||'오늘 가능')}`;
  const st=document.getElementById('sig-tags'); if(st)st.innerHTML=`<div class="tag">응답 빠름</div><div class="tag">Moment ${m.momentCount||Math.floor(Math.random()*10)+1}회</div>`;
  const si=document.getElementById('sig-msg'); if(si){si.value='';document.getElementById('sig-cnt').textContent='0/20';}
  goScreen('screen-signal');
}

// ── Signal 전송 (SAFE BET) ────────────────────────────
async function sendSignal(){
  const msg=document.getElementById('sig-msg')?.value.trim(); if(!msg)return showToast('메시지를 입력해주세요');
  const cost=URIA_CONFIG.SIGNAL_ESCROW_COINS;
  if(state.coins<cost){ showToast(`크레딧 부족 (${cost}C 필요 · 최대 실제비용 ${URIA_CONFIG.MAX_REAL_COST}C)`); openCoinModal(); return; }
  showLoading(true); await sleep(800);
  try{ await API.sendSignal({receiver_id:state.selectedMatch?.id,message:msg}); }catch{}
  state.coins-=cost; if(state.profile)state.profile.coins=state.coins; saveProfileLocal(); updateCoinsUI();
  showLoading(false); showToast(`Signal 전송! ${cost}C 에스크로 (최대 실제비용 ${URIA_CONFIG.MAX_REAL_COST}C)`);
  setTimeout(()=>goScreen('screen-home'),900);
}

// ── AI Match ─────────────────────────────────────────
let chatHistory=[],chatTurn=0;
function initChat(){ chatHistory=[]; chatTurn=0; const b=document.getElementById('chat-box'); if(!b)return; b.innerHTML=''; addAIMessage('안녕하세요! 오늘 어떤 분을 찾고 계세요?'); addChips(['조용한 분위기','활발한 분위기','편한 대화'],handleChipSelect); }
function addAIMessage(t){ const b=document.getElementById('chat-box'); if(!b)return; b.insertAdjacentHTML('beforeend',`<div class="bubble ai"><div class="ai-av"><svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:#fff;fill:none;stroke-width:2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg></div><div>${esc(t).replace(/\n/g,'<br>')}</div></div>`); b.scrollTop=b.scrollHeight; }
function addUserMessage(t){ const b=document.getElementById('chat-box'); if(!b)return; b.insertAdjacentHTML('beforeend',`<div class="bubble me">${esc(t)}</div>`); b.scrollTop=b.scrollHeight; }
function addChips(opts,fn){ const b=document.getElementById('chat-box'); if(!b)return; const d=document.createElement('div'); d.className='chips-row'; d.innerHTML=opts.map(o=>`<div class="ai-chip" onclick="handleChipSelect('${esc(o)}')">${esc(o)}</div>`).join(''); b.appendChild(d); b.scrollTop=b.scrollHeight; }
function addListCTA(){ const b=document.getElementById('chat-box'); if(!b)return; const d=document.createElement('div'); d.className='chat-go'; d.innerHTML='<div class="chat-go-title">리스트 보기</div><div class="chat-go-sub">조건 맞는 분들 찾았어요</div>'; d.onclick=()=>goScreen('screen-list'); b.appendChild(d); b.scrollTop=b.scrollHeight; }
function handleChipSelect(sel){ document.querySelectorAll('.ai-chip').forEach(c=>c.classList.add('sel')); setTimeout(()=>sendChatWithText(sel),200); }
async function sendChat(){ const inp=document.getElementById('chat-input'); const t=inp?.value.trim(); if(!t)return; inp.value=''; await sendChatWithText(t); }
async function sendChatWithText(text){
  addUserMessage(text); chatHistory.push({role:'user',content:text}); chatTurn++;
  const b=document.getElementById('chat-box'),tid='t'+Date.now();
  b.insertAdjacentHTML('beforeend',`<div class="bubble ai typing" id="${tid}">···</div>`); b.scrollTop=b.scrollHeight;
  await sleep(700+Math.random()*400);
  let reply=URIA_CONFIG.MODE==='demo'?getDemoAIResponse(text,chatTurn):await(async()=>{ try{ const r=await API.post('/ai/chat',{messages:chatHistory}); return r.content||getDemoAIResponse(text,chatTurn); }catch{ return getDemoAIResponse(text,chatTurn); }})();
  const el=document.getElementById(tid); if(el){el.classList.remove('typing');el.innerHTML=`<div class="ai-av"><svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:#fff;fill:none;stroke-width:2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg></div><div>${esc(reply).replace(/\n/g,'<br>')}</div>`;}
  chatHistory.push({role:'assistant',content:reply});
  if(reply.includes('매칭 리스트 준비')||reply.includes('"ready"')){ await loadMatches(); addListCTA(); }
  else if(chatTurn===2)addChips(['20대','30대','나이 무관'],handleChipSelect);
  else if(chatTurn===3)addChips(['2km 이내','5km 이내','거리 무관'],handleChipSelect);
  b.scrollTop=b.scrollHeight;
}
function getDemoAIResponse(t,n){ if(n<=2)return '어떤 나이대를 선호하세요?'; if(n<=4)return '반경은 어느 정도까지 괜찮으세요?'; return '반경 2.3km에 조건 맞는 분들 찾았어요 ✦\n매칭 리스트 준비됐어요 {"ready":true}'; }

// ── °C Passport (여성) ────────────────────────────────
async function renderPassport(){
  try{
    const p=await API.getPassport(); const tier=getTrustTier(p.trust_score||0);
    if(document.getElementById('pp-score'))document.getElementById('pp-score').textContent=p.trust_score||'—';
    const tb=document.getElementById('pp-tier'); if(tb){tb.textContent=`◈ ${tier.name}`;tb.style.color=tier.color;}
    if(document.getElementById('pp-resp'))document.getElementById('pp-resp').textContent=(p.response_rate||0)+'%';
    if(document.getElementById('pp-proof'))document.getElementById('pp-proof').textContent=(p.moment_count||0)+'회';
    if(document.getElementById('pp-pledge'))document.getElementById('pp-pledge').textContent=(p.pledge_rate||0)+'%';
    const rc=document.getElementById('pp-report'); if(rc){rc.textContent=p.report_count||0;rc.style.color=p.report_count>0?'var(--rd)':'var(--gr)';}
    const pts=document.getElementById('pp-points'); if(pts)pts.innerHTML=`${p.points_this_week||0}<span style="font-size:13px;color:var(--t3)"> pts</span>`;
  }catch{}
}
function getTrustTier(s){
  if(s>=90)return{name:'61°C+',color:'#ef4444'};
  if(s>=75)return{name:'46~60°C',color:'#f97316'};
  if(s>=55)return{name:'37~45°C',color:'#60a5fa'};
  if(s>=30)return{name:'36.5°C',color:'#94a3b8'};
  return{name:'36.5°C',color:'#6b7280'};
}

// ── °C Reputation (남성) ──────────────────────────────
const LEVELS=[
  {name:'36.5°C',label:'Normal',min:0,max:40,color:'#94a3b8',emoji:'🌡️'},
  {name:'37~45°C',label:'Warm',min:40,max:100,color:'#60a5fa',emoji:'☀️'},
  {name:'46~60°C',label:'🔥 Hot',min:100,max:160,color:'#f97316',emoji:'🔥'},
  {name:'61°C+',label:'🔥🔥 Burning',min:160,max:999,color:'#ef4444',emoji:'🔥🔥'},
];
async function renderReputation(){
  try{
    const r=await API.getReputation(); const score=r.score||0;
    const lv=LEVELS.find(l=>score>=l.min&&score<l.max)||LEVELS[0];
    const nx=LEVELS[LEVELS.indexOf(lv)+1];
    const prog=nx?((score-lv.min)/(nx.min-lv.min))*100:100;
    if(document.getElementById('rep-score'))document.getElementById('rep-score').textContent=score;
    const rl=document.getElementById('rep-level'); if(rl){rl.textContent=lv.name;rl.style.color=lv.color;}
    const rp=document.getElementById('rep-prog'); if(rp){rp.style.width=prog+'%';rp.style.background=lv.color;}
    const rn=document.getElementById('rep-note'); if(rn)rn.textContent=nx?`다음: ${nx.name} (${nx.min-score}점 남음)`:'🔥🔥 최고 온도';
    if(document.getElementById('b1'))document.getElementById('b1').style.width=(r.no_show_rate||100)+'%';
    if(document.getElementById('b2'))document.getElementById('b2').style.width=Math.min((r.moment_count||0)*10,100)+'%';
    if(document.getElementById('b3'))document.getElementById('b3').style.width='70%';
    if(document.getElementById('b4'))document.getElementById('b4').style.width=(r.report_count||0)===0?'100%':'0%';
    document.getElementById('lv-list').innerHTML=LEVELS.map(l=>{
      const ic=score>=l.min&&score<l.max;
      return `<div class="lv-card${ic?' cur':''}" style="${ic?`border-color:${l.color}40`:''}">
        ${ic?'<div class="lv-tag">현재</div>':''}
        <div class="lv-name" style="color:${ic?l.color:'var(--t1)'}">${l.emoji} ${esc(l.name)}</div>
        <div class="lv-range" style="color:var(--t3)">${esc(l.label)}</div>
        ${ic&&nx?`<div style="margin-top:8px;background:var(--s2);border-radius:6px;padding:8px"><div style="font-size:10px;color:var(--t3);margin-bottom:4px">다음: ${esc(nx.name)}</div><div class="prog-bar"><div class="prog-fill" style="width:${prog}%;background:${lv.color}"></div></div></div>`:''}
      </div>`;
    }).join('');
  }catch{}
}

// ── Market ───────────────────────────────────────────
function renderMarket(){
  const live=isTonightHour();
  if(document.getElementById('mkt-f'))document.getElementById('mkt-f').textContent=live?Math.floor(Math.random()*8)+3:'—';
  if(document.getElementById('mkt-m'))document.getElementById('mkt-m').textContent=live?Math.floor(Math.random()*15)+8:'—';
}

// ── Moment 완료 (SAFE BET: 순 비용 2C) ───────────────
async function completeMoment(){
  showLoading(true); await sleep(1200);
  const proofs=JSON.parse(localStorage.getItem('uria_proofs')||'[]');
  proofs.unshift({num:(state.profile?.momentCount||0)+1,venue:['Café Nuit','Bar Velvet','Lounge Green'][Math.floor(Math.random()*3)],date:getRelativeDate(0)});
  localStorage.setItem('uria_proofs',JSON.stringify(proofs.slice(0,20)));
  if(state.profile){ state.profile.momentCount=(state.profile.momentCount||0)+1; state.coins=Math.max(0,state.coins+1); state.profile.coins=state.coins; saveProfileLocal(); updateCoinsUI(); }
  try{ await API.post('/moments/complete',{}); }catch{}
  showLoading(false); showToast('Moment 완료! +1C 환불 · 순 비용 2C · +180pts 🎉');
  setTimeout(()=>goBack(),1000);
}

// ── Settings ─────────────────────────────────────────
function renderSettings(){
  const p=state.profile; if(!p)return;
  const av=document.getElementById('settings-av'); if(av){av.textContent=esc((p.nick||'?')[0]);av.style.background=getAvatarColor(p.nick);}
  if(document.getElementById('settings-name'))document.getElementById('settings-name').textContent=esc(p.nick||'');
  if(document.getElementById('settings-age'))document.getElementById('settings-age').textContent=p.birth_year?`${new Date().getFullYear()-p.birth_year}세`:'';
  updateCoinsUI();
}
async function signOut(){ if(!confirm('로그아웃 하시겠습니까?'))return; API.clearToken(); localStorage.clear(); state.user=null;state.profile=null;state.tonight=false; document.getElementById('nav').style.display='none'; document.getElementById('app')?.classList.remove('tonight-on'); document.body.classList.remove('tonight-on'); goScreen('screen-splash'); showToast('로그아웃됐습니다'); }

// ── Credit 모달 ──────────────────────────────────────
function openCoinModal(){ document.getElementById('coin-modal')?.classList.add('show'); }
function closeCoinModal(e){ if(!e||e.target===document.getElementById('coin-modal'))document.getElementById('coin-modal')?.classList.remove('show'); }
async function buyCoin(amount,price){
  if(URIA_CONFIG.MODE==='demo'){ state.coins+=amount; if(state.profile)state.profile.coins=state.coins; saveProfileLocal(); updateCoinsUI(); closeCoinModal(); showToast(`🪙 ${amount}C 충전 완료!`); return; }
  showToast('결제 모듈 준비 중입니다');
}

// ── Toast ────────────────────────────────────────────
function showToast(msg,ms=2800){ const t=document.getElementById('toast'); if(!t)return; t.textContent=msg; t.classList.add('show'); clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove('show'),ms); }

// ── 시작 ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded',initApp);

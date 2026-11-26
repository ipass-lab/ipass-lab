// ITパスポート過去問演習 本体。外部通信なし。記録はこのブラウザの localStorage のみ。
(function(){
'use strict';
const F={S:'ストラテジ系',M:'マネジメント系',T:'テクノロジ系'};
const FK=['S','M','T'];
const K=['ア','イ','ウ','エ'];
const KEY='ipass-v1',MKEY='ipass-memo-v1',EKEY='ipass-exam-v1',PKEY='ipass-pick-v1';
const $=id=>document.getElementById(id);
const main=$('main');
if(!main)return;

const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const shuffle=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
const pct=(c,n)=>n?Math.round(c/n*100):0;
// CSPでstyle属性を使えないため、幅はJSで設定する
const widths=()=>document.querySelectorAll('[data-w]').forEach(e=>{e.style.width=e.dataset.w+'%'});
const load=(k,d)=>{try{const v=JSON.parse(localStorage.getItem(k));return v&&typeof v==='object'?v:d}catch(e){return d}};
const store=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));return true}catch(e){return false}};

// ---------- 保存データ ----------
let st=load(KEY,{});                       // 問題IDごとの成績と付箋 {a,c,s,last}
let ex=load(EKEY,{p:{},r:{}});             // 本番形式 p:途中経過 {y:{ans:{id:正誤}}} r:前回の結果
if(!ex.p||typeof ex.p!=='object')ex.p={};if(!ex.r||typeof ex.r!=='object')ex.r={};
let memo=load(MKEY,{q:{},pad:''});
if(!memo.q||typeof memo.q!=='object')memo.q={};if(typeof memo.pad!=='string')memo.pad='';
const save=()=>store(KEY,st),saveEx=()=>store(EKEY,ex),saveMemo=()=>store(MKEY,memo);
const rec=id=>st[id]||(st[id]={a:0,c:0,s:false,last:null});

// ---------- 問題データ ----------
let KQ=[],KY=[],BYID={},YL={},YN={},ready=false;
const IMG_RE=/^kakomon\/[a-z0-9]{2,12}\/q\d{3}\.png$/;
function normalize(){
  KQ=(Array.isArray(window.KQ)?window.KQ:[]).filter(o=>o&&typeof o.id==='string'&&Array.isArray(o.c)&&o.c.length===4&&F[o.f]&&Number.isInteger(o.a)&&o.a>=-1&&o.a<4)
    .map(o=>({id:o.id,y:String(o.y||''),n:+o.n||0,f:o.f,q:String(o.q||''),c:o.c.map(String),a:o.a,
      lead:typeof o.lead==='string'?o.lead:'',note:typeof o.note==='string'?o.note:'',mod:typeof o.mod==='string'?o.mod:'',exp:String(o.exp||''),
      src:String(o.src||''),fig:!!o.fig,img:typeof o.img==='string'&&IMG_RE.test(o.img)?o.img:''}));
  KY=(Array.isArray(window.KY)?window.KY:[]).filter(o=>o&&typeof o.y==='string').map(o=>({y:o.y,label:String(o.label||o.y)}));
  // KY が無いときは問題データから回を作る（データ順）
  KQ.forEach(q=>{if(!KY.some(k=>k.y===q.y))KY.push({y:q.y,label:q.y})});
  KY=KY.filter(k=>KQ.some(q=>q.y===k.y));
  KY.forEach(k=>{YL[k.y]=k.label});
  BYID={};YN={};KQ.forEach(q=>{BYID[q.id]=q;YN[q.y]=(YN[q.y]||0)+1});
}
// ---------- 頻出用語（terms.js があれば使う。無くても動く） ----------
let TERMS=[],TSCORE={},TMAX=0,QTERMS={},TBY={},TN=0;
function normalizeTerms(){
  const kt=window.KT;
  if(!kt||!Array.isArray(kt.terms))return;
  TERMS=kt.terms.filter(t=>t&&typeof t.t==='string'&&Array.isArray(t.ids)).map(t=>({t:t.t,exams:+t.exams||0,qs:+t.qs||t.ids.length,ids:t.ids.filter(i=>BYID[i])})).filter(t=>t.ids.length);
  TN=+kt.n_exams||0;
  TSCORE={};TMAX=0;QTERMS={};TBY={};
  TERMS.forEach(t=>{TBY[t.t]=new Set(t.ids);t.ids.forEach(i=>{(QTERMS[i]||(QTERMS[i]=[])).push(t)})});
  const sc=kt.score&&typeof kt.score==='object'?kt.score:{};
  Object.keys(sc).forEach(i=>{if(BYID[i]){TSCORE[i]=+sc[i]||0;TMAX=Math.max(TMAX,TSCORE[i])}});
  Object.values(QTERMS).forEach(a=>a.sort((x,y)=>y.exams-x.exams||y.qs-x.qs));
}
const hasTerms=()=>TERMS.length>0&&TMAX>0;
// 頻出スコアに応じた重み：頻出用語を含まない問題を1として、最も頻出の問題で3（他の問題も十分に出る程度）
const weightOf=q=>1+2*((TSCORE[q.id]||0)/(TMAX||1));
// 重み付きの非復元抽出（Efraimidis–Spirakis 法：乱数^(1/重み) の大きい順に取る）
function weightedPick(pool,n){
  return pool.map(q=>({q,k:Math.pow(Math.random(),1/weightOf(q))})).sort((a,b)=>b.k-a.k).slice(0,n).map(x=>x.q);
}
const where=q=>(YL[q.y]||q.y)+(q.n?' 問'+q.n:'');
const examQs=y=>KQ.filter(q=>q.y===y).sort((a,b)=>a.n-b.n);

// ---------- 画面 ----------
const home=$('home');
let view='home',sess=null,answered=null;
function setView(v){
  view=v;
  if(home)home.hidden=v!=='home';
  main.hidden=v==='home';
  document.body.classList.toggle('quizzing',v==='quiz');
  document.body.classList.toggle('home',v==='home');
  if(v!=='home'){const top=$('qtop')||main;top.scrollIntoView({block:'start'})}
}
function goHome(){flushMemo();sess=null;answered=null;main.innerHTML='';setView('home');renderHome();updatePick(false);const h=$('homeTop');if(h)h.scrollIntoView({block:'start'})}

function tally(){
  const t=$('tally');if(!t)return;
  if(!ready){t.innerHTML='';return}
  let n=0,a=0,c=0,s=0;
  KQ.forEach(q=>{const r=st[q.id];if(!r)return;if(r.a>0){n++;a+=r.a;c+=r.c}if(r.s)s++});
  t.innerHTML=`<span><b>${n.toLocaleString()}<small>/${KQ.length.toLocaleString()}</small></b>解いた問題</span><span><b>${pct(c,a)}%</b>通算正答率</span><span><b>${s}</b>付箋</span>`;
}
function fieldStats(){
  const o={};FK.forEach(k=>o[k]={a:0,c:0});
  KQ.forEach(q=>{const r=st[q.id];if(r&&r.a>0){o[q.f].a+=r.a;o[q.f].c+=r.c}});
  return o;
}
function examStatus(y){
  const p=ex.p[y],r=ex.r[y],qs=examQs(y);
  if(p&&p.ans){
    const done=qs.filter(q=>q.id in p.ans).length,ok=qs.filter(q=>p.ans[q.id]===true).length;
    const nx=qs.find(q=>!(q.id in p.ans));
    return{busy:true,done,ok,total:qs.length,next:nx?nx.n:null};
  }
  return{busy:false,total:qs.length,last:r||null};
}
function renderHome(){
  tally();
  const en=$('entries');if(!en||!ready)return;
  if(!KQ.length){en.innerHTML='<div class="card empty">過去問データは準備中です。しばらくしてから再度アクセスしてください。</div>';return}
  const latest=KY[0],ls=examStatus(latest.y);
  const fs=fieldStats();
  let weak=null;FK.forEach(k=>{if(fs[k].a>=5&&(!weak||fs[k].c/fs[k].a<fs[weak].c/fs[weak].a))weak=k});
  const nSticky=KQ.filter(q=>st[q.id]&&st[q.id].s).length,nWrong=KQ.filter(q=>st[q.id]&&st[q.id].last===false).length;
  en.innerHTML=`
  <section class="entry"><h2><span class="no">1</span>最新回で腕試し</h2>
    <p>${esc(latest.label)}の${ls.total}問を、本番と同じ順番で解きます。${ls.busy?`<br><b>途中まで：${ls.done}/${ls.total}問</b>`:ls.last?`<br>前回：${ls.last.p}%（${ls.last.pass?'合格基準クリア':'合格基準に届かず'}）`:''}</p>
    <button type="button" class="go" data-act="exam" data-y="${esc(latest.y)}">${ls.busy?`続きから（問${ls.next}〜）`:'本番形式で解く'}</button></section>
  <section class="entry"><h2><span class="no">2</span>ランダム演習</h2>
    <p>${KY.length>1?`全${KY.length}回`:esc(latest.label)}の${KQ.length.toLocaleString()}問から、ランダムに出題します。</p>
    <div class="btns"><button type="button" class="go" data-act="rand" data-n="10">10問</button><button type="button" data-act="rand" data-n="20">20問</button></div></section>
  <section class="entry"><h2><span class="no">3</span>苦手分野を集中演習</h2>
    <p>${weak?`今の苦手は<b>${F[weak]}</b>です。`:'分野を選んで10問。5問以上解くと、苦手な分野に印が付きます。'}</p>
    <div class="fbtns">${FK.map(k=>`<button type="button" data-act="field" data-f="${k}"${k===weak?' class="weak"':''}><span>${F[k]}</span><small>${fs[k].a?pct(fs[k].c,fs[k].a)+'%':'未回答'}${k===weak?' ・ 苦手':''}</small></button>`).join('')}</div></section>
  <section class="entry"><h2><span class="no">4</span>付箋・間違いの復習</h2>
    <p>付箋を貼った問題と、前回間違えた問題を解き直します。</p>
    <div class="btns"><button type="button" data-act="sticky"${nSticky?'':' disabled'}>付箋 ${nSticky}問</button><button type="button" data-act="wrong"${nWrong?'':' disabled'}>前回の間違い ${nWrong}問</button></div></section>
  ${hasTerms()?`<section class="entry entry-wide"><h2><span class="no">5</span>頻出用語で演習</h2>
    <p>過去${TN||KY.length}回の試験で何度も出ている用語を含む問題を、出やすい順に重み付けして出題します。用語を選ぶと、その用語の問題だけを解けます。</p>
    <div class="ttags">${TERMS.slice(0,8).map(t=>`<button type="button" class="ttag" data-act="term" data-t="${esc(t.t)}">${esc(t.t)}<small>${t.exams}回</small></button>`).join('')}</div>
    <div class="btns"><button type="button" class="go" data-act="hot">頻出用語の問題から10問</button><a class="btnlink" href="terms.html">頻出用語ランキングを見る</a></div></section>`:''}`;
  renderExamPick();
}
function fillSelects(){
  const fe=$('fExam'),yl=$('yList');
  if(fe)fe.innerHTML=KY.map(k=>`<option value="${esc(k.y)}">${esc(k.label)}</option>`).join('');
  if(yl)yl.innerHTML=KY.map(k=>`<label><input type="checkbox" value="${esc(k.y)}"><span>${esc(k.label)}</span><small>${YN[k.y]||0}問</small></label>`).join('');
  document.querySelectorAll('[data-needs-data]').forEach(b=>{b.disabled=!KQ.length});
}
let newArmed=false;
function renderExamPick(){
  const fe=$('fExam');if(!fe||!fe.value)return;
  const s=examStatus(fe.value);newArmed=false;
  $('examStat').textContent=s.busy?`途中まで：${s.done}/${s.total}問 回答済み（正解 ${s.ok}問）。続きから再開できます。`:
    s.last?`前回の結果：${s.last.p}%（${s.last.c}/${s.last.n}問）${s.last.pass?'合格基準を満たしています':'合格基準に届いていません'}`:`全${s.total}問。まだ解いていません。`;
  $('examGo').textContent=s.busy?`続きから（問${s.next}〜）`:'この回を解く';
  $('examNew').hidden=!s.busy;$('examNew').textContent='最初から解き直す';
}

// ---------- 出題 ----------
function startExam(y,fresh){
  const qs=examQs(y);if(!qs.length)return;
  if(fresh||!ex.p[y])ex.p[y]={ans:{}};
  saveEx();
  sess={mode:'exam',y,list:qs,idx:0,log:[]};
  const i=qs.findIndex(q=>!(q.id in ex.p[y].ans));
  if(i<0){finishExam();return}
  sess.idx=i;show();
}
// conf = {ys:[回コード]|null(全回), fs:[分野]|null(全分野), m:絞り込み, n:問題数, w:頻出用語を優先, t:用語, hot:頻出用語を含む問題だけ}
function poolFor(conf){
  const ys=conf.ys?new Set(conf.ys):null,fs=conf.fs?new Set(conf.fs):null;
  const ts=conf.t&&TBY[conf.t]?TBY[conf.t]:null;
  let pool=KQ.filter(q=>(!ys||ys.has(q.y))&&(!fs||fs.has(q.f))&&(!ts||ts.has(q.id)));
  if(conf.hot)pool=pool.filter(q=>TSCORE[q.id]>0);
  if(conf.m==='sticky')pool=pool.filter(q=>st[q.id]&&st[q.id].s);
  if(conf.m==='wrong')pool=pool.filter(q=>st[q.id]&&st[q.id].last===false);
  if(conf.m==='new')pool=pool.filter(q=>!st[q.id]||!st[q.id].a);
  return pool;
}
function startTerm(t){startRandom({ys:null,fs:null,m:'all',n:10,t,w:false})}
function startRandom(conf){
  const pool=poolFor(conf);
  const list=conf.w&&hasTerms()?weightedPick(pool,conf.n):shuffle(pool).slice(0,conf.n);
  sess={mode:'random',conf,list,idx:0,log:[]};
  if(!list.length){
    const msg={sticky:'付箋を貼った問題はまだありません。問題画面の「付箋」で追加できます。',wrong:'前回間違えた問題はありません。',new:'この条件の問題はすべて解きました。「すべて」で復習しましょう。'}[conf.m]||'この条件の問題はありません。';
    main.innerHTML=`<div class="card empty" id="qtop"><p>${msg}</p><button type="button" id="back2">メニューに戻る</button></div>`;
    setView('result');$('back2').addEventListener('click',goHome);return;
  }
  show();
}
function figHtml(q){
  if(!q.img)return '';
  const alt=esc(`${where(q)}の問題文と図表の画像`);
  const img=`<button type="button" class="zoom" aria-label="画像を拡大して表示"><img class="qimg" src="${esc(q.img)}" alt="${alt}" decoding="async"></button>`;
  const cap=`<figcaption>問題冊子より${q.src?`（${esc(q.src)}）`:''}<span class="tap">画像をタップすると拡大できます</span></figcaption>`;
  if(q.fig)return `<figure class="qfig">${img}${cap}</figure>`;
  return `<details class="qfig"><summary>問題の画像を見る</summary><figure>${img}${cap}</figure></details>`;
}
function show(){
  const q=sess.list[sess.idx];answered=null;
  const r=st[q.id],exam=sess.mode==='exam';
  const total=sess.list.length;
  const done=exam?sess.list.filter(x=>x.id in ex.p[sess.y].ans).length:sess.idx;
  main.innerHTML=`<div class="card qcard" id="qtop">
    <div class="qhead"><button type="button" class="back" id="back">${exam?'中断して戻る':'メニューに戻る'}</button>
      <span class="pos">${exam?`<b>問${q.n}</b> / ${total}`:`<b>${sess.idx+1}</b> / ${total}問`}</span></div>
    <div class="prog" role="progressbar" aria-label="進捗" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}"><i data-w="${done/total*100}"></i></div>
    ${sess.conf&&sess.conf.t?`<p class="tline">用語「${esc(sess.conf.t)}」を含む問題</p>`:sess.conf&&sess.conf.hot?'<p class="tline">頻出用語を含む問題</p>':''}
    <div class="meta"><span class="tag">${F[q.f]}</span><span>${esc(where(q))}${r&&r.a?` ・ これまで ${r.c}/${r.a} 正解`:''}</span></div>
    ${q.lead?`<div class="leadq">${esc(q.lead)}</div>`:''}
    ${q.q?`<p class="q">${esc(q.q)}</p>`:''}
    ${figHtml(q)}
    <div class="ch" id="ch">${[0,1,2,3].map(i=>`<button type="button" data-i="${i}"><span class="k">${K[i]}</span><span class="t">${esc(q.c[i])}</span></button>`).join('')}</div>
    ${q.src?`<p class="src">${esc(q.src)}</p>`:''}
    ${q.mod?`<p class="src mod">${esc(q.mod)}</p>`:''}
    <div id="after"></div>
    <p class="hint kbd">キーボードの 1〜4 で回答、Enter で次へ進めます。</p>
    <div class="qbar"><button type="button" class="tbtn" data-tools aria-controls="tPanel" aria-expanded="false">電卓・メモ</button>
      <button type="button" class="fusen" id="fu" aria-pressed="${!!(r&&r.s)}">付箋</button>
      <button type="button" class="go nx" id="nx" disabled>${sess.idx+1<total||exam&&done+1<total?'次の問題へ':'結果を見る'}</button></div>
  </div>`;
  setView('quiz');widths();
  main.querySelectorAll('img.qimg').forEach(im=>im.addEventListener('error',()=>{
    const p=document.createElement('p');p.className='hint';p.textContent='問題の画像を読み込めませんでした。';im.closest('.zoom').replaceWith(p);
  }));
  main.querySelectorAll('.zoom').forEach(b=>b.addEventListener('click',()=>zoom(b.querySelector('img'))));
  $('ch').addEventListener('click',e=>{const b=e.target.closest('button');if(b)answer(+b.dataset.i)});
  $('back').addEventListener('click',goHome);
  $('fu').addEventListener('click',()=>{const x=rec(q.id);x.s=!x.s;save();$('fu').setAttribute('aria-pressed',x.s);tally()});
  $('nx').addEventListener('click',next);
}
function answer(i){
  if(answered!==null||!sess)return;
  const q=sess.list[sess.idx],free=q.a<0,ok=free||i===q.a;answered=i;
  const r=rec(q.id);r.a++;if(ok)r.c++;r.last=ok;save();
  sess.log.push({q,ok});
  if(sess.mode==='exam'){ex.p[sess.y].ans[q.id]=ok;ex.p[sess.y].at=Date.now();saveEx()}
  $('ch').querySelectorAll('button').forEach((b,j)=>{b.disabled=true;if(free?j===i:j===q.a)b.classList.add('right');else if(j===i)b.classList.add('wrong')});
  const head=free?'○ 正解（この問題はすべての選択肢を正解として扱います）':ok?'○ 正解':'× 不正解 ── 正解は '+K[q.a];
  const body=[q.note?`<p class="note">${esc(q.note)}</p>`:'',q.exp?`<p>${esc(q.exp)}</p>`:(free?'':`<p>正解：${K[q.a]}（解説は準備中です）</p>`)].join('');
  const qt=(QTERMS[q.id]||[]).slice(0,8);
  const tags=qt.length?`<div class="tterms"><span class="hint">この問題の頻出用語（タップでその用語の問題を演習）</span><div class="ttags">${qt.map(t=>`<a class="ttag" href="index.html?term=${encodeURIComponent(t.t)}" data-term="${esc(t.t)}">${esc(t.t)}<small>${t.exams}回</small></a>`).join('')}</div></div>`:'';
  $('after').innerHTML=`<div class="exp" role="status"><h3 class="${ok?'ok':'ng'}">${head}</h3>${body}</div>${tags}
    <div class="qmemo"><label for="qm">この問題のメモ</label><textarea id="qm" rows="3" maxlength="2000" placeholder="覚えておきたいことを書くと、自動で保存されます"></textarea><span class="hint" id="qms" role="status"></span></div>`;
  bindQMemo(q.id);
  $('after').querySelectorAll('[data-term]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();flushMemo();startTerm(a.dataset.term)}));
  const nx=$('nx');nx.disabled=false;nx.focus({preventScroll:true});
  tally();
}
function next(){
  if(answered===null||!sess)return;
  flushMemo();
  if(sess.mode==='exam'){
    const i=sess.list.findIndex(q=>!(q.id in ex.p[sess.y].ans));
    if(i<0){finishExam();return}
    sess.idx=i;show();return;
  }
  sess.idx++;if(sess.idx<sess.list.length)show();else resultRandom();
}
function byField(log){
  return FK.map(k=>{const L=log.filter(l=>l.q.f===k);return{k,n:L.length,c:L.filter(l=>l.ok).length}}).filter(x=>x.n);
}
function rows(by,line){
  return `<div class="rows">${by.map(x=>{const v=pct(x.c,x.n);return`<div class="row"><span>${F[x.k]}</span><span class="m${line?' line30':''}"><i class="${(line?v<30:v<60)?'lo':''}" data-w="${v}"></i></span><span>${x.c}/${x.n}<small>（${v}%）</small></span></div>`}).join('')}</div>`;
}
function missHtml(miss){
  if(!miss.length)return '<p>全問正解です。</p>';
  const li=miss.map(l=>{const t=l.q.q||'（図の問題）';return `<li><span class="hint">${esc(where(l.q))} ・ ${F[l.q.f]}</span><br>${esc(t.length>120?t.slice(0,120)+'…':t)}<br><span class="ok">正解：${K[l.q.a]} ${esc(l.q.c[l.q.a])}</span></li>`}).join('');
  return `<details class="missd"${miss.length<=10?' open':''}><summary>間違えた問題（${miss.length}問）</summary><ul class="miss">${li}</ul></details>`;
}
function finishExam(){
  const y=sess.y,qs=examQs(y),ans=(ex.p[y]||{}).ans||{};
  const log=qs.filter(q=>q.id in ans).map(q=>({q,ok:!!ans[q.id]}));
  const c=log.filter(l=>l.ok).length,n=log.length,p=pct(c,n),by=byField(log);
  const pass=p>=60&&by.every(x=>pct(x.c,x.n)>=30);
  ex.r[y]={p,c,n,pass,at:Date.now()};delete ex.p[y];saveEx();
  const miss=log.filter(l=>!l.ok);
  main.innerHTML=`<div class="card" id="qtop">
    <p class="hint">${esc(YL[y]||y)} ・ 本番形式の結果</p>
    <div class="big">${p}<small>%</small></div>
    <p class="verdict ${pass?'ok':'ng'}">${n}問中 ${c}問正解 ── ${pass?'合格基準を満たしています':'合格基準に届いていません'}</p>
    <div class="rows"><div class="row total"><span>総合</span><span class="m line60"><i class="${p<60?'lo':''}" data-w="${p}"></i></span><span>${c}/${n}<small>（${p}%）</small></span></div></div>
    ${rows(by,true)}
    <p class="hint">合格基準：総合60%以上、かつ各分野30%以上（棒の縦線が基準）。実際の試験はIRT方式で採点されるため、この正答率は目安です。</p>
    ${missHtml(miss)}
    <div class="acts">${miss.length?'<button type="button" id="rw">間違えた問題を解き直す</button>':''}<button type="button" id="again">この回を最初から</button><button type="button" class="go" id="back2">メニューに戻る</button></div></div>`;
  setView('result');widths();
  $('back2').addEventListener('click',goHome);
  $('again').addEventListener('click',()=>startExam(y,true));
  if(miss.length)$('rw').addEventListener('click',()=>{sess={mode:'random',conf:{ys:[y],fs:null,m:'wrong',n:999},list:shuffle(miss.map(l=>l.q)),idx:0,log:[]};show()});
  tally();
}
function resultRandom(){
  const log=sess.log,c=log.filter(l=>l.ok).length,p=pct(c,log.length),miss=log.filter(l=>!l.ok),conf=sess.conf;
  main.innerHTML=`<div class="card" id="qtop">
    <div class="big">${p}<small>%</small></div>
    <p class="verdict">${log.length}問中 ${c}問正解 ── ${p>=60?'合格ラインの目安（60%）に届いています':'合格ラインの目安（60%）まであと少し'}</p>
    ${rows(byField(log),false)}
    ${missHtml(miss)}
    <div class="acts">${miss.length?'<button type="button" id="rw">間違えた問題だけ解き直す</button>':''}<button type="button" id="again">同じ条件でもう一度</button><button type="button" class="go" id="back2">メニューに戻る</button></div></div>`;
  setView('result');widths();
  $('back2').addEventListener('click',goHome);
  $('again').addEventListener('click',()=>startRandom(conf));
  if(miss.length)$('rw').addEventListener('click',()=>{sess={mode:'random',conf,list:shuffle(miss.map(l=>l.q)),idx:0,log:[]};show()});
}

// ---------- 画像の拡大表示 ----------
let lb=null;
function zoom(img){
  if(!img)return;
  if(!lb){
    lb=document.createElement('dialog');lb.className='lb';lb.setAttribute('aria-label','画像の拡大表示');
    lb.innerHTML='<div class="lb-bar"><button type="button" id="lbFit" aria-pressed="false">原寸で表示</button><button type="button" id="lbX">閉じる</button></div><div class="lb-body"><img id="lbImg" alt=""></div>';
    document.body.appendChild(lb);
    $('lbX').addEventListener('click',()=>lb.close());
    $('lbFit').addEventListener('click',()=>{const on=lb.classList.toggle('full');$('lbFit').setAttribute('aria-pressed',on);$('lbFit').textContent=on?'画面に合わせる':'原寸で表示'});
    lb.addEventListener('click',e=>{if(e.target===lb||e.target.classList.contains('lb-body'))lb.close()});
  }
  lb.classList.remove('full');$('lbFit').setAttribute('aria-pressed','false');$('lbFit').textContent='原寸で表示';
  $('lbImg').src=img.src;$('lbImg').alt=img.alt;
  if(typeof lb.showModal==='function')lb.showModal();else lb.setAttribute('open','');
  $('lbX').focus();
}

// ---------- メモ ----------
let memoTimer=null,memoFlush=null;
function debounce(fn){clearTimeout(memoTimer);memoFlush=fn;memoTimer=setTimeout(()=>{memoFlush=null;fn()},400)}
function flushMemo(){if(memoFlush){clearTimeout(memoTimer);const f=memoFlush;memoFlush=null;f()}}
function setQMemo(id,t){if(t.trim())memo.q[id]={t,u:Date.now()};else delete memo.q[id];return saveMemo()}
function bindQMemo(id){
  const ta=$('qm'),s=$('qms');
  ta.value=memo.q[id]?memo.q[id].t:'';
  const doSave=()=>{s.textContent=setQMemo(id,ta.value)?'保存しました':'保存できませんでした';if(tab==='list')renderList()};
  ta.addEventListener('input',()=>{s.textContent='';debounce(doSave)});
  ta.addEventListener('blur',flushMemo);
}
window.addEventListener('pagehide',flushMemo);

// ---------- 電卓 ----------
// eval を使わない小さな式パーサ（四則演算・括弧・小数・%・単項マイナス）
function calc(src){
  const s=src.replace(/×/g,'*').replace(/÷/g,'/').replace(/−/g,'-').replace(/\s+/g,'');
  let i=0;
  const peek=()=>s[i];
  function num(){const m=/^(\d+\.?\d*|\.\d+)/.exec(s.slice(i));if(!m)throw new Error('syntax');i+=m[0].length;return parseFloat(m[0])}
  function primary(){
    if(peek()==='('){i++;const v=expr();if(peek()===')')i++;else if(i<s.length)throw new Error('syntax');return v}
    return num();
  }
  function postfix(){let v=primary();while(peek()==='%'){i++;v=v/100}return v}
  function unary(){if(peek()==='-'){i++;return -unary()}if(peek()==='+'){i++;return unary()}return postfix()}
  function term(){
    let v=unary();
    while(peek()==='*'||peek()==='/'){const op=s[i++],r=unary();if(op==='/'){if(r===0)throw new Error('div0');v=v/r}else v=v*r}
    return v;
  }
  function expr(){let v=term();while(peek()==='+'||peek()==='-'){const op=s[i++],r=term();v=op==='+'?v+r:v-r}return v}
  if(!s)throw new Error('empty');
  const v=expr();
  if(i<s.length)throw new Error('syntax');
  if(!isFinite(v))throw new Error('range');
  return v;
}
function fmt(v){
  let r=parseFloat(v.toPrecision(12)); // 浮動小数の誤差を丸める（0.1+0.2 → 0.3）
  if(Object.is(r,-0))r=0;
  const a=Math.abs(r);
  if(a!==0&&(a>=1e15||a<1e-9))return r.toExponential(8).replace(/\.?0+e/,'e');
  return String(r);
}

// ---------- 電卓・メモのパネル ----------
const tools=document.createElement('div');
tools.className='tools';
tools.innerHTML=`<button type="button" class="tools-fab" id="tFab" data-tools aria-controls="tPanel" aria-expanded="false">電卓・メモ</button>
<section class="tools-panel" id="tPanel" hidden aria-label="電卓とメモ" tabindex="-1">
 <div class="tools-head">
  <div class="tabs" role="tablist" aria-label="ツールの切り替え">
   <button type="button" role="tab" id="tb-calc" aria-controls="tp-calc" aria-selected="true">電卓</button>
   <button type="button" role="tab" id="tb-pad" aria-controls="tp-pad" aria-selected="false" tabindex="-1">メモ帳</button>
   <button type="button" role="tab" id="tb-list" aria-controls="tp-list" aria-selected="false" tabindex="-1">メモ一覧</button>
  </div>
  <button type="button" class="tools-x" id="tClose" aria-label="閉じる">×</button>
 </div>
 <div role="tabpanel" id="tp-calc" aria-labelledby="tb-calc" class="tp">
  <div class="calc-disp"><div class="calc-ex" id="cEx" aria-label="入力中の式"></div><output class="calc-res" id="cRes" aria-live="polite">0</output></div>
  <div class="calc-keys" id="cKeys">
   ${['7','8','9','÷','C','4','5','6','×','⌫','1','2','3','−','(','0','.','%','+',')'].map(k=>`<button type="button" data-k="${k}"${k==='C'?' aria-label="クリア"':k==='⌫'?' aria-label="1文字消す"':''} class="${/[÷×−+%()]/.test(k)?'op':/[C⌫]/.test(k)?'fn':''}">${k}</button>`).join('')}
   <button type="button" data-k="=" class="go eq" aria-label="計算する">=</button>
  </div>
  <p class="hint"><span class="kbd-hint">キーボードでも入力できます（数字・+ − * / ( ) % . Enter=計算 Backspace=1文字消す Esc=クリア）。</span>「%」は100で割ります（10% → 0.1）。</p>
 </div>
 <div role="tabpanel" id="tp-pad" aria-labelledby="tb-pad" class="tp" hidden>
  <label for="pad" class="hint">計算の途中経過などを自由に書けます（自動で保存されます）</label>
  <textarea id="pad" rows="8" maxlength="10000"></textarea>
  <span class="hint" id="padS" role="status"></span>
 </div>
 <div role="tabpanel" id="tp-list" aria-labelledby="tb-list" class="tp" hidden>
  <div id="mList"></div>
  <p><button type="button" id="mReset">メモをすべて削除</button> <span class="hint" id="mMsg" role="status"></span></p>
 </div>
</section>`;
document.body.appendChild(tools);
const panel=$('tPanel');
let tab='calc',opener=null;
const syncOpeners=()=>document.querySelectorAll('[data-tools]').forEach(b=>b.setAttribute('aria-expanded',String(!panel.hidden)));
function openPanel(from){opener=from||$('tFab');panel.hidden=false;document.body.classList.add('tools-open');syncOpeners();selectTab(tab,true)}
function closePanel(){
  flushMemo();panel.hidden=true;document.body.classList.remove('tools-open');syncOpeners();
  const vis=b=>b&&document.body.contains(b)&&b.offsetParent!==null;
  const o=vis(opener)?opener:[document.querySelector('.qbar [data-tools]'),$('tFab')].find(vis);
  if(o)o.focus({preventScroll:true});
}
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-tools]');if(b)panel.hidden?openPanel(b):closePanel()});
$('tClose').addEventListener('click',closePanel);
const TABS=['calc','pad','list'];
function selectTab(t,focus){
  flushMemo();tab=t;
  TABS.forEach(x=>{const b=$('tb-'+x),on=x===t;b.setAttribute('aria-selected',on);b.tabIndex=on?0:-1;$('tp-'+x).hidden=!on});
  if(t==='pad')$('pad').value=memo.pad;
  if(t==='list')renderList();
  if(focus){if(t==='pad')$('pad').focus({preventScroll:true});else $('tb-'+t).focus({preventScroll:true})}
}
TABS.forEach(x=>$('tb-'+x).addEventListener('click',()=>selectTab(x,false)));
panel.querySelector('[role=tablist]').addEventListener('keydown',e=>{
  if(e.key!=='ArrowRight'&&e.key!=='ArrowLeft')return;
  e.preventDefault();const n=(TABS.indexOf(tab)+(e.key==='ArrowRight'?1:2))%3;selectTab(TABS[n],true);
});
// Safari などクリックでボタンにフォーカスが移らない環境でもキーボード入力を受け付ける
panel.addEventListener('click',()=>{if(!panel.contains(document.activeElement))panel.focus({preventScroll:true})});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden&&!panel.contains(e.target)&&!(lb&&lb.open))closePanel()});

let cx='',justEq=false;
const cEx=$('cEx'),cRes=$('cRes');
function render(res){cEx.textContent=cx||' ';if(res!==undefined)cRes.textContent=res}
function preview(){if(!cx){cRes.textContent='0';return}try{cRes.textContent=fmt(calc(cx))}catch(e){/* 入力途中は前の値のまま */}}
function key(k){
  if(k==='C'){cx='';justEq=false;render('0');return}
  if(k==='⌫'){justEq=false;cx=cx.slice(0,-1);render();preview();return}
  if(k==='='){
    if(!cx)return;
    const open=(cx.match(/\(/g)||[]).length-(cx.match(/\)/g)||[]).length;
    if(open>0)cx+=')'.repeat(open);
    try{const v=fmt(calc(cx));cEx.textContent=cx+' =';cRes.textContent=v;cx=v.includes('e')?'':v;justEq=true}
    catch(e){cEx.textContent=cx;cRes.textContent=e.message==='div0'?'0では割れません':'式を確認してください';justEq=false}
    return;
  }
  if(justEq&&/[0-9.(]/.test(k))cx='';
  justEq=false;
  if(cx.length>=80)return;
  cx+=k;render();preview();
}
$('cKeys').addEventListener('click',e=>{const b=e.target.closest('button');if(b)key(b.dataset.k)});
const KEYMAP={'*':'×','/':'÷','-':'−','+':'+','x':'×','X':'×','Enter':'=','=':'=','Backspace':'⌫','Escape':'C','Delete':'C','c':'C','C':'C'};
panel.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&tab!=='calc'){e.preventDefault();closePanel();return}
  if(tab!=='calc'||e.ctrlKey||e.metaKey||e.altKey)return;
  const t=e.target;
  if(t.tagName==='TEXTAREA'||t.tagName==='INPUT')return;
  let k=null;
  if(/^[0-9.()%]$/.test(e.key))k=e.key;else if(KEYMAP[e.key])k=KEYMAP[e.key];
  if(e.key==='Enter'&&t.tagName==='BUTTON'&&t.closest('#cKeys'))return; // ボタン上のEnterはそのボタンを押す
  if(e.key==='Escape'&&!cx){e.preventDefault();closePanel();return}
  if(k){
    e.preventDefault();key(k);
    // キーボードで入力したら、次の Enter がボタンではなく「=」になるようフォーカスをパネルへ
    if(t.tagName==='BUTTON'&&t.closest('#cKeys'))panel.focus({preventScroll:true});
  }
});

$('pad').addEventListener('input',()=>{$('padS').textContent='';debounce(()=>{memo.pad=$('pad').value;$('padS').textContent=saveMemo()?'保存しました':'保存できませんでした'})});
$('pad').addEventListener('blur',flushMemo);

function renderList(){
  const ids=Object.keys(memo.q).sort((a,b)=>(memo.q[b].u||0)-(memo.q[a].u||0));
  const items=ids.map(id=>{
    const q=BYID[id],m=memo.q[id];
    const head=q?`${F[q.f]} ・ ${esc(where(q))}`:`問題ID ${esc(id)}`;
    const qt=q?esc((q.q||'（図の問題）').slice(0,60))+((q.q||'').length>60?'…':''):'';
    return `<li><span class="hint">${head}</span>${qt?`<span class="mq">${qt}</span>`:''}<span class="mt">${esc(m.t)}</span></li>`;
  });
  const pad=memo.pad.trim()?`<li><span class="hint">メモ帳</span><span class="mt">${esc(memo.pad.length>200?memo.pad.slice(0,200)+'…':memo.pad)}</span></li>`:'';
  $('mList').innerHTML=(items.length||pad)?`<ul class="mlist">${pad}${items.join('')}</ul>`:'<p class="hint">メモはまだありません。問題に答えたあと、解説の下の「この問題のメモ」に書くとここに一覧で表示されます。</p>';
}
function twoStep(btn,msg,labelText,doneText,fn){
  btn.addEventListener('click',()=>{
    if(!btn.dataset.armed){btn.dataset.armed='1';btn.textContent='本当に削除する（元に戻せません）';msg.textContent='';return}
    delete btn.dataset.armed;fn();btn.textContent=labelText;msg.textContent=doneText;
  });
}
function clearMemo(){
  memoFlush=null;clearTimeout(memoTimer);
  memo={q:{},pad:''};try{localStorage.removeItem(MKEY)}catch(e){}
  $('pad').value='';if($('qm'))$('qm').value='';renderList();
}
twoStep($('mReset'),$('mMsg'),'メモをすべて削除','メモを削除しました',clearMemo);
if($('resetMemo'))twoStep($('resetMemo'),$('rmsg2'),'このブラウザのメモをすべて削除','メモを削除しました',clearMemo);
if($('reset'))twoStep($('reset'),$('rmsg'),'このブラウザの成績・付箋・途中経過をすべて削除','成績・付箋・途中経過を削除しました（メモは残っています）',()=>{
  st={};ex={p:{},r:{}};try{localStorage.removeItem(KEY);localStorage.removeItem(EKEY)}catch(e){}
  if(view==='home')renderHome();else tally();
  updatePick(false);
});

// ---------- キーボード操作（演習） ----------
document.addEventListener('keydown',e=>{
  if(view!=='quiz'||(lb&&lb.open))return;
  const t=e.target;
  if(t.closest&&t.closest('.tools'))return;
  if(t.tagName==='SELECT'||t.tagName==='TEXTAREA'||t.tagName==='INPUT'||t.tagName==='SUMMARY'||(t.tagName==='BUTTON'&&e.key==='Enter'))return;
  if(e.ctrlKey||e.metaKey||e.altKey)return;
  if(answered===null&&/^[1-4]$/.test(e.key)&&$('ch'))answer(+e.key-1);
  else if(e.key==='Enter'&&answered!==null&&$('nx')){e.preventDefault();next()}
});

// ---------- メニューの操作 ----------
if($('entries'))$('entries').addEventListener('click',e=>{
  const b=e.target.closest('button[data-act]');if(!b||!ready)return;
  const a=b.dataset.act;
  if(a==='exam')startExam(b.dataset.y,false);
  else if(a==='rand')startRandom({ys:null,fs:null,m:'all',n:+b.dataset.n,w:pickW()});
  else if(a==='hot')startRandom({ys:null,fs:null,m:'all',n:10,w:true,hot:true});
  else if(a==='term')startTerm(b.dataset.t);
  else if(a==='field')startRandom({ys:null,fs:[b.dataset.f],m:'all',n:10});
  else if(a==='sticky')startRandom({ys:null,fs:null,m:'sticky',n:999});
  else if(a==='wrong')startRandom({ys:null,fs:null,m:'wrong',n:999});
});
if($('fExam'))$('fExam').addEventListener('change',renderExamPick);
if($('examGo'))$('examGo').addEventListener('click',()=>{if(ready&&$('fExam').value)startExam($('fExam').value,false)});
if($('examNew'))$('examNew').addEventListener('click',()=>{
  const b=$('examNew');
  if(!newArmed){newArmed=true;b.textContent='途中経過を消して最初から';return}
  startExam($('fExam').value,true);
});
// ---------- ランダム演習の条件（回・分野は複数選択、選択内容はブラウザに記憶） ----------
const checks=id=>$(id)?[...$(id).querySelectorAll('input[type=checkbox]')]:[];
function pickConf(){
  const ys=checks('yList').filter(c=>c.checked).map(c=>c.value),fs=checks('fList').filter(c=>c.checked).map(c=>c.value);
  return{ys,fs,m:$('fMode').value,n:+$('fCount').value,w:pickW()};
}
function pickW(){const w=$('fWeight');return w?w.checked:true}
function setPick(p){
  if(p.ys){const s=new Set(p.ys);checks('yList').forEach(c=>{c.checked=s.has(c.value)})}
  if(p.fs){const s=new Set(p.fs);checks('fList').forEach(c=>{c.checked=s.has(c.value)})}
  if(p.m&&$('fMode').querySelector(`option[value="${p.m}"]`))$('fMode').value=p.m;
  if(p.n&&[...$('fCount').options].some(o=>+o.value===+p.n))$('fCount').value=String(p.n);
  if(typeof p.w==='boolean'&&$('fWeight'))$('fWeight').checked=p.w;
}
function updatePick(persist){
  if(!ready||!$('yList'))return;
  const c=pickConf();
  if(persist)store(PKEY,c);
  const nq=c.ys.reduce((n,y)=>n+(YN[y]||0),0);
  $('ySum').textContent=c.ys.length?(c.ys.length===KY.length?`全${KY.length}回・${nq.toLocaleString()}問`:`${c.ys.length}回・${nq.toLocaleString()}問`):'未選択';
  const pool=c.ys.length&&c.fs.length?poolFor(c):[];
  const why=!c.ys.length?'回を1つ以上選んでください。':!c.fs.length?'分野を1つ以上選んでください。':!pool.length?'この条件に当てはまる問題はありません。':'';
  $('pickCount').textContent=why||`対象 ${pool.length.toLocaleString()}問から ${Math.min(c.n,pool.length).toLocaleString()}問を出題します${c.w&&hasTerms()?'（頻出用語を含む問題が出やすくなります）':''}。`;
  if($('wRow'))$('wRow').hidden=!hasTerms();
  $('pickCount').classList.toggle('ng',!!why);
  $('start').disabled=!!why;
}
if($('yPick')){
  $('yPick').querySelector('.yquick').addEventListener('click',e=>{
    const b=e.target.closest('button[data-q]');if(!b)return;
    const q=b.dataset.q,cs=checks('yList');
    cs.forEach((c,i)=>{c.checked=q==='all'?true:q==='none'?false:q==='r'?/^r/.test(c.value):q==='h'?/^h/.test(c.value):i<+q});
    updatePick(true);
  });
  $('yList').addEventListener('change',()=>updatePick(true));
  $('fList').addEventListener('change',()=>updatePick(true));
  $('fMode').addEventListener('change',()=>updatePick(true));
  $('fCount').addEventListener('change',()=>updatePick(true));
  if($('fWeight'))$('fWeight').addEventListener('change',()=>updatePick(true));
}
if($('start'))$('start').addEventListener('click',()=>{
  if(!ready)return;
  const c=pickConf();if(!c.ys.length||!c.fs.length)return;
  startRandom({ys:c.ys.length===KY.length?null:c.ys,fs:c.fs.length===3?null:c.fs,m:c.m,n:c.n,w:c.w});
});

// ---------- データ読み込み ----------
function init(){
  normalize();normalizeTerms();ready=true;fillSelects();
  // トップの件数表記を実データに合わせる（データがそろった回だけ）
  if(KY.length){
    const rng=KY.length===1?KY[0].label:KY[KY.length-1].label+'〜'+KY[0].label;
    document.querySelectorAll('[data-kcount]').forEach(e=>{e.textContent=`${rng}の${KY.length}回分・${KQ.length.toLocaleString()}問`});
  }
  let started=false;
  // URL からの初期選択（?exam=r08 / ?year=r08 / ?field=S）
  // ランダム演習の条件：保存した選択 → URL（?year=r08,r07&field=S,M）の順に反映
  const saved=load(PKEY,null);
  setPick({ys:KY.map(k=>k.y),fs:FK});
  if(saved)setPick({ys:Array.isArray(saved.ys)?saved.ys.filter(y=>YL[y]):null,fs:Array.isArray(saved.fs)?saved.fs.filter(f=>F[f]):null,m:saved.m,n:saved.n,w:saved.w});
  if($('yPick'))$('yPick').open=!window.matchMedia('(max-width:600px)').matches;
  try{
    const p=new URLSearchParams(location.search);
    const list=v=>(v||'').split(',').map(x=>x.trim()).filter(Boolean);
    const ys=list(p.get('year')).filter(y=>YL[y]),fs=list(p.get('field')).filter(f=>F[f]),e=p.get('exam'),t=p.get('term');
    if(ys.length||fs.length){setPick({ys:ys.length?ys:null,fs:fs.length?fs:null});updatePick(true)}
    if(e&&YL[e]){$('fExam').value=e;startExam(e,false);started=true}
    else if(t&&TBY[t]){startTerm(t);started=true}
    else if(fs.length&&KQ.length){startRandom({ys:ys.length?ys:null,fs,m:'all',n:10});started=true}
  }catch(err){}
  updatePick(false);
  if(!started){setView('home');renderHome()}else tally();
}
function fail(){
  const en=$('entries');
  if(en)en.innerHTML='<div class="card empty" role="alert">過去問データを読み込めませんでした。通信状態を確認して、ページを再読み込みしてください。</div>';
}
// kakomon.js（必須）と terms.js（任意）を並行して読み込み、両方の結果がそろってから始める
function loadScript(src){
  return new Promise(res=>{
    const s=document.createElement('script');s.src=src;
    s.addEventListener('load',()=>res(true));s.addEventListener('error',()=>res(false));
    document.body.appendChild(s);
  });
}
Promise.all([
  Array.isArray(window.KQ)?Promise.resolve(true):loadScript(main.dataset.src||'js/kakomon.js'),
  window.KT?Promise.resolve(true):loadScript(main.dataset.terms||'js/terms.js')
]).then(([ok])=>{if(ok&&Array.isArray(window.KQ))init();else fail()});
})();

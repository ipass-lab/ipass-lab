// ITパスポート演習 本体。外部通信なし。記録はこのブラウザの localStorage のみ。
(function(){
'use strict';
const Q=window.QS||[];
const F={S:'ストラテジ系',M:'マネジメント系',T:'テクノロジ系'};
const K=['ア','イ','ウ','エ'];
const KEY='ipass-v1';
const $=id=>document.getElementById(id);
if(!$('main'))return;
let st={};
try{st=JSON.parse(localStorage.getItem(KEY))||{}}catch(e){st={}}
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(st))}catch(e){}};
const rec=id=>st[id]||(st[id]={a:0,c:0,s:false,last:null});
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const shuffle=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
// CSPでstyle属性を使えないため、幅はJSで設定する
const widths=()=>document.querySelectorAll('[data-w]').forEach(e=>{e.style.width=e.dataset.w+'%'});
let set=[],idx=0,order=[],answered=null,log=[];

function tally(){
  const ids=Object.keys(st).filter(k=>st[k].a>0);
  const a=ids.reduce((n,k)=>n+st[k].a,0),c=ids.reduce((n,k)=>n+st[k].c,0);
  const s=Object.keys(st).filter(k=>st[k].s).length;
  $('tally').innerHTML=`<span><b>${ids.length}/${Q.length}</b>解いた問題</span><span><b>${a?Math.round(c/a*100):0}%</b>通算正答率</span><span><b>${s}</b>付箋</span>`;
}
function start(){
  const f=$('fField').value,m=$('fMode').value,n=+$('fCount').value;
  let pool=Q.filter(q=>f==='all'||q[1]===f);
  if(m==='sticky')pool=pool.filter(q=>st[q[0]]&&st[q[0]].s);
  if(m==='wrong')pool=pool.filter(q=>st[q[0]]&&st[q[0]].last===false);
  if(m==='new')pool=pool.filter(q=>!st[q[0]]||!st[q[0]].a);
  set=shuffle(pool).slice(0,n);idx=0;log=[];
  if(!set.length){
    const msg={sticky:'付箋を貼った問題はまだありません。解説の下の「付箋を貼る」で追加できます。',wrong:'前回間違えた問題はありません。',new:'この条件の問題はすべて解きました。「すべて」で復習しましょう。'}[m]||'問題がありません。';
    $('main').innerHTML=`<div class="card empty">${msg}</div>`;return;
  }
  show();
}
function show(){
  const q=set[idx];answered=null;
  order=shuffle([0,1,2,3]);
  const r=st[q[0]];
  $('main').innerHTML=`<div class="card">
    <div class="meta"><span class="tag">${F[q[1]]}</span><span>${idx+1} / ${set.length}問${r&&r.a?` ・ 過去 ${r.c}/${r.a} 正解`:''}</span></div>
    <div class="prog"><i data-w="${idx/set.length*100}"></i></div>
    <p class="q">${esc(q[2])}</p>
    <div class="ch" id="ch">${order.map((o,i)=>`<button type="button" data-i="${i}"><span class="k">${K[i]}</span><span>${esc(q[3][o])}</span></button>`).join('')}</div>
    <div id="after"></div>
    <p class="hint">キーボードの 1〜4 で回答、Enter で次へ進めます。</p></div>`;
  widths();
  $('ch').addEventListener('click',e=>{const b=e.target.closest('button');if(b)answer(+b.dataset.i)});
}
function answer(i){
  if(answered!==null)return;
  const q=set[idx],ok=order[i]===0;answered=i;
  const r=rec(q[0]);r.a++;if(ok)r.c++;r.last=ok;save();
  log.push({q,ok});
  $('ch').querySelectorAll('button').forEach((b,j)=>{b.disabled=true;if(order[j]===0)b.classList.add('right');else if(j===i)b.classList.add('wrong')});
  const ci=order.indexOf(0);
  $('after').innerHTML=`<div class="exp"><h3 class="${ok?'ok':'ng'}">${ok?'○ 正解':'× 不正解 ── 正解は '+K[ci]}</h3><p>${esc(q[4])}</p></div>
    <div class="acts"><button type="button" class="fusen" id="fu" aria-pressed="${r.s}">${r.s?'付箋を外す':'付箋を貼る'}</button>
    <button type="button" class="go" id="nx">${idx+1<set.length?'次の問題へ':'結果を見る'}</button></div>`;
  $('fu').addEventListener('click',()=>{r.s=!r.s;save();$('fu').setAttribute('aria-pressed',r.s);$('fu').textContent=r.s?'付箋を外す':'付箋を貼る';tally()});
  $('nx').addEventListener('click',next);$('nx').focus();
  tally();
}
function next(){idx++;if(idx<set.length)show();else result()}
function result(){
  const c=log.filter(l=>l.ok).length,p=Math.round(c/log.length*100);
  const by=Object.keys(F).map(k=>{const L=log.filter(l=>l.q[1]===k);return{k,n:L.length,c:L.filter(l=>l.ok).length}}).filter(x=>x.n);
  const miss=log.filter(l=>!l.ok);
  $('main').innerHTML=`<div class="card">
    <div class="big">${p}<small>%</small></div>
    <p class="verdict">${log.length}問中 ${c}問正解 ── ${p>=60?'合格ラインの目安（60%）に届いています':'合格ラインの目安（60%）まであと少し'}</p>
    <div class="rows">${by.map(x=>{const v=Math.round(x.c/x.n*100);return`<div class="row"><span>${F[x.k]}</span><span class="m"><i class="${v<30?'lo':''}" data-w="${v}"></i></span><span>${x.c}/${x.n}</span></div>`}).join('')}</div>
    ${miss.length?`<h3>間違えた問題</h3><ul class="miss">${miss.map(l=>`<li>${esc(l.q[2])}<br><span class="ok">正解：${esc(l.q[3][0])}</span></li>`).join('')}</ul>`:'<p>全問正解です。</p>'}
    <div class="acts">${miss.length?'<button type="button" id="rw">間違えた問題だけ解き直す</button>':''}<button type="button" class="go" id="again">同じ条件でもう一度</button></div></div>`;
  widths();
  $('again').addEventListener('click',start);
  if(miss.length)$('rw').addEventListener('click',()=>{set=shuffle(miss.map(l=>l.q));idx=0;log=[];show()});
}
document.addEventListener('keydown',e=>{
  if(e.target.tagName==='SELECT'||e.target.tagName==='BUTTON'&&e.key==='Enter')return;
  if(answered===null&&/^[1-4]$/.test(e.key)&&$('ch'))answer(+e.key-1);
  else if(e.key==='Enter'&&answered!==null&&$('nx')){e.preventDefault();next()}
});
// 分野ページからのリンク（?field=S など）
try{const f=new URLSearchParams(location.search).get('field');if(f&&F[f])$('fField').value=f}catch(e){}
$('start').addEventListener('click',start);
let armed=false;
$('reset').addEventListener('click',()=>{
  if(!armed){armed=true;$('reset').textContent='本当に削除する（元に戻せません）';$('rmsg').textContent='';return}
  armed=false;st={};try{localStorage.removeItem(KEY)}catch(e){}
  $('reset').textContent='このブラウザの成績と付箋をすべて削除';$('rmsg').textContent='削除しました';tally();
});
tally();start();
})();

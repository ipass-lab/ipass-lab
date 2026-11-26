// 頻出用語ランキングの検索（表の行を絞り込むだけ。外部通信なし）
(function(){
'use strict';
const q=document.getElementById('tq'),tb=document.getElementById('tbody');
if(!q||!tb)return;
const rows=[...tb.querySelectorAll('tr')];
const norm=s=>s.normalize('NFKC').toUpperCase().replace(/[・\s]/g,'');
const keys=rows.map(r=>norm(r.querySelector('.tt').textContent));
const n=document.getElementById('tqn'),none=document.getElementById('tnone');
function run(){
  const v=norm(q.value);let c=0;
  rows.forEach((r,i)=>{const on=!v||keys[i].includes(v);r.hidden=!on;if(on)c++});
  n.textContent=v?`${c}語が該当`:`${rows.length}語`;
  none.hidden=c>0;
}
q.addEventListener('input',run);
})();

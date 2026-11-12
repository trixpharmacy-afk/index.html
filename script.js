const $=s=>document.querySelector(s);
const LS={get:(k,d)=>{try{const v=JSON.parse(localStorage.getItem(k));return v===null?d:v}catch(e){return d}},set:(k,v)=>localStorage.setItem(k,JSON.stringify(v))};
async function hash(t){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* ---------- MEDICINE CATALOGUE: read from the <script class="drugs"> data blocks in the HTML box ---------- */
const CATS={},DRUGS=[];
document.querySelectorAll('script.drugs').forEach(s=>s.textContent.split('\n').forEach(l=>{
  l=l.trim();if(!l)return;
  if(l[0]==='#'){const p=l.slice(1).split('|');CATS[p[0]]=p[1];return}
  const f=l.split('|');
  DRUGS.push({id:f[0],gen:f[1]||'',name:f[2]||f[1]||f[0],unit:f[3]||'',ins:f[4]||'',base:true});
}));
DRUGS.forEach(m=>{m.cls=/^[A-Z]\d\d/.test(m.id)?(m.id.slice(0,3)+' '+(CATS[m.id.slice(0,3)]||'')).trim():'Medical supplies & devices'});
const MAP=new Map(DRUGS.map(m=>[m.id,m]));
const LEG={AC:'anti-cancer, needs prior approval',D:'dermatologist',DT:'dentist / stomatologist',GYN:'gynecologist',HU:'hospital use, prior authorization if bought outside',IM:'internal medicine specialist',M:'expensive drug, needs explanatory note',NEPHRO:'nephrologist',OPHT:'ophthalmologist',PED:'pediatrician',PSYCH:'psychiatrist / psychologist',SPEC:'medical specialist',SURG:'surgeon',UROL:'urologist',ONCO:'oncologist',ORTH:'orthopedist',ENT:'ENT specialist',NEUROL:'neurologist',CARDIOL:'cardiologist',ALLERGOL:'allergologist'};
const insTag=m=>{
  if(!m||!m.ins)return'';
  const t=m.ins.split(/\s*(?:or|&|and|,)\s*/i).map(x=>LEG[x.toUpperCase()]||x).join('; ');
  return `<span class="tag" title="Insurance prescribing rule: ${esc(t)}">${esc(m.ins)}</span>`;
};

/* ---------- state: every user has their OWN data ---------- */
const D0=()=>({meds:[],stock:[],sales:[],suppliers:[],purchases:[],codes:{},set:{name:'',low:20,days:90}});
let users=LS.get('trix_users',[]);
let me=LS.get('trix_session',null);
const loadD=id=>{const d=Object.assign(D0(),LS.get('trix_data_'+id,{}));d.set=Object.assign({name:'',low:20,days:90},d.set);d.suppliers.forEach(s=>{s.items=s.items||[]});return d};
const data=()=>loadD(me);
const save=d=>LS.set('trix_data_'+me,d);
const user=()=>users.find(u=>u.id===me);
const logAct=(uid,txt)=>{const l=LS.get('trix_log',[]);l.unshift({uid,txt,t:new Date().toLocaleString()});LS.set('trix_log',l.slice(0,500))};

/* ---------- helpers ---------- */
const dstr=n=>n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0');
const today=()=>dstr(new Date());
const daysTo=x=>Math.ceil((new Date(x)-new Date(today()))/864e5);
const money=n=>Number(n||0).toLocaleString()+' RWF';
const allMeds=d=>[...DRUGS,...d.meds];
const medOf=(d,id)=>MAP.get(id)||d.meds.find(m=>m.id===id);
const dn=m=>m.base?m.name:m.name+(m.form&&m.form!=='-'?' '+m.form:'');
const mname=(d,id)=>{const m=medOf(d,id);return m?dn(m):'(removed medicine)'};
const avail=(d,id)=>d.stock.filter(b=>b.medId===id&&daysTo(b.expiry)>=0).reduce((s,b)=>s+b.qty,0);
const fefo=(d,id)=>d.stock.filter(b=>b.medId===id&&b.qty>0&&daysTo(b.expiry)>=0).sort((a,c)=>a.expiry.localeCompare(c.expiry));
const price=(d,id)=>{const b=fefo(d,id)[0];return b?b.price:0};
const status=(d,b)=>{const n=daysTo(b.expiry);if(b.qty<=0)return['Out of stock','r'];if(n<0)return['Expired','r'];if(n<=d.set.days)return['Near expiry',''];return['OK','g']};
const tag=s=>`<span class="tag ${s[1]}">${s[0]}</span>`;
const lowList=d=>[...new Set(d.stock.map(b=>b.medId))].map(id=>({id,a:avail(d,id)})).filter(x=>x.a<=d.set.low).sort((a,b)=>a.a-b.a);
const dayTxt=n=>n<0?Math.abs(n)+' days ago':n+' days';
function deduct(d,id,qty){
  let need=qty,cost=0;const parts=[];
  for(const b of fefo(d,id)){const t=Math.min(b.qty,need);b.qty-=t;need-=t;cost+=t*b.cost;parts.push(b.batch+'x'+t);if(!need)break}
  return{parts,cost};
}

/* ---------- searchable medicine picker (works with 1,500+ medicines) ---------- */
const HC=new WeakMap();
const rank=(m,q)=>{const n=dn(m).toLowerCase();return n.startsWith(q)?0:((m.gen||'').toLowerCase().startsWith(q)?1:(n.includes(q)?2:3))};
const hay=m=>{let h=HC.get(m);if(!h){h=(dn(m)+' '+(m.gen||'')+' '+m.id+' '+(m.cls||'')).toLowerCase();HC.set(m,h)}return h};
function picker(host,o){
  host.innerHTML='<input placeholder="'+(o.ph||'Type medicine name, generic or code...')+'" autocomplete="off"><div class="pl"></div>';
  const inp=host.firstChild,pl=host.lastChild;let cur=[];
  const draw=()=>{
    const q=inp.value.toLowerCase().trim();
    if(!q&&!o.showEmpty){pl.classList.remove('on');return}
    const ws=q.split(/\s+/).filter(Boolean);
    cur=o.list().filter(m=>ws.every(w=>hay(m).includes(w))).sort((a,b)=>rank(a,q)-rank(b,q)).slice(0,8);
    pl.innerHTML=cur.map((m,i)=>`<div class="pi" data-i="${i}">${esc(dn(m))}<small>${esc(m.gen||m.cls||'')}${m.unit?' - '+esc(m.unit):''}${o.extra?' - '+esc(o.extra(m)):''}</small></div>`).join('')||'<div class="pi mute">No match</div>';
    pl.classList.add('on');
  };
  inp.oninput=()=>{host.dataset.v='';draw()};inp.onfocus=draw;
  pl.onclick=e=>{const i=e.target.closest('.pi');if(!i||i.dataset.i===undefined)return;const m=cur[+i.dataset.i];inp.value=dn(m);pl.classList.remove('on');host.dataset.v=m.id;if(o.onPick)o.onPick(m)};
  return{set:m=>{inp.value=m?dn(m):'';host.dataset.v=m?m.id:'';if(m&&o.onPick)o.onPick(m)}};
}

/* ---------- sign in / up / reset ---------- */
const say=(t,ok)=>{$('#msg').textContent=t;$('#msg').className='msg '+(ok?'ok':'err')};
document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('.tabs button').forEach(x=>x.classList.remove('on'));b.classList.add('on');
  ['in','up','rs'].forEach(t=>$('#f-'+t).style.display=t===b.dataset.t?'block':'none');say('');
});
$('#doUp').onclick=async()=>{
  const n=$('#upN').value.trim(),e=$('#upE').value.trim().toLowerCase(),p=$('#upP').value,a=$('#upA').value.trim().toLowerCase();
  if(!n||!e.includes('@')||p.length<6||!a)return say('Fill all fields (password min 6).');
  if(users.some(u=>u.email===e))return say('This email already has an account.');
  const u={id:'u'+Date.now(),name:n,email:e,pass:await hash(p),q:$('#upQ').value,ans:await hash(a),
    role:users.length?'user':'owner',created:today()};
  users.push(u);logAct(u.id,'Created account');
  LS.set('trix_users',users);me=u.id;LS.set('trix_session',me);start();
};
$('#doIn').onclick=async()=>{
  const e=$('#inE').value.trim().toLowerCase(),h=await hash($('#inP').value);
  const u=users.find(x=>x.email===e&&x.pass===h);
  if(!u)return say('Wrong email or password.');
  if(u.off)return say('Account suspended. Contact the owner.');
  logAct(u.id,'Signed in');
  me=u.id;LS.set('trix_session',me);start();
};
$('#getQ').onclick=()=>{
  const u=users.find(x=>x.email===$('#rsE').value.trim().toLowerCase());
  $('#rsQ').textContent=u?u.q:'';if(!u)say('No account with that email.');else say('');
};
$('#doRs').onclick=async()=>{
  const u=users.find(x=>x.email===$('#rsE').value.trim().toLowerCase());
  if(!u)return say('No account with that email.');
  if($('#rsP').value.length<6)return say('New password must be at least 6 characters.');
  if(await hash($('#rsA').value.trim().toLowerCase())!==u.ans)return say('Security answer is wrong.');
  u.pass=await hash($('#rsP').value);LS.set('trix_users',users);
  logAct(u.id,'Reset own password');say('Password changed. Now sign in.',true);
};

/* ---------- shell ---------- */
let cart=[],pre={},expF='all',repR='7',camStop=null,openSup=null,catQ='',catC='',catP=0;
const P={};
function start(){
  $('#auth').style.display='none';$('#app').style.display='block';
  const u=user();$('#av').textContent=u.name.slice(0,2).toUpperCase();
  $('#navTeam').style.display=u.role==='owner'?'block':'none';
  go('dash');
}
const toggle=o=>{$('#side').classList.toggle('open',o);$('#shade').style.display=o?'block':'none'};
$('#burger').onclick=()=>toggle(true);$('#shade').onclick=()=>toggle(false);
$('#logout').onclick=()=>{logAct(me,'Signed out');localStorage.removeItem('trix_session');location.reload()};
document.querySelectorAll('#side a[data-v]').forEach(a=>a.onclick=()=>{go(a.dataset.v);toggle(false)});
function go(v,arg){
  const el=$('#view');
  if(camStop){camStop();camStop=null}
  el.onclick=null;el.oninput=null;el.onchange=null;
  document.querySelectorAll('#side a[data-v]').forEach(a=>a.classList.toggle('on',a.dataset.v===v));
  window.scrollTo(0,0);
  P[v](el,arg);
}
const wireGo=el=>{el.onclick=e=>{const g=e.target.closest('[data-go]');if(g)go(g.dataset.go)}};

/* ---------- DASHBOARD ---------- */
P.dash=el=>{
  const d=data(),u=user();
  const live=d.stock.filter(b=>b.qty>0);
  const units=live.filter(b=>daysTo(b.expiry)>=0).reduce((s,b)=>s+b.qty,0);
  const ex=live.filter(b=>daysTo(b.expiry)<0).length;
  const near=live.filter(b=>{const n=daysTo(b.expiry);return n>=0&&n<=d.set.days}).length;
  const low=lowList(d);
  const ts=d.sales.filter(s=>dstr(new Date(s.date))===today());
  const watch=[...live].sort((a,b)=>a.expiry.localeCompare(b.expiry)).slice(0,6);
  el.innerHTML=`<h2>${esc(d.set.name||u.name)}</h2>
  <p class="mute">${u.role==='owner'?'Owner account - you can inspect every user.':'Your private pharmacy workspace.'}</p>
  <div class="btns" style="margin:14px 0"><button class="btn" data-go="stock">+ Receive stock</button><button class="btn p" data-go="sale">+ Record sale</button></div>
  <div class="grid">
    <div class="card"><div class="mute">Units in stock</div><div class="big">${units}</div><div class="mute">available batch quantities</div></div>
    <div class="card"><div class="mute">Expired / expiring</div><div class="big">${ex+near}</div><div class="mute">${ex} expired, ${near} due within ${d.set.days} days</div></div>
    <div class="card"><div class="mute">Low stock</div><div class="big">${low.length}</div><div class="mute">at or below ${d.set.low} units</div></div>
    <div class="card"><div class="mute">Today's sales</div><div class="big" style="font-size:26px">${money(ts.reduce((s,x)=>s+x.total,0))}</div><div class="mute">${ts.length} sales</div></div>
    <div class="card"><div class="mute">Catalogue</div><div class="big">${allMeds(d).length}</div><div class="mute">medicines you can stock</div></div>
    ${u.role==='owner'?`<div class="card"><div class="mute">Registered users</div><div class="big">${users.length}</div><div class="mute">see Team &amp; access</div></div>`:''}
  </div>
  <div class="card scroll"><b>Expiry watch</b><table><thead><tr><th>MEDICINE</th><th>BATCH</th><th>EXPIRY</th><th>STATUS</th></tr></thead><tbody>
  ${watch.map(b=>`<tr><td>${esc(mname(d,b.medId))}</td><td>${esc(b.batch)}</td><td>${b.expiry}</td><td>${tag(status(d,b))}</td></tr>`).join('')||'<tr><td colspan="4" class="mute">No stock yet. Tap Receive stock.</td></tr>'}
  </tbody></table></div>
  <div class="card scroll" style="margin-top:14px"><b>Low stock</b><table><thead><tr><th>MEDICINE</th><th>UNITS LEFT</th></tr></thead><tbody>
  ${low.slice(0,6).map(x=>`<tr><td>${esc(mname(d,x.id))}</td><td><span class="tag ${x.a===0?'r':''}">${x.a}</span></td></tr>`).join('')||'<tr><td colspan="2" class="mute">Nothing is running low.</td></tr>'}
  </tbody></table></div>`;
  wireGo(el);
};

/* ---------- STOCK & BATCHES (receive from catalogue, optionally from a supplier's list) ---------- */
P.stock=el=>{
  const d0=data(),p=pre;pre={};
  let showAll=false;
  el.innerHTML=`<h2>Stock &amp; batches</h2>
  <div class="card" style="margin:14px 0"><b>Receive stock</b>
  <label>Supplier</label><select id="sS"><option value="">- no supplier -</option>${d0.suppliers.map(s=>`<option ${p.sup===s.name?'selected':''}>${esc(s.name)}</option>`).join('')}</select>
  <label>Medicine (from catalogue)</label><div id="sMed"></div>
  <div class="mute" id="sHint" style="margin:-4px 0 12px"></div>
  <div class="two"><div><label>Batch number</label><input id="sB"></div><div><label>Expiry date</label><input id="sE" type="date"></div></div>
  <div class="two"><div><label>Quantity received</label><input id="sQ" type="number" min="1" inputmode="numeric"></div><div><label>Barcode (optional)</label><input id="sC" value="${esc(p.code||'')}"></div></div>
  <div class="two"><div><label>Cost price (RWF each)</label><input id="sCo" type="number" min="0"></div><div><label>Selling price (RWF each)</label><input id="sP" type="number" min="0"></div></div>
  <p class="msg" id="sMsg"></p><button class="btn p" id="sSave">Save stock</button></div>
  <input id="sF" placeholder="Search stock...">
  <div class="card scroll"><table><thead><tr><th>MEDICINE</th><th>BATCH</th><th>EXPIRY</th><th>QTY</th><th>PRICE</th><th>STATUS</th><th></th></tr></thead><tbody id="sRows"></tbody></table></div>`;
  const supObj=()=>data().suppliers.find(s=>s.name===$('#sS').value);
  const lst=()=>{const d=data(),s=supObj();return(s&&!showAll)?s.items.map(i=>medOf(d,i.medId)).filter(Boolean):allMeds(d)};
  const hint=()=>{
    const s=supObj();
    $('#sHint').innerHTML=s?(showAll?`Showing the full catalogue. <a id="sTog" style="color:var(--teal);cursor:pointer">Only ${esc(s.name)}'s medicines</a>`
      :`Showing ${s.items.length} medicine(s) supplied by ${esc(s.name)}. <a id="sTog" style="color:var(--teal);cursor:pointer">Show full catalogue</a>`)
      :'Type a name, generic name or code to search the catalogue.';
    const t=$('#sTog');if(t)t.onclick=()=>{showAll=!showAll;hint()};
  };
  const pk=picker($('#sMed'),{list:lst,showEmpty:false,onPick:m=>{
    const d=data(),last=d.stock.filter(b=>b.medId===m.id).slice(-1)[0],s=supObj(),si=s&&s.items.find(i=>i.medId===m.id);
    $('#sCo').value=si?si.cost:(last?last.cost:(p.cost||''));
    $('#sP').value=last?last.price:'';
    const code=Object.keys(d.codes).find(k=>d.codes[k]===m.id);if(code)$('#sC').value=code;
    $('#sHint').textContent=m.unit?'Selling unit: '+m.unit:'';
  }});
  hint();
  $('#sS').onchange=()=>{showAll=false;hint()};
  if(p.med){const m=medOf(d0,p.med);if(m){pk.set(m);if(p.cost&&!$('#sCo').value)$('#sCo').value=p.cost}}
  const draw=()=>{const d=data(),q=$('#sF').value.toLowerCase();
    $('#sRows').innerHTML=[...d.stock].sort((a,b)=>a.expiry.localeCompare(b.expiry)).filter(b=>(mname(d,b.medId)+b.batch).toLowerCase().includes(q))
    .map(b=>`<tr><td>${esc(mname(d,b.medId))}</td><td>${esc(b.batch)}</td><td>${b.expiry}</td><td>${b.qty}</td><td>${b.price.toLocaleString()}</td><td>${tag(status(d,b))}</td>
    <td><button class="btn sm" data-a="adj" data-i="${b.id}">Adjust</button><button class="btn sm" data-a="del" data-i="${b.id}">Delete</button></td></tr>`).join('')
    ||'<tr><td colspan="7" class="mute">No batches yet.</td></tr>'};
  draw();$('#sF').oninput=draw;
  $('#sSave').onclick=()=>{
    const d=data(),m=$('#sMed').dataset.v,b=$('#sB').value.trim(),e=$('#sE').value,q=parseInt($('#sQ').value),co=parseFloat($('#sCo').value)||0,pr=parseFloat($('#sP').value),c=$('#sC').value.trim(),sp=$('#sS').value;
    const err=t=>{$('#sMsg').textContent=t;$('#sMsg').className='msg err'};
    if(!m)return err('Pick a medicine from the list first.');
    if(!b||!e||!(q>0)||isNaN(pr))return err('Fill batch, expiry, quantity and selling price.');
    if(daysTo(e)<0&&!confirm('This expiry date is already past. Save anyway?'))return;
    if(c&&d.codes[c]&&d.codes[c]!==m)return err('This barcode already belongs to another medicine.');
    const x=d.stock.find(z=>z.medId===m&&z.batch===b);
    if(x){x.qty+=q;x.price=pr;x.cost=co||x.cost;x.expiry=e}
    else d.stock.push({id:'B'+Date.now(),medId:m,batch:b,expiry:e,qty:q,cost:co,price:pr,supplier:sp,received:today()});
    if(c)d.codes[c]=m;
    if(sp){const s=d.suppliers.find(z=>z.name===sp);if(s){const it=s.items.find(i=>i.medId===m);if(it){if(co)it.cost=co}else s.items.push({medId:m,cost:co})}}
    d.purchases.unshift({id:'P'+Date.now(),date:today(),supplier:sp,medId:m,batch:b,qty:q,cost:co});
    save(d);logAct(me,'Received '+q+' x '+mname(d,m)+' (batch '+b+')');go('stock');
  };
  $('#sRows').onclick=e=>{
    const a=e.target.dataset.a,i=e.target.dataset.i;if(!a)return;
    const d=data(),b=d.stock.find(z=>z.id===i);
    if(a==='adj'){const n=prompt('New quantity for batch '+b.batch+' (now '+b.qty+')');if(n===null||isNaN(parseInt(n))||parseInt(n)<0)return;
      logAct(me,'Adjusted '+mname(d,b.medId)+' batch '+b.batch+': '+b.qty+' to '+parseInt(n));b.qty=parseInt(n)}
    if(a==='del'){if(!confirm('Delete this batch?'))return;d.stock=d.stock.filter(z=>z.id!==i);logAct(me,'Deleted batch '+b.batch+' of '+mname(d,b.medId))}
    save(d);draw();
  };
};

/* ---------- BARCODE SCANNER ---------- */
function addCart(id,qty){
  const d=data(),line=cart.find(c=>c.medId===id),n=(line?line.qty:0)+qty;
  if(avail(d,id)<n)return'Not enough stock (only '+avail(d,id)+' available).';
  if(line)line.qty=n;else cart.push({medId:id,qty});
  return'';
}
P.scan=el=>{
  el.innerHTML=`<h2>Barcode scanner</h2><p class="mute">Use a USB / Bluetooth scanner (types the code and presses Enter) or the phone camera.</p>
  <div class="card" style="margin:14px 0"><input id="bc" placeholder="Scan or type barcode, then Enter" inputmode="numeric">
  <div class="btns"><button class="btn p" id="bGo">Search</button><button class="btn" id="bCam">Use camera</button><button class="btn" id="bStop" style="display:none">Stop camera</button></div>
  <video id="vid" playsinline muted style="display:none;width:100%;border-radius:14px;margin-top:12px"></video><p class="msg" id="bMsg"></p></div><div id="bRes"></div>`;
  const bMsg=t=>{$('#bMsg').textContent=t;$('#bMsg').className='msg err'};
  let stream=null,timer=null;
  const stopCam=()=>{clearInterval(timer);if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;const v=$('#vid');if(v){v.style.display='none';$('#bStop').style.display='none'}};
  camStop=stopCam;
  function find(code){
    const d=data(),id=d.codes[code],out=$('#bRes');if(!code)return;
    if(!id){
      out.innerHTML=`<div class="card"><b>New barcode: ${esc(code)}</b><p class="mute">Not linked to a medicine yet. Search the catalogue and link it:</p><div id="lnkPk"></div><button class="btn p" id="lnkGo">Link barcode</button></div>`;
      picker($('#lnkPk'),{list:()=>allMeds(data())});
      $('#lnkGo').onclick=()=>{const m=$('#lnkPk').dataset.v;if(!m)return bMsg('Pick a medicine from the list first.');const d=data();d.codes[code]=m;save(d);logAct(me,'Linked barcode '+code+' to '+mname(d,m));find(code)};return;
    }
    const m=medOf(d,id),bs=d.stock.filter(b=>b.medId===id&&b.qty>0).sort((a,c)=>a.expiry.localeCompare(c.expiry));
    out.innerHTML=`<div class="card"><h3 style="margin-top:0">${esc(dn(m))}</h3><p class="mute">${esc(m.gen||'')} ${esc(m.cls||'')} ${insTag(m)}</p>
    <div class="big">${avail(d,id)}</div><div class="mute">units available to sell at ${money(price(d,id))} each</div>
    <div class="scroll"><table><thead><tr><th>BATCH</th><th>EXPIRY</th><th>QTY</th><th>STATUS</th></tr></thead><tbody>
    ${bs.map(b=>`<tr><td>${esc(b.batch)}</td><td>${b.expiry}</td><td>${b.qty}</td><td>${tag(status(d,b))}</td></tr>`).join('')||'<tr><td colspan="4" class="mute">No stock.</td></tr>'}</tbody></table></div>
    <div class="btns" style="margin-top:12px"><button class="btn p" id="rSell">Add 1 to sale</button><button class="btn" id="rRec">Receive stock</button></div></div>`;
    $('#rSell').onclick=()=>{const r=addCart(id,1);if(r)return bMsg(r);go('sale')};
    $('#rRec').onclick=()=>{pre={med:id,code};go('stock')};
  }
  $('#bGo').onclick=()=>find($('#bc').value.trim());
  $('#bc').onkeydown=e=>{if(e.key==='Enter')find(e.target.value.trim())};
  $('#bStop').onclick=stopCam;
  $('#bCam').onclick=async()=>{
    if(!('BarcodeDetector' in window))return bMsg('This browser cannot read barcodes with the camera. Use a scanner or type the code (Chrome on Android works best).');
    try{
      stream=await navi

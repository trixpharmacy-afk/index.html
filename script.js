const $=s=>document.querySelector(s);
const LS={get:(k,d)=>{try{const v=JSON.parse(localStorage.getItem(k));return v===null?d:v}catch(e){return d}},set:(k,v)=>localStorage.setItem(k,JSON.stringify(v))};
async function hash(t){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* Starter list - VERIFY against the Rwanda FDA register */
const BASE_MEDS=[
["Paracetamol","500 mg tablet","Analgesic / antipyretic"],["Ibuprofen","400 mg tablet","NSAID"],
["Diclofenac","50 mg tablet","NSAID"],["Amoxicillin","500 mg capsule","Antibiotic"],
["Amoxicillin + Clavulanic acid","625 mg tablet","Antibiotic"],["Azithromycin","500 mg tablet","Antibiotic"],
["Ciprofloxacin","500 mg tablet","Antibiotic"],["Doxycycline","100 mg capsule","Antibiotic"],
["Cotrimoxazole","480 mg tablet","Antibiotic"],["Metronidazole","400 mg tablet","Antibiotic / antiprotozoal"],
["Artemether + Lumefantrine","20/120 mg tablet","Antimalarial"],["Albendazole","400 mg tablet","Anthelmintic"],
["Mebendazole","100 mg tablet","Anthelmintic"],["Fluconazole","150 mg capsule","Antifungal"],
["Oral Rehydration Salts","sachet","Rehydration"],["Zinc sulfate","20 mg dispersible tablet","Diarrhoea treatment"],
["Metformin","500 mg tablet","Antidiabetic"],["Gliclazide","80 mg tablet","Antidiabetic"],
["Amlodipine","5 mg tablet","Antihypertensive"],["Enalapril","5 mg tablet","Antihypertensive"],
["Atenolol","50 mg tablet","Antihypertensive"],["Hydrochlorothiazide","25 mg tablet","Diuretic"],
["Omeprazole","20 mg capsule","Antacid / PPI"],["Salbutamol","100 mcg inhaler","Bronchodilator"],
["Cetirizine","10 mg tablet","Antihistamine"],["Loratadine","10 mg tablet","Antihistamine"],
["Folic acid","5 mg tablet","Vitamin"],["Ferrous sulfate","200 mg tablet","Iron supplement"]
].map((m,i)=>({id:'b'+i,name:m[0],form:m[1],cls:m[2],base:true}));

/* ---------- state: every user has their OWN data ---------- */
const D0=()=>({meds:[],stock:[],sales:[],suppliers:[],purchases:[],codes:{},set:{name:'',low:20,days:90}});
let users=LS.get('trix_users',[]);
let me=LS.get('trix_session',null);
const loadD=id=>{const d=Object.assign(D0(),LS.get('trix_data_'+id,{}));d.set=Object.assign({name:'',low:20,days:90},d.set);return d};
const data=()=>loadD(me);
const save=d=>LS.set('trix_data_'+me,d);
const user=()=>users.find(u=>u.id===me);
const logAct=(uid,txt)=>{const l=LS.get('trix_log',[]);l.unshift({uid,txt,t:new Date().toLocaleString()});LS.set('trix_log',l.slice(0,500))};

/* ---------- helpers ---------- */
const dstr=n=>n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0');
const today=()=>dstr(new Date());
const daysTo=x=>Math.ceil((new Date(x)-new Date(today()))/864e5);
const money=n=>Number(n||0).toLocaleString()+' RWF';
const allMeds=d=>[...BASE_MEDS,...d.meds];
const medOf=(d,id)=>allMeds(d).find(m=>m.id===id);
const mname=(d,id)=>{const m=medOf(d,id);return m?m.name+' '+m.form:'(removed medicine)'};
const medOpts=(d,sel)=>allMeds(d).map(m=>`<option value="${m.id}" ${m.id===sel?'selected':''}>${esc(m.name)} - ${esc(m.form)}</option>`).join('');
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
let cart=[],pre={},expF='all',repR='7',camStop=null;
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

/* ---------- STOCK & BATCHES ---------- */
P.stock=el=>{
  const d=data(),p=pre;pre={};
  el.innerHTML=`<h2>Stock &amp; batches</h2>
  <div class="card" style="margin:14px 0"><b>Receive stock</b>
  <label>Medicine</label><select id="sM">${medOpts(d,p.med)}</select>
  <div class="two"><div><label>Batch number</label><input id="sB"></div><div><label>Expiry date</label><input id="sE" type="date"></div></div>
  <div class="two"><div><label>Quantity received</label><input id="sQ" type="number" min="1" inputmode="numeric"></div><div><label>Barcode (optional)</label><input id="sC" value="${esc(p.code||'')}"></div></div>
  <div class="two"><div><label>Cost price (RWF each)</label><input id="sCo" type="number" min="0"></div><div><label>Selling price (RWF each)</label><input id="sP" type="number" min="0"></div></div>
  <label>Supplier</label><select id="sS"><option value="">-</option>${d.suppliers.map(s=>`<option>${esc(s.name)}</option>`).join('')}</select>
  <p class="msg" id="sMsg"></p><button class="btn p" id="sSave">Save stock</button></div>
  <input id="sF" placeholder="Search stock...">
  <div class="card scroll"><table><thead><tr><th>MEDICINE</th><th>BATCH</th><th>EXPIRY</th><th>QTY</th><th>PRICE</th><th>STATUS</th><th></th></tr></thead><tbody id="sRows"></tbody></table></div>`;
  const fill=()=>{const d=data(),id=$('#sM').value;
    const last=d.stock.filter(b=>b.medId===id).slice(-1)[0];
    if(last){$('#sCo').value=last.cost;$('#sP').value=last.price}
    const code=Object.keys(d.codes).find(k=>d.codes[k]===id);if(code&&!$('#sC').value)$('#sC').value=code};
  const draw=()=>{const d=data(),q=$('#sF').value.toLowerCase();
    $('#sRows').innerHTML=[...d.stock].sort((a,b)=>a.expiry.localeCompare(b.expiry)).filter(b=>(mname(d,b.medId)+b.batch).toLowerCase().includes(q))
    .map(b=>`<tr><td>${esc(mname(d,b.medId))}</td><td>${esc(b.batch)}</td><td>${b.expiry}</td><td>${b.qty}</td><td>${b.price.toLocaleString()}</td><td>${tag(status(d,b))}</td>
    <td><button class="btn sm" data-a="adj" data-i="${b.id}">Adjust</button><button class="btn sm" data-a="del" data-i="${b.id}">Delete</button></td></tr>`).join('')
    ||'<tr><td colspan="7" class="mute">No batches yet.</td></tr>'};
  draw();if(p.med)fill();
  $('#sF').oninput=draw;
  el.onchange=e=>{if(e.target.id==='sM'){$('#sC').value='';$('#sCo').value='';$('#sP').value='';fill()}};
  $('#sSave').onclick=()=>{
    const d=data(),m=$('#sM').value,b=$('#sB').value.trim(),e=$('#sE').value,q=parseInt($('#sQ').value),co=parseFloat($('#sCo').value)||0,pr=parseFloat($('#sP').value),c=$('#sC').value.trim(),sp=$('#sS').value;
    const err=t=>{$('#sMsg').textContent=t;$('#sMsg').className='msg err'};
    if(!b||!e||!(q>0)||isNaN(pr))return err('Fill batch, expiry, quantity and selling price.');
    if(daysTo(e)<0&&!confirm('This expiry date is already past. Save anyway?'))return;
    if(c&&d.codes[c]&&d.codes[c]!==m)return err('This barcode already belongs to another medicine.');
    const x=d.stock.find(z=>z.medId===m&&z.batch===b);
    if(x){x.qty+=q;x.price=pr;x.cost=co||x.cost;x.expiry=e}
    else d.stock.push({id:'B'+Date.now(),medId:m,batch:b,expiry:e,qty:q,cost:co,price:pr,supplier:sp,received:today()});
    if(c)d.codes[c]=m;
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
      out.innerHTML=`<div class="card"><b>New barcode: ${esc(code)}</b><p class="mute">Not linked to a medicine yet. Link it:</p><select id="lnk">${medOpts(d)}</select><button class="btn p" id="lnkGo">Link barcode</button></div>`;
      $('#lnkGo').onclick=()=>{const d=data(),m=$('#lnk').value;d.codes[code]=m;save(d);logAct(me,'Linked barcode '+code+' to '+mname(d,m));find(code)};return;
    }
    const m=medOf(d,id),bs=d.stock.filter(b=>b.medId===id&&b.qty>0).sort((a,c)=>a.expiry.localeCompare(c.expiry));
    out.innerHTML=`<div class="card"><h3 style="margin-top:0">${esc(m.name)}</h3><p class="mute">${esc(m.form)} - ${esc(m.cls)}</p>
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
      stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
      const v=$('#vid');v.srcObject=stream;v.style.display='block';await v.play();$('#bStop').style.display='inline-block';
      const det=new BarcodeDetector();
      timer=setInterval(async()=>{try{const r=await det.detect(v);if(r.length){const c=r[0].rawValue;stopCam();$('#bc').value=c;find(c)}}catch(e){}},400);
    }catch(e){bMsg('Camera blocked. Allow camera access, or open the app in full-page view.')}
  };
};

/* ---------- RECORD A SALE ---------- */
P.sale=el=>{
  const d=data();
  const lines=cart.map(c=>({...c,name:mname(d,c.medId),price:price(d,c.medId)}));
  const total=lines.reduce((s,l)=>s+l.qty*l.price,0);
  el.innerHTML=`<h2>Record a sale</h2>
  <div class="card" style="margin:14px 0"><label>Scan barcode</label><input id="qBc" placeholder="Scan, then Enter" inputmode="numeric">
  <label>Or choose a medicine</label><div class="two"><select id="qM">${medOpts(d)}</select><input id="qQ" type="number" min="1" value="1"></div>
  <button class="btn p" id="qAdd">Add to sale</button><p class="msg" id="qMsg"></p></div>
  <div class="card scroll"><table><thead><tr><th>ITEM</th><th>PRICE</th><th>QTY</th><th>TOTAL</th><th></th></tr></thead><tbody>
  ${lines.map((l,i)=>`<tr><td>${esc(l.name)}<div class="mute">${avail(d,l.medId)} in stock</div></td><td>${l.price.toLocaleString()}</td>
  <td><button class="btn sm" data-a="m" data-i="${i}">-</button> ${l.qty} <button class="btn sm" data-a="p" data-i="${i}">+</button></td>
  <td>${(l.qty*l.price).toLocaleString()}</td><td><button class="btn sm" data-a="x" data-i="${i}">x</button></td></tr>`).join('')||'<tr><td colspan="5" class="mute">No items yet.</td></tr>'}
  </tbody></table></div>
  <div class="card" style="margin-top:14px"><div class="mute">Total</div><div class="big">${money(total)}</div>
  <input id="qCu" placeholder="Customer name (optional)">
  <select id="qPay"><option>Cash</option><option>Mobile Money</option><option>Insurance</option><option>Card</option></select>
  <button class="btn p" id="qDone" style="width:100%" ${lines.length?'':'disabled'}>Complete sale</button></div>`;
  const qmsg=t=>{$('#qMsg').textContent=t;$('#qMsg').className='msg err'};
  $('#qBc').onkeydown=e=>{
    if(e.key!=='Enter')return;
    const id=data().codes[e.target.value.trim()];
    if(!id)return qmsg('Barcode not linked to a medicine. Link it in Barcode scanner.');
    const r=addCart(id,1);if(r)return qmsg(r);go('sale');
  };
  $('#qAdd').onclick=()=>{const r=addCart($('#qM').value,parseInt($('#qQ').value)||1);if(r)return qmsg(r);go('sale')};
  el.onclick=e=>{
    const a=e.target.dataset.a,i=+e.target.dataset.i;if(!a)return;
    if(a==='x')cart.splice(i,1);
    if(a==='m'){cart[i].qty--;if(cart[i].qty<1)cart.splice(i,1)}
    if(a==='p'){const r=addCart(cart[i].medId,1);if(r)return qmsg(r)}
    go('sale');
  };
  $('#qDone').onclick=()=>{
    const d=data(),items=[];let total=0,profit=0;
    for(const c of cart){if(c.qty>avail(d,c.medId))return qmsg('Not enough stock for '+mname(d,c.medId))}
    for(const c of cart){
      const pr=price(d,c.medId),r=deduct(d,c.medId,c.qty);
      items.push({medId:c.medId,name:mname(d,c.medId),qty:c.qty,price:pr,batches:r.parts.join(', ')});
      total+=pr*c.qty;profit+=pr*c.qty-r.cost;
    }
    const s={id:'S'+Date.now(),no:d.sales.length+1,date:new Date().toISOString(),customer:$('#qCu').value.trim(),pay:$('#qPay').value,items,total,profit};
    d.sales.unshift(s);save(d);logAct(me,'Sale #'+s.no+' - '+money(total));cart=[];go('rcpt',s.id);
  };
  $('#qBc').focus();
};
P.rcpt=(el,id)=>{
  const d=data(),u=user(),s=d.sales.find(z=>z.id===id);
  if(!s)return go('rep');
  el.innerHTML=`<div id="receipt" class="card"><div style="text-align:center"><b style="font-size:18px">${esc(d.set.name||u.name)}</b>
  <div class="mute">Receipt #${s.no} - ${new Date(s.date).toLocaleString()}</div>${s.customer?`<div class="mute">Customer: ${esc(s.customer)}</div>`:''}</div>
  <table style="margin-top:10px"><thead><tr><th>ITEM</th><th>QTY</th><th>PRICE</th><th>TOTAL</th></tr></thead><tbody>
  ${s.items.map(i=>`<tr><td>${esc(i.name)}</td><td>${i.qty}</td><td>${i.price.toLocaleString()}</td><td>${(i.qty*i.price).toLocaleString()}</td></tr>`).join('')}
  </tbody></table><h3 style="text-align:right">Total: ${money(s.total)}</h3><div class="mute" style="text-align:right">Paid by ${esc(s.pay)}</div></div>
  <div class="btns" style="margin-top:14px"><button class="btn p" id="pr">Print</button><button class="btn" data-go="sale">New sale</button><button class="btn" data-go="rep">Reports</button></div>`;
  wireGo(el);$('#pr').onclick=()=>window.print();
};

/* ---------- PURCHASES & SUPPLIERS ---------- */
P.buy=el=>{
  const d=data();
  el.innerHTML=`<h2>Purchases &amp; suppliers</h2>
  <div class="card" style="margin:14px 0"><b>Add supplier</b><input id="vN" placeholder="Supplier name"><input id="vP" placeholder="Phone" inputmode="tel"><button class="btn p" id="vAdd">Save supplier</button></div>
  <div class="card scroll"><table><thead><tr><th>SUPPLIER</th><th>PHONE</th><th></th></tr></thead><tbody>
  ${d.suppliers.map(s=>`<tr><td>${esc(s.name)}</td><td>${esc(s.phone||'-')}</td><td><button class="btn sm" data-i="${s.id}">Delete</button></td></tr>`).join('')||'<tr><td colspan="3" class="mute">No suppliers yet.</td></tr>'}
  </tbody></table></div>
  <h3>Purchase history</h3><div class="card scroll"><table><thead><tr><th>DATE</th><th>SUPPLIER</th><th>MEDICINE</th><th>BATCH</th><th>QTY</th><th>COST</th></tr></thead><tbody>
  ${d.purchases.slice(0,60).map(p=>`<tr><td>${p.date}</td><td>${esc(p.supplier||'-')}</td><td>${esc(mname(d,p.medId))}</td><td>${esc(p.batch)}</td><td>${p.qty}</td><td>${(p.qty*p.cost).toLocaleString()}</td></tr>`).join('')||'<tr><td colspan="6" class="mute">Receive stock to see purchases here.</td></tr>'}
  </tbody></table></div>`;
  $('#vAdd').onclick=()=>{const n=$('#vN').value.trim();if(!n)return;const d=data();d.suppliers.push({id:'V'+Date.now(),name:n,phone:$('#vP').value.trim()});save(d);logAct(me,'Added supplier '+n);go('buy')};
  el.onclick=e=>{const i=e.target.dataset.i;if(!i||!confirm('Delete this supplier?'))return;const d=data();d.suppliers=d.suppliers.filter(s=>s.id!==i);save(d);go('buy')};
};

/* ---------- EXPIRY CONTROL ---------- */
P.exp=el=>{
  const d=data();
  const rows=d.stock.filter(b=>b.qty>0).map(b=>({b,n:daysTo(b.expiry)}))
    .filter(r=>expF==='all'||(expF==='exp'&&r.n<0)||(expF==='near'&&r.n>=0&&r.n<=d.set.days)).sort((a,c)=>a.n-c.n);
  const risk=rows.filter(r=>r.n<0).reduce((s,r)=>s+r.b.qty*r.b.cost,0);
  el.innerHTML=`<h2>Expiry control</h2><p class="mute">Near expiry = within ${d.set.days} days. Expired stock can never be sold.</p>
  <div class="btns" style="margin:14px 0">
    <button class="btn ${expF==='all'?'p':''}" data-f="all">All</button><button class="btn ${expF==='near'?'p':''}" data-f="near">Near expiry</button><button class="btn ${expF==='exp'?'p':''}" data-f="exp">Expired</button></div>
  ${risk?`<div class="card" style="margin-bottom:14px"><div class="mute">Cost value of expired stock</div><div class="big" style="font-size:26px">${money(risk)}</div></div>`:''}
  <div class="card scroll"><table><thead><tr><th>MEDICINE</th><th>BATCH</th><th>EXPIRY</th><th>LEFT</th><th>QTY</th><th>STATUS</th><th></th></tr></thead><tbody>
  ${rows.map(r=>`<tr><td>${esc(mname(d,r.b.medId))}</td><td>${esc(r.b.batch)}</td><td>${r.b.expiry}</td><td>${dayTxt(r.n)}</td><td>${r.b.qty}</td><td>${tag(status(d,r.b))}</td>
  <td>${r.n<0?`<button class="btn sm" data-w="${r.b.id}">Write off</button>`:''}</td></tr>`).join('')||'<tr><td colspan="7" class="mute">Nothing to show.</td></tr>'}
  </tbody></table></div>`;
  el.onclick=e=>{
    if(e.target.dataset.f){expF=e.target.dataset.f;return go('exp')}
    const w=e.target.dataset.w;if(!w)return;
    const d=data(),b=d.stock.find(z=>z.id===w);
    if(!confirm('Write off '+b.qty+' units of '+mname(d,b.medId)+' (batch '+b.batch+')?'))return;
    logAct(me,'Wrote off '+b.qty+' x '+mname(d,b.medId)+' batch '+b.batch+' (cost '+money(b.qty*b.cost)+')');
    b.qty=0;save(d);go('exp');
  };
};

/* ---------- MEDICINE CATALOGUE ---------- */
P.cat=el=>{
  const d=data();
  el.innerHTML=`<h2>Medicine catalogue</h2>
  <p class="mute">Starter list of common medicines. Check each item against the official Rwanda FDA register before selling.</p>
  <div class="card" style="margin:14px 0"><b>Add a new drug</b>
  <input id="mN" placeholder="Name (e.g. Losartan)"><input id="mF" placeholder="Strength & form (e.g. 50 mg tablet)"><input id="mC" placeholder="Class (e.g. Antihypertensive)">
  <button class="btn p" id="addM">Add to my catalogue</button></div>
  <input id="q" placeholder="Search medicine...">
  <div class="card scroll"><table><thead><tr><th>NAME</th><th>FORM</th><th>CLASS</th><th>IN STOCK</th><th></th></tr></thead><tbody id="rows"></tbody></table></div>`;
  const draw=()=>{const d=data(),q=$('#q').value.toLowerCase();
    $('#rows').innerHTML=allMeds(d).filter(m=>(m.name+m.cls).toLowerCase().includes(q))
    .map(m=>`<tr><td>${esc(m.name)}</td><td>${esc(m.form)}</td><td>${esc(m.cls)}</td><td>${avail(d,m.id)}</td><td>${m.base?'<span class="tag g">listed</span>':`<button class="btn sm" data-d="${m.id}">Delete</button>`}</td></tr>`).join('')};
  draw();$('#q').oninput=draw;
  $('#rows').onclick=e=>{const id=e.target.dataset.d;if(!id)return;const x=data();
    if(x.stock.some(b=>b.medId===id))return alert('This drug has stock batches. Remove them first.');
    x.meds=x.meds.filter(m=>m.id!==id);save(x);logAct(me,'Deleted a drug');draw()};
  $('#addM').onclick=()=>{const n=$('#mN').value.trim();if(!n)return;
    const x=data();x.meds.push({id:'c'+Date.now(),name:n,form:$('#mF').value.trim()||'-',cls:$('#mC').value.trim()||'-'});save(x);logAct(me,'Added drug: '+n);go('cat')};
};

/* ---------- REPORTS & AUDIT ---------- */
P.rep=el=>{
  const d=data();
  const inR=s=>repR==='all'||(repR==='today'?dstr(new Date(s.date))===today():new Date(s.date).getTime()>=Date.now()-parseInt(repR)*864e5);
  const ss=d.sales.filter(inR);
  const rev=ss.reduce((s,x)=>s+x.total,0),prof=ss.reduce((s,x)=>s+x.profit,0);
  const units=ss.reduce((s,x)=>s+x.items.reduce((a,i)=>a+i.qty,0),0);
  const top={};ss.forEach(s=>s.items.forEach(i=>{top[i.name]=(top[i.name]||0)+i.qty}));
  const topL=Object.entries(top).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const sv=d.stock.reduce((s,b)=>s+b.qty*b.cost,0);
  el.innerHTML=`<h2>Reports &amp; audit</h2>
  <select id="rr" style="margin-top:14px"><option value="today">Today</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="all">All time</option></select>
  <div class="grid">
    <div class="card"><div class="mute">Revenue</div><div class="big" style="font-size:24px">${money(rev)}</div></div>
    <div class="card"><div class="mute">Profit</div><div class="big" style="font-size:24px">${money(prof)}</div></div>
    <div class="card"><div class="mute">Sales / units</div><div class="big" style="font-size:24px">${ss.length} / ${units}</div></div>
    <div class="card"><div class="mute">Stock value (cost)</div><div class="big" style="font-size:24px">${money(sv)}</div></div>
  </div>
  <h3>Top sellers</h3><div class="card scroll"><table><tbody>${topL.map(t=>`<tr><td>${esc(t[0])}</td><td>${t[1]} units</td></tr>`).join('')||'<tr><td class="mute">No sales in this period.</td></tr>'}</tbody></table></div>
  <div class="btns" style="margin:18px 0 8px;justify-content:space-between;align-items:center"><h3 style="margin:0">Sales history</h3><button class="btn sm" id="csv">Export CSV</button></div>
  <div class="card scroll"><table><thead><tr><th>#</th><th>DATE</th><th>CUSTOMER</th><th>PAY</th><th>TOTAL</th><th></th></tr></thead><tbody>
  ${ss.slice(0,100).map(s=>`<tr><td>${s.no}</td><td>${new Date(s.date).toLocaleString()}</td><td>${esc(s.customer||'-')}</td><td>${esc(s.pay)}</td><td>${s.total.toLocaleString()}</td><td><button class="btn sm" data-r="${s.id}">Receipt</button></td></tr>`).join('')||'<tr><td colspan="6" class="mute">No sales.</td></tr>'}
  </tbody></table></div>`;
  $('#rr').value=repR;$('#rr').onchange=e=>{repR=e.target.value;go('rep')};
  $('#csv').onclick=()=>{
    const rows=[['No','Date','Customer','Payment','Items','Total']].concat(ss.map(s=>[s.no,new Date(s.date).toLocaleString(),s.customer,s.pay,s.items.map(i=>i.name+' x'+i.qty).join('; '),s.total]));
    const csv=rows.map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\n');
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='trix-sales.csv';a.click();
  };
  el.onclick=e=>{const r=e.target.dataset.r;if(r)go('rcpt',r)};
};

/* ---------- TEAM & ACCESS (owner only) ---------- */
P.team=el=>{
  if(user().role!=='owner')return;
  const log=LS.get('trix_log',[]);
  el.innerHTML=`<h2>Team &amp; access</h2><p class="mute">You can see what every user does. Only you can suspend or remove accounts.</p>
  <div class="card scroll" style="margin-top:14px"><table><thead><tr><th>NAME</th><th>EMAIL</th><th>STATUS</th><th>BATCHES</th><th>SALES</th><th>REVENUE</th><th>ACTIONS</th></tr></thead><tbody>
  ${users.map(x=>{const dd=loadD(x.id);return `<tr><td>${esc(x.name)}</td><td>${esc(x.email)}</td>
  <td><span class="tag ${x.off?'r':'g'}">${x.off?'suspended':'active'}</span></td><td>${dd.stock.length}</td><td>${dd.sales.length}</td><td>${dd.sales.reduce((s,a)=>s+a.total,0).toLocaleString()}</td>
  <td><button class="btn sm" data-a="ins" data-u="${x.id}">Inspect</button>${x.role==='owner'?'':`<button class="btn sm" data-a="off" data-u="${x.id}">${x.off?'Activate':'Suspend'}</button>
  <button class="btn sm" data-a="pw" data-u="${x.id}">Reset password</button><button class="btn sm" data-a="del" data-u="${x.id}">Delete</button>`}</td></tr>`}).join('')}
  </tbody></table></div>
  <h3>Activity log</h3><div class="card scroll"><table><thead><tr><th>WHEN</th><th>WHO</th><th>ACTION</th></tr></thead><tbody>
  ${log.slice(0,120).map(l=>{const w=users.find(x=>x.id===l.uid);return `<tr><td>${esc(l.t)}</td><td>${esc(w?w.name:'deleted')}</td><td>${esc(l.txt)}</td></tr>`}).join('')}
  </tbody></table></div>`;
  el.onclick=async e=>{
    const a=e.target.dataset.a,id=e.target.dataset.u;if(!a)return;
    if(a==='ins')return go('insp',id);
    const x=users.find(z=>z.id===id);
    if(a==='off'){x.off=!x.off;logAct(me,(x.off?'Suspended ':'Activated ')+x.name)}
    if(a==='pw'){const t=prompt('Temporary password for '+x.name+' (min 6)');if(!t||t.length<6)return;x.pass=await hash(t);logAct(me,'Reset password for '+x.name)}
    if(a==='del'){if(!confirm('Delete '+x.name+' and all their data?'))return;users=users.filter(z=>z.id!==id);localStorage.removeItem('trix_data_'+id);logAct(me,'Deleted '+x.name)}
    LS.set('trix_users',users);go('team');
  };
};
P.insp=(el,id)=>{
  if(user().role!=='owner')return;
  const x=users.find(z=>z.id===id),dd=loadD(id);
  const rev=dd.sales.reduce((s,a)=>s+a.total,0);
  el.innerHTML=`<button class="btn sm" data-go="team">Back</button><h2 style="margin-top:10px">${esc(x.name)}</h2><p class="mute">${esc(x.email)} - joined ${x.created}</p>
  <div class="grid"><div class="card"><div class="mute">Batches</div><div class="big">${dd.stock.length}</div></div>
  <div class="card"><div class="mute">Sales</div><div class="big">${dd.sales.length}</div></div>
  <div class="card"><div class="mute">Revenue</div><div class="big" style="font-size:24px">${money(rev)}</div></div></div>
  <h3>Stock</h3><div class="card scroll"><table><thead><tr><th>MEDICINE</th><th>BATCH</th><th>EXPIRY</th><th>QTY</th><th>STATUS</th></tr></thead><tbody>
  ${dd.stock.map(b=>`<tr><td>${esc(mname(dd,b.medId))}</td><td>${esc(b.batch)}</td><td>${b.expiry}</td><td>${b.qty}</td><td>${tag(status(dd,b))}</td></tr>`).join('')||'<tr><td colspan="5" class="mute">No stock.</td></tr>'}
  </tbody></table></div>
  <h3>Recent sales</h3><div class="card scroll"><table><thead><tr><th>#</th><th>DATE</th><th>ITEMS</th><th>TOTAL</th></tr></thead><tbody>
  ${dd.sales.slice(0,30).map(s=>`<tr><td>${s.no}</td><td>${new Date(s.date).toLocaleString()}</td><td>${esc(s.items.map(i=>i.name+' x'+i.qty).join(', '))}</td><td>${s.total.toLocaleString()}</td></tr>`).join('')||'<tr><td colspan="4" class="mute">No sales.</td></tr>'}
  </tbody></table></div>`;
  wireGo(el);
};

/* ---------- SETTINGS ---------- */
P.set=el=>{
  const d=data();
  el.innerHTML=`<h2>Settings</h2>
  <div class="card" style="margin:14px 0"><b>Pharmacy</b>
  <label>Pharmacy name (shown on receipts)</label><input id="stN" value="${esc(d.set.name)}">
  <div class="two"><div><label>Low-stock level (units)</label><input id="stL" type="number" value="${d.set.low}"></div>
  <div><label>Near-expiry warning (days)</label><input id="stD" type="number" value="${d.set.days}"></div></div>
  <button class="btn p" id="stSave">Save settings</button><p class="msg" id="stMsg"></p></div>
  <div class="card" style="margin-bottom:14px"><b>Change my password</b>
  <input id="pwO" type="password" placeholder="Current password"><input id="pwN" type="password" placeholder="New password (min 6)">
  <button class="btn p" id="pwSave">Change password</button><p class="msg" id="pwMsg"></p></div>
  <div class="card"><b>Backup</b><p class="mute" style="margin:6px 0 12px">Your data lives in this browser. Download a backup regularly.</p>
  <div class="btns"><button class="btn" id="bk">Download backup</button><label class="btn" style="margin:0">Restore<input id="imp" type="file" accept=".json" style="display:none"></label></div></div>`;
  $('#stSave').onclick=()=>{const d=data();d.set.name=$('#stN').value.trim();d.set.low=Math.max(0,parseInt($('#stL').value)||0);d.set.days=Math.max(1,parseInt($('#stD').value)||90);
    save(d);logAct(me,'Changed settings');$('#stMsg').textContent='Saved.';$('#stMsg').className='msg ok'};
  $('#pwSave').onclick=async()=>{
    const u=user(),m=$('#pwMsg');
    if(await hash($('#pwO').value)!==u.pass){m.textContent='Current password is wrong.';m.className='msg err';return}
    if($('#pwN').value.length<6){m.textContent='New password must be at least 6 characters.';m.className='msg err';return}
    u.pass=await hash($('#pwN').value);LS.set('trix_users',users);logAct(me,'Changed own password');m.textContent='Password changed.';m.className='msg ok';
  };
  $('#bk').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(data())],{type:'application/json'}));a.download='trix-backup-'+today()+'.json';a.click()};
  $('#imp').onchange=e=>{
    const f=e.target.files[0];if(!f)return;const r=new FileReader();
    r.onload=()=>{try{const o=JSON.parse(r.result);if(!Array.isArray(o.stock)||!Array.isArray(o.sales))throw 0;
      if(!confirm('Replace your current data with this backup?'))return;save(Object.assign(D0(),o));logAct(me,'Restored backup');go('set')}
      catch(x){alert('Not a valid TRIX backup file.')}};
    r.readAsText(f);
  };
};

if(me&&user())start();

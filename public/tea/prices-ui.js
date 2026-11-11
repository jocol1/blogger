// Supermarket price board: full-screen comparison opened from the café wall. Data comes from our own /api/tea/prices;
// product names are third-party text, so every node is built with textContent and never from markup strings.
window.TeaPricesUI=function({t,locale,close}){
 const root=document.querySelector('#prices-view'),LINK=/^https:\/\/(winmart\.vn|cooponline\.vn|kingfoodmart\.com|www\.lottemart\.vn|www\.bachhoaxanh\.com)\//;
 const PAGE=10,CART_KEY='locly-price-cart',STORES_KEY='locly-price-stores',BADGE={winmart:['WM','#d6262b'],coop:['CO','#0a58a8'],kingfood:['KF','#1d3f8f'],lotte:['LT','#e2231a'],bhx:['BHX','#0a8a3e']};
 let data=null,timer=null,failed=false,query='',page=1,selected=null,parts=null,cart=new Set();
 try{cart=new Set(JSON.parse(localStorage.getItem(CART_KEY)||'[]'))}catch{}
 try{const saved=JSON.parse(localStorage.getItem(STORES_KEY)||'null');if(Array.isArray(saved)&&saved.length)selected=new Set(saved)}catch{}
 const saveCart=()=>{try{localStorage.setItem(CART_KEY,JSON.stringify([...cart]))}catch{}};
 const saveStores=()=>{try{localStorage.setItem(STORES_KEY,JSON.stringify([...selected]))}catch{}};
 const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!=null)node.textContent=text;return node};
 const button=(cls,text,onclick)=>{const b=el('button',cls,text);b.type='button';b.onclick=onclick;return b};
 const lang=()=>locale()==='vi'?'vi-VN':'en-GB';
 const num=n=>new Intl.NumberFormat(lang()).format(Math.round(n));
 const money=n=>num(n)+'đ';
 const when=iso=>iso?new Date(iso).toLocaleString(lang(),{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'–';
 const fold=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/gi,'d').toLowerCase();
 const comparable=(item,s)=>!s.referenceOnly&&item.perStore[s.id]?.status==='ok'&&!item.perStore[s.id].stale;
 const brand=s=>(BADGE[s.id]||[])[1]||'#5b6b62';
 const shown=()=>data.stores.filter(s=>selected.has(s.id));
 const matches=()=>{const q=fold(query.trim());return q?data.items.filter(i=>fold(i.name).includes(q)):data.items};
 const statusText=c=>t(c.status==='out_of_stock'?'prOut':c.status==='error'?'prError':c.status==='not_collected'?'prNotCollected':'prNotFound');
 const compare=()=>window.TeaPriceCart.compareCart(data,[...cart],[...selected]);
 const imgSrc=u=>'/api/tea/prices/img?u='+encodeURIComponent(u),badPhotos=new Set(); // e.g. originals over the relay's size cap

 // Pixelated copy of each store's own site icon (public/tea/logos); the initials stay as the fallback if it is missing.
 function badge(store){
  const [label]=BADGE[store.id]||[store.name.slice(0,2).toUpperCase()],b=el('span','pr-logo',label);b.style.setProperty('--brand',brand(store));
  if(BADGE[store.id]){const img=el('img');img.src=`/assets/tea/logos/${store.id}.png`;img.alt='';img.width=img.height=48;img.onload=()=>{b.textContent='';b.classList.add('has-img');b.append(img)}}
  return b;
 }

 function chips(){
  const box=el('div','pr-chips');
  for(const s of data.stores){
   const on=selected.has(s.id),chip=button(`pr-chip${on?' is-on':''}`,null,()=>{if(on&&selected.size===1)return;on?selected.delete(s.id):selected.add(s.id);saveStores();update()});chip.setAttribute('aria-pressed',String(on));
   chip.append(badge(s),el('span','pr-chip-name',s.name),el('span','pr-chip-state',t(on?'prSelected':'prPick')));
   if(s.referenceOnly)chip.append(el('small','pr-chip-note',t('prReference')));
   box.append(chip);
  }
  return box;
 }

 function priceCell(item,store,best){
  const c=item.perStore[store.id],td=el('td','pr-cell');
  if(c.status!=='ok'){const dash=el('span','pr-none','—');dash.title=statusText(c);dash.setAttribute('aria-label',statusText(c));td.append(dash);return td}
  const label=num(c.unitPrice),detail=`${c.name}${c.size?` · ${c.size}`:''} · ${money(c.price)}${c.listPrice?` (${money(c.listPrice)})`:''}`;
  const node=LINK.test(c.url||'')?Object.assign(el('a','pr-price',label),{href:c.url,target:'_blank',rel:'noopener noreferrer'}):el('span','pr-price',label);
  node.title=detail;node.setAttribute('aria-label',`${store.name}: ${money(c.unitPrice)}/${item.unitLabel}. ${detail}`);
  if(best===store.id){td.classList.add('is-best');node.title=`${t('prBest')} · ${detail}`}
  if(c.image&&!badPhotos.has(c.image)){const photo=el('img','pr-thumb');photo.src=imgSrc(c.image);photo.alt='';photo.title=detail;photo.loading='lazy';photo.decoding='async';photo.width=photo.height=34;photo.onerror=()=>{badPhotos.add(c.image);photo.remove()};td.append(photo)}
  td.append(node);
  if(c.stale)td.append(el('small','pr-stale',t('prStale')));
  else if(c.listPrice)td.append(el('small','pr-sale','-'+Math.round((1-c.price/c.listPrice)*100)+'%'));
  return td;
 }

 function toggle(item){cart.has(item.id)?cart.delete(item.id):cart.add(item.id);saveCart();update()}

 function table(items){
  const stores=shown(),wrap=el('div','pr-scroll'),tbl=el('table','pr-table'),head=el('tr');
  head.append(el('th','pr-col-item',t('prItem')));
  for(const s of stores){const th=el('th','pr-col-store',s.name);th.style.setProperty('--brand',brand(s));if(s.referenceOnly)th.append(el('small','',t('prReference')));head.append(th)}
  const thead=el('thead');thead.append(head);tbl.append(thead);
  const body=el('tbody');let group=null;
  for(const item of items){
   if(item.group!==group){group=item.group;const label=data.groups?.find(g=>g.id===group)?.name;if(label){const gr=el('tr','pr-group'),gh=el('th','',label);gh.colSpan=stores.length+1;gr.append(gh);body.append(gr)}}
   const inCart=cart.has(item.id),tr=el('tr',inCart?'is-in-cart':''),th=el('th','pr-name');th.scope='row';
   const add=button(`pr-add${inCart?' is-on':''}`,inCart?'✓':'+',()=>toggle(item));add.setAttribute('aria-pressed',String(inCart));add.setAttribute('aria-label',t(inCart?'prRemoveFromCart':'prAddToCart',{name:item.name}));add.title=t(inCart?'prRemoveFromCart':'prAddToCart',{name:item.name});
   const label=el('span','pr-name-text');label.append(el('span','',item.name),el('small','',t('prPer',{unit:item.unitLabel})));
   th.append(add,label);tr.append(th);
   const ok=stores.filter(s=>comparable(item,s)),prices=ok.map(s=>item.perStore[s.id].unitPrice);
   const best=ok.length>1&&Math.min(...prices)!==Math.max(...prices)?ok[prices.indexOf(Math.min(...prices))].id:null;
   for(const s of stores)tr.append(priceCell(item,s,best));
   body.append(tr);
  }
  tbl.append(body);wrap.append(tbl);return wrap;
 }

 function pager(total){
  const pages=Math.max(1,Math.ceil(total/PAGE)),nav=el('nav','pr-pager');nav.setAttribute('aria-label',t('prPages'));
  const go=p=>{page=p;update();parts.table.scrollIntoView({block:'nearest'})};
  const btn=(text,p,label,current)=>{const b=button(`pr-page${current?' is-current':''}`,text,()=>go(p));b.disabled=p<1||p>pages||current;if(label)b.setAttribute('aria-label',label);if(current)b.setAttribute('aria-current','page');return b};
  nav.append(btn('‹',page-1,t('prPrev')));
  for(let p=1;p<=pages;p++)if(p===1||p===pages||Math.abs(p-page)<=1)nav.append(btn(String(p),p,null,p===page));else if(Math.abs(p-page)===2)nav.append(el('span','pr-gap','…'));
  nav.append(btn('›',page+1,t('prNext')),el('span','pr-count',t('prPage',{page,pages,count:total})));
  return nav;
 }

 // The chosen items, then each selected supermarket's total for all of them: one store, one trip.
 function cartBox(){
  const box=el('section','pr-cart'),top=el('div','pr-cart-top'),result=compare();
  const title=el('h2','',t('prCart'));title.append(el('span','pr-pill',String(result.items.length)));
  const actions=el('div','pr-cart-actions'),png=button('pr-button',t('prExport'),exportImage),clear=button('pr-button pr-button-quiet',t('prClear'),()=>{cart.clear();saveCart();update()});
  png.disabled=clear.disabled=!result.items.length;actions.append(png,clear);top.append(title,actions);box.append(top);
  if(!result.items.length){
   const hint=el('p','pr-muted',t('prCartEmpty'));const visible=matches();
   if(visible.length)hint.append(' ',button('pr-link-button',t('prAddVisible',{count:visible.length}),()=>{visible.forEach(i=>cart.add(i.id));saveCart();update()}));
   box.append(hint);return box;
  }
  const list=el('ul','pr-cart-items');
  for(const item of result.items){const li=el('li','',item.name),x=button('pr-chip-x','×',()=>toggle(item));x.setAttribute('aria-label',t('prRemoveFromCart',{name:item.name}));li.append(x);list.append(li)}
  box.append(list);
  const rows=el('ol','pr-cart-stores');
  for(const row of result.rows){
   const li=el('li',`pr-cart-store${row===result.best?' is-best':''}${row.reference?' is-reference':''}`),name=el('span','pr-cart-name');
   name.append(badge(row.store),el('b','',row.store.name));if(row.reference)name.append(el('small','pr-chip-note',t('prReference')));
   const info=el('span','pr-cart-info',row.have===result.items.length?t('prAllItems'):t('prSomeItems',{have:row.have,count:result.items.length}));
   if(row.missing.length)info.title=`${t('prMissing')}: ${row.missing.join(', ')}`;
   const amount=el('span','pr-cart-amount');amount.append(el('strong','',money(row.total)));
   if(row===result.best)amount.append(el('span','pr-pill',t('prCheapest')));
   else if(result.best&&!row.reference&&row.have===result.best.have)amount.append(el('small','pr-diff','+'+money(row.total-result.best.total)));
   li.append(name,info,amount);
   if(row.missing.length&&row.missing.length<=4)li.append(el('small','pr-cart-missing',`${t('prMissing')}: ${row.missing.join(', ')}`));
   rows.append(li);
  }
  box.append(rows,el('p','pr-fine',t('prCartNote')));
  return box;
 }

 // Draws the cart comparison on a canvas and downloads it as a PNG (no third-party code, nothing leaves the browser).
 async function exportImage(){
  const result=compare(),stores=result.rows.map(r=>r.store).slice(0,6);if(!result.items.length)return;
  const scale=2,W=Math.max(720,320+stores.length*120),rowH=42,pad=32,headH=118,tableTop=headH+10,footH=96;
  const H=tableTop+rowH*(result.items.length+2)+footH;
  const canvas=document.createElement('canvas');canvas.width=W*scale;canvas.height=H*scale;
  const g=canvas.getContext('2d');g.scale(scale,scale);
  const load=src=>new Promise(resolve=>{const img=new Image(),done=v=>{clearTimeout(timer);resolve(v)},timer=setTimeout(()=>done(null),5000);img.onload=()=>done(img);img.onerror=()=>done(null);img.src=src});
  const photos=new Map(),logos=new Map();
  await Promise.all([
   ...result.items.flatMap(item=>stores.map(s=>{const c=item.perStore[s.id];return c?.status==='ok'&&c.image&&!badPhotos.has(c.image)?load(imgSrc(c.image)).then(img=>{if(img)photos.set(item.id+'|'+s.id,img)}):null})),
   ...stores.filter(s=>BADGE[s.id]).map(s=>load(`/assets/tea/logos/${s.id}.png`).then(img=>{if(img)logos.set(s.id,img)})),
  ]);
  const photo=(img,x,y,size)=>{g.fillStyle='#ffffff';g.fillRect(x,y,size,size);const r=Math.min(size/img.naturalWidth,size/img.naturalHeight),w=img.naturalWidth*r,h=img.naturalHeight*r;g.drawImage(img,x+(size-w)/2,y+(size-h)/2,w,h);g.strokeStyle='#cfb48b';g.strokeRect(x+.5,y+.5,size-1,size-1)};
  const font=(w,s)=>`${w} ${s}px "Trebuchet MS", "Segoe UI", sans-serif`;
  const fit=(text,max)=>{text=String(text);if(g.measureText(text).width<=max)return text;while(text.length>1&&g.measureText(text+'…').width>max)text=text.slice(0,-1);return text+'…'};
  g.fillStyle='#fff1d3';g.fillRect(0,0,W,H);g.strokeStyle='#956d44';g.lineWidth=8;g.strokeRect(4,4,W-8,H-8);g.lineWidth=1;
  g.fillStyle='#8a714f';g.font=font(700,12);g.fillText(t('prSmall'),pad,pad+8);
  g.fillStyle='#51402e';g.font=font(700,26);g.fillText(t('prCart'),pad,pad+42);
  g.fillStyle='#6a7a71';g.font=font(400,13);g.fillText(`${new Date().toLocaleDateString(lang())} · ${t('prImageSub',{count:result.items.length})}`,pad,pad+66);
  const nameW=W-pad*2-stores.length*120,colX=i=>pad+nameW+i*120;
  const bestIndex=stores.findIndex(s=>result.best&&s.id===result.best.store.id);
  if(bestIndex>=0){g.fillStyle='#d8e4b2';g.beginPath();g.roundRect?g.roundRect(colX(bestIndex)+4,tableTop-6,112,rowH*(result.items.length+2)+8,10):g.rect(colX(bestIndex)+4,tableTop-6,112,rowH*(result.items.length+2)+8);g.fill()}
  g.font=font(700,12);stores.forEach((s,i)=>{g.fillStyle=brand(s);g.textAlign='right';g.fillText(fit(s.name.toUpperCase(),80),colX(i)+112,tableTop+20);const logo=logos.get(s.id);if(logo){g.imageSmoothingEnabled=false;g.drawImage(logo,colX(i)+8,tableTop+3,22,22);g.imageSmoothingEnabled=true}});
  g.textAlign='left';g.fillStyle='#51402e';g.font=font(700,14);g.fillText(t('prItem'),pad,tableTop+20);
  result.items.forEach((item,r)=>{
   const y=tableTop+rowH*(r+1);g.strokeStyle='#ead7ae';g.beginPath();g.moveTo(pad,y);g.lineTo(W-pad,y);g.stroke();
   g.textAlign='left';g.fillStyle='#51402e';g.font=font(600,14);g.fillText(fit(item.name,nameW-90),pad,y+26);
   g.fillStyle='#8a9a91';g.font=font(400,11);g.fillText(`/${item.unitLabel}`,pad+nameW-80,y+26);
   const ok=stores.filter(s=>comparable(item,s)),min=ok.length?Math.min(...ok.map(s=>item.perStore[s.id].unitPrice)):null;
   stores.forEach((s,i)=>{const c=item.perStore[s.id];g.textAlign='right';
    if(c?.status==='ok'){const cheap=comparable(item,s)&&ok.length>1&&c.unitPrice===min;g.fillStyle=cheap?'#3f5d33':'#51402e';g.font=font(cheap?700:400,14);g.fillText(num(c.unitPrice),colX(i)+112,y+26);const img=photos.get(item.id+'|'+s.id);if(img)photo(img,colX(i)+10,y+5,32)}
    else{g.fillStyle='#b4c0b9';g.font=font(400,14);g.fillText('—',colX(i)+112,y+26)}});
  });
  const ty=tableTop+rowH*(result.items.length+1);g.strokeStyle='#795537';g.lineWidth=1.5;g.beginPath();g.moveTo(pad,ty);g.lineTo(W-pad,ty);g.stroke();g.lineWidth=1;
  g.textAlign='left';g.fillStyle='#51402e';g.font=font(700,14);g.fillText(t('prTotal'),pad,ty+22);
  stores.forEach((s,i)=>{const row=result.rows.find(r=>r.store.id===s.id);g.textAlign='right';g.fillStyle=i===bestIndex?'#3f5d33':'#51402e';g.font=font(800,15);g.fillText(num(row.total),colX(i)+112,ty+20);
   if(row.have<result.items.length){g.fillStyle='#a46a00';g.font=font(400,10);g.fillText(t('prSomeItems',{have:row.have,count:result.items.length}),colX(i)+112,ty+32)}});
  const fy=ty+rowH+28;g.textAlign='left';
  if(result.best){const partial=result.best.have<result.items.length?` (${t('prSomeItems',{have:result.best.have,count:result.items.length})})`:'';g.fillStyle='#3f5d33';g.font=font(800,20);g.fillText(fit(`${t('prCheapest')}: ${result.best.store.name} · ${money(result.best.total)}${partial}`,W-pad*2),pad,fy)}
  g.fillStyle='#6a7a71';g.font=font(400,11);g.fillText(fit(t('prCartNote'),W-pad*2),pad,fy+24);g.fillText(fit(`${t('prUpdated')} ${when(data.checkedAt)} · Locly`,W-pad*2),pad,fy+42);
  canvas.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`gio-hang-${new Date().toISOString().slice(0,10)}.png`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000)},'image/png');
 }

 function update(){
  const items=matches(),pages=Math.max(1,Math.ceil(items.length/PAGE));page=Math.min(page,pages);
  parts.chips.replaceWith(parts.chips=chips());
  const area=el('div','pr-table-area');
  if(items.length){area.append(table(items.slice((page-1)*PAGE,page*PAGE)),pager(items.length))}
  else area.append(el('p','pr-empty-search',t('prNoResults',{q:query.trim()})));
  parts.table.replaceWith(parts.table=area);
  parts.cart.replaceWith(parts.cart=cartBox());
 }

 function render(){
  root.replaceChildren();
  const board=el('div','pr-board'),head=el('header','pr-head'),title=el('div'),closeButton=button('pr-close','✕',close);
  closeButton.setAttribute('aria-label',t('prClose'));
  title.append(el('small','',t('prSmall')),el('h1','',t('prTitle')));
  if(data)title.append(el('p','pr-auto',t('prAuto',{time:when(data.checkedAt)})));
  head.append(title,closeButton);board.append(head);
  if(!data){
   const status=el('div','pr-status');status.setAttribute('role','status');
   if(failed){status.append(el('p','',t('prLoadErr')),button('pr-button',t('prRetry'),()=>load()))}
   else status.append(el('span','pr-spinner'),el('p','',t('prLoading')));
   board.append(status);root.append(board);return;
  }
  selected??=new Set(data.stores.map(s=>s.id));
  for(const id of [...selected])if(!data.stores.some(s=>s.id===id))selected.delete(id);
  if(!selected.size)data.stores.forEach(s=>selected.add(s.id));
  for(const id of [...cart])if(!data.items.some(i=>i.id===id))cart.delete(id);
  const search=el('form','pr-search'),input=el('input'),go=el('button','pr-search-go');
  search.setAttribute('role','search');input.type='search';input.value=query;input.placeholder=t('prSearch');input.setAttribute('aria-label',t('prSearch'));input.enterKeyHint='search';
  go.type='submit';go.setAttribute('aria-label',t('prSearch'));go.append(el('span','pr-search-icon'));
  input.oninput=()=>{query=input.value;page=1;update()};search.onsubmit=event=>{event.preventDefault();input.blur()};
  search.append(input,go);board.append(search);
  parts={chips:el('div'),table:el('div'),cart:el('div')};
  board.append(el('h2','pr-h2',t('prStores')),parts.chips,el('h2','pr-h2',t('prCompare')),parts.table,parts.cart);
  const bhx=data.stores.find(s=>s.id==='bhx');
  if(bhx)board.append(el('p','pr-source-note',t(bhx.unavailable?'prBhxUnavailable':bhx.region?'prBhxSnapshot':'prBhxUnverified',{time:when(bhx.checkedAt)})));
  const foot=el('footer','pr-foot');
  foot.append(el('p','pr-updated',`${t('prUpdated')}: ${data.stores.map(s=>`${s.name} ${when(s.checkedAt)}`).join(' · ')}`),el('p','pr-note',t('prNote')));
  const csv=el('a','pr-button',t('prCsv'));csv.href='/api/tea/prices.csv';csv.download='bang-gia-sieu-thi.csv';foot.append(csv);
  board.append(foot);root.append(board);update();
 }

 async function load(){
  clearTimeout(timer);failed=false;
  try{
   const response=await fetch('/api/tea/prices',{cache:'no-store'});
   if(response.status===202){render();timer=setTimeout(load,3000);return}
   if(!response.ok)throw new Error('prices');
   data=await response.json();
  }catch{if(!data)failed=true}
  render();
 }

 return{open(){render();load()},stop(){clearTimeout(timer)}};
};

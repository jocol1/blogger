// Supermarket price board, used in the café (full-screen panel) and on its own page (/gia). Data comes from our own
// /api/tea/prices; product names are third-party text, so every node is built with textContent, never markup strings.
window.TeaPricesUI=function({t,locale,close,standalone=false,search=''}){
 const root=document.querySelector('#prices-view'),LINK=/^https:\/\/(winmart\.vn|cooponline\.vn|kingfoodmart\.com|www\.lottemart\.vn|www\.bachhoaxanh\.com)\//;
 const PAGE=10,CART_KEY='locly-price-cart',STORES_KEY='locly-price-stores',BADGE={winmart:['WM','#d6262b'],coop:['CO','#0a58a8'],kingfood:['KF','#1d3f8f'],lotte:['LT','#e2231a'],bhx:['BHX','#0a8a3e']};
 const TC=window.TeaPriceCart,compactQuery=window.matchMedia?window.matchMedia('(max-width:640px)'):null;
 let data=null,timer=null,failed=false,query='',group='',page=1,selected=null,parts=null,cart=new Set(),pendingScroll=null,urlApplied=false;
 try{cart=new Set(JSON.parse(localStorage.getItem(CART_KEY)||'[]'))}catch{}
 try{const saved=JSON.parse(localStorage.getItem(STORES_KEY)||'null');if(Array.isArray(saved)&&saved.length)selected=new Set(saved)}catch{}
 const saveCart=()=>{try{localStorage.setItem(CART_KEY,JSON.stringify([...cart]))}catch{}};
 const saveStores=()=>{try{localStorage.setItem(STORES_KEY,JSON.stringify([...selected]))}catch{}};
 const setCart=ids=>{cart=new Set(ids);saveCart()};
 const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!=null)node.textContent=text;return node};
 const button=(cls,text,onclick)=>{const b=el('button',cls,text);b.type='button';b.onclick=onclick;return b};
 const lang=()=>locale()==='vi'?'vi-VN':'en-GB';
 const num=n=>new Intl.NumberFormat(lang()).format(Math.round(n));
 const money=n=>num(n)+'đ';
 const when=iso=>iso?new Intl.DateTimeFormat(lang(),{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(iso)):'–';
 const ageMs=iso=>iso?Math.max(0,Date.now()-Date.parse(iso)):0;
 const ageText=iso=>{const m=Math.round(ageMs(iso)/60000);return m<2?t('prAgeNow'):m<60?t('prAgeMin',{n:m}):m<2880?t('prAgeHour',{n:Math.round(m/60)}):t('prAgeDay',{n:Math.round(m/1440)})};
 const isStale=iso=>ageMs(iso)>26*3600_000; // the board refreshes every morning, so more than a day means the refresh failed
 const fold=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/gi,'d').toLowerCase();
 const comparable=(item,s)=>!s.referenceOnly&&item.perStore[s.id]?.status==='ok'&&!item.perStore[s.id].stale;
 const brand=s=>(BADGE[s.id]||[])[1]||'#5b6b62';
 const shown=()=>data.stores.filter(s=>selected.has(s.id));
 const matches=()=>{const q=fold(query.trim());return data.items.filter(i=>(!group||i.group===group)&&(!q||fold(i.name).includes(q)))};
 const statusText=c=>t(c.status==='out_of_stock'?'prOut':c.status==='error'?'prError':c.status==='not_collected'?'prNotCollected':'prNotFound');
 const compare=()=>TC.compareCart(data,[...cart],[...selected]);
 const compact=()=>Boolean(compactQuery?.matches);
 const imgSrc=u=>'/api/tea/prices/img?u='+encodeURIComponent(u),badPhotos=new Set(); // e.g. originals over the relay's size cap
 const scrollTo=node=>node?.scrollIntoView({behavior:window.matchMedia?.('(prefers-reduced-motion:reduce)').matches?'auto':'smooth',block:'start'});
 compactQuery?.addEventListener?.('change',()=>{if(parts&&data)update()});

 // Pixelated copy of each store's own site icon (public/tea/logos); the initials stay as the fallback if it is missing.
 function badge(store){
  const [label]=BADGE[store.id]||[store.name.slice(0,2).toUpperCase()],b=el('span','pr-logo',label);b.style.setProperty('--brand',brand(store));
  if(BADGE[store.id]){const img=el('img');img.src=`/assets/tea/logos/${store.id}.png`;img.alt='';img.width=img.height=48;img.onload=()=>{b.textContent='';b.classList.add('has-img');b.append(img)}}
  return b;
 }
 function photoNode(c,cls,size){
  if(!c.image||badPhotos.has(c.image))return null;
  const img=el('img',cls);img.src=imgSrc(c.image);img.alt='';img.loading='lazy';img.decoding='async';img.width=img.height=size;img.onerror=()=>{badPhotos.add(c.image);img.remove()};
  return img;
 }
 function toast(text){const box=el('div','pr-toast',text);box.setAttribute('role','status');root.append(box);setTimeout(()=>box.remove(),2600)}

 // ---- top of the page: the answer first -------------------------------------------------------------------------
 function hero(){
  const box=el('section','pr-hero'),ids=TC.presetIds(data,TC.PRESETS[0]),stores=data.stores.filter(s=>!s.referenceOnly).map(s=>s.id);
  const result=TC.commonCart(data,ids,stores),rows=result.rows.filter(r=>!r.reference&&r.have>0);
  box.append(el('h2','',t('prHeroTitle')));
  if(!result.best||!rows.length||result.items.length<3){box.append(el('p','pr-muted',t('prBasketNone')));return box}
  const full=rows.filter(r=>r.have===result.items.length),worst=full.length>1?full[full.length-1]:null,max=Math.max(...rows.map(r=>r.total));
  const line=el('p','pr-hero-line');
  line.append(t('prHeroLine',{count:result.items.length})+' ',el('b','',result.best.store.name));
  box.append(line,el('p','pr-hero-total',money(result.best.total)));
  if(worst&&worst.total>result.best.total){const diff=worst.total-result.best.total,pct=(diff/worst.total*100).toFixed(1).replace('.',locale()==='vi'?',':'.');box.append(el('p','pr-hero-save',t('prHeroSave',{other:worst.store.name,amount:money(diff),percent:pct})))}
  const bars=el('ol','pr-bars');
  for(const row of rows){
   const li=el('li',`pr-bar-row${row===result.best?' is-best':''}${row.have<result.items.length?' is-partial':''}`),fill=el('span','pr-bar-fill');fill.style.setProperty('--w',Math.max(8,Math.round(row.total/max*100))+'%');
   const label=el('span','pr-bar-label');label.append(badge(row.store),el('b','',row.store.name));
   const value=el('span','pr-bar-value',money(row.total));if(row.have<result.items.length)value.append(el('small','',t('prSomeItems',{have:row.have,count:result.items.length})));
   const track=el('span','pr-bar-track');track.append(fill);li.append(label,track,value);bars.append(li);
  }
  box.append(bars,el('small','pr-hero-time',t('prSyncShort',{time:when(data.checkedAt)})),button('pr-button pr-button-green',t('prHeroTry'),()=>{setCart(ids);pendingScroll='cart';update()}));
  return box;
 }

 function presets(){
  const box=el('section','pr-presets'),row=el('div','pr-preset-row');
  box.append(el('h2','pr-h2',t('prPresets')));
  for(const p of TC.PRESETS){
   const ids=TC.presetIds(data,p);if(ids.length<3)continue;
   const on=ids.length===cart.size&&ids.every(id=>cart.has(id)),b=button(`pr-preset${on?' is-on':''}`,null,()=>{setCart(ids);pendingScroll='cart';update()});
   b.setAttribute('aria-pressed',String(on));b.append(el('span','pr-preset-icon',p.icon),el('span','pr-preset-name',t(p.label)),el('small','',t('prBarCart',{count:ids.length})));row.append(b);
  }
  box.append(row);return box;
 }

 function productLink(cell,cls){return LINK.test(cell.url||'')?Object.assign(el('a',cls),{href:cell.url,target:'_blank',rel:'noopener noreferrer'}):el('div',cls)}
 function deals(){
  const list=TC.topDeals(data,6);if(!list.length)return null;
  const box=el('section','pr-deals'),grid=el('div','pr-deal-grid');box.append(el('h2','pr-h2',t('prDeals')));
  for(const d of list){
   const c=d.cell,card=productLink(c,'pr-deal'),img=photoNode(c,'pr-deal-img',64);if(img)card.append(img);
   const body=el('div','pr-deal-body'),shop=el('span','pr-deal-shop');shop.append(badge(d.store),el('small','',d.store.name));
   const price=el('span','pr-deal-price');price.append(el('b','',money(c.price)),el('s','',money(c.listPrice)),el('span','pr-pill pr-pill-red','-'+d.percent+'%'));
   body.append(el('span','pr-deal-name',c.name),shop,price);card.append(body);card.setAttribute('aria-label',`${c.name} · ${d.store.name} · ${money(c.price)} (-${d.percent}%)`);grid.append(card);
  }
  box.append(grid);return box;
 }
 function drops(){
  const list=TC.priceDrops(data,6);if(!list.length)return null;
  const box=el('section','pr-drops'),ul=el('ul','pr-drop-list');box.append(el('h2','pr-h2',t('prDrops')));
  for(const d of list){
   const li=el('li','pr-drop');li.append(badge(d.store),el('span','pr-drop-name',d.item.name));
   const move=el('span','pr-drop-move');move.append(el('s','',num(d.before)),' → ',el('b','',num(d.cell.unitPrice)),el('small','',`/${d.item.unitLabel}`),el('span','pr-pill',`▼ ${d.percent}%`));li.append(move);ul.append(li);
  }
  box.append(ul);return box;
 }

 // ---- filters -----------------------------------------------------------------------------------------------------
 function groupChips(){
  const box=el('div','pr-groups');box.setAttribute('role','group');box.setAttribute('aria-label',t('prCompare'));
  for(const [id,label] of [['',t('prAllGroups')],...(data.groups||[]).map(g=>[g.id,g.name])]){
   const b=button(`pr-group-chip${group===id?' is-on':''}`,label,()=>{group=id;page=1;update()});b.setAttribute('aria-pressed',String(group===id));box.append(b);
  }
  return box;
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

 // ---- prices: a table on wide screens, a card per product on phones ----------------------------------------------
 function priceNode(item,store,c){
  const label=num(c.unitPrice),detail=`${c.name}${c.size?` · ${c.size}`:''} · ${money(c.price)}${c.listPrice?` (${money(c.listPrice)})`:''}`;
  const node=LINK.test(c.url||'')?Object.assign(el('a','pr-price',label),{href:c.url,target:'_blank',rel:'noopener noreferrer'}):el('span','pr-price',label);
  node.title=detail;node.setAttribute('aria-label',`${store.name}: ${money(c.unitPrice)}/${item.unitLabel}. ${detail}`);return node;
 }
 function moveNode(c){
  if(c.stale||!c.change)return null;
  const down=c.change<0,m=el('small',`pr-move ${down?'is-down':'is-up'}`,`${down?'▼':'▲'} ${num(Math.abs(c.change))}`);m.title=t(down?'prDown':'prUp');return m;
 }
 function notes(c){
  const out=[];
  if(c.stale)out.push(el('small','pr-stale',t('prStale')));
  else if(c.listPrice)out.push(el('small','pr-sale','-'+Math.round((1-c.price/c.listPrice)*100)+'%'));
  const m=moveNode(c);if(m)out.push(m);
  return out;
 }
 function priceCell(item,store,best){
  const c=item.perStore[store.id],td=el('td','pr-cell');
  if(c.status!=='ok'){const dash=el('span','pr-none','—');dash.title=statusText(c);dash.setAttribute('aria-label',statusText(c));td.append(dash);return td}
  const node=priceNode(item,store,c);
  if(best===store.id){td.classList.add('is-best');node.title=`${t('prBest')} · ${node.title}`}
  const photo=photoNode(c,'pr-thumb',34);if(photo)td.append(photo);
  td.append(node,...notes(c));
  return td;
 }
 const bestOf=(item,stores)=>{const ok=stores.filter(s=>comparable(item,s)),prices=ok.map(s=>item.perStore[s.id].unitPrice);return ok.length>1&&Math.min(...prices)!==Math.max(...prices)?ok[prices.indexOf(Math.min(...prices))].id:null};

 function toggle(item){cart.has(item.id)?cart.delete(item.id):cart.add(item.id);saveCart();update()}
 function addButton(item){
  const inCart=cart.has(item.id),add=button(`pr-add${inCart?' is-on':''}`,inCart?'✓':'+',()=>toggle(item)),label=t(inCart?'prRemoveFromCart':'prAddToCart',{name:item.name});
  add.setAttribute('aria-pressed',String(inCart));add.setAttribute('aria-label',label);add.title=label;return add;
 }
 const groupLabel=id=>data.groups?.find(g=>g.id===id)?.name;

 function table(items){
  const stores=shown(),wrap=el('div','pr-scroll'),tbl=el('table','pr-table'),head=el('tr');
  head.append(el('th','pr-col-item',t('prItem')));
  for(const s of stores){const th=el('th','pr-col-store',s.name);th.style.setProperty('--brand',brand(s));if(s.referenceOnly)th.append(el('small','',t('prReference')));head.append(th)}
  const thead=el('thead');thead.append(head);tbl.append(thead);
  const body=el('tbody');let current=null;
  for(const item of items){
   if(item.group!==current){current=item.group;const label=groupLabel(current);if(label){const gr=el('tr','pr-group'),gh=el('th','',label);gh.colSpan=stores.length+1;gr.append(gh);body.append(gr)}}
   const tr=el('tr',cart.has(item.id)?'is-in-cart':''),th=el('th','pr-name'),label=el('span','pr-name-text');th.scope='row';
   label.append(el('span','',item.name),el('small','',t('prPer',{unit:item.unitLabel})));th.append(addButton(item),label);tr.append(th);
   const best=bestOf(item,stores);for(const s of stores)tr.append(priceCell(item,s,best));
   body.append(tr);
  }
  tbl.append(body);wrap.append(tbl);return wrap;
 }

 function cards(items){
  const stores=shown(),list=el('div','pr-cards');let current=null;
  for(const item of items){
   if(item.group!==current){current=item.group;const label=groupLabel(current);if(label)list.append(el('h3','pr-card-group',label))}
   const card=el('article',`pr-card${cart.has(item.id)?' is-in-cart':''}`),head=el('div','pr-card-head'),title=el('div','pr-card-title');
   title.append(el('b','',item.name),el('small','',t('prPer',{unit:item.unitLabel})));head.append(addButton(item),title);card.append(head);
   const entries=stores.map(s=>({s,c:item.perStore[s.id]})).filter(e=>e.c?.status==='ok').sort((a,b)=>a.c.unitPrice-b.c.unitPrice);
   if(!entries.length){card.append(el('p','pr-muted',statusText(item.perStore[stores[0]?.id]||{status:'not_found'})));list.append(card);continue}
   const bestId=bestOf(item,stores),lead=entries.find(e=>comparable(item,e.s))||entries[0],isBest=bestId===lead.s.id;
   const top=el('div',`pr-card-lead${isBest?' is-best':''}`),photo=photoNode(lead.c,'pr-card-img',56);if(photo)top.append(photo);
   const info=el('div','pr-card-info'),shop=el('span','pr-card-shop');shop.append(badge(lead.s),el('small','',isBest?t('prCheapest'):lead.s.name));
   const price=priceNode(item,lead.s,lead.c);price.classList.add('pr-card-price');info.append(shop,price,...notes(lead.c));top.append(info);card.append(top);
   const others=entries.filter(e=>e!==lead);
   if(others.length){const row=el('div','pr-card-others');for(const e of others){const chip=el('span','pr-mini');chip.append(badge(e.s),priceNode(item,e.s,e.c),...notes(e.c).filter(n=>n.classList.contains('pr-move')));row.append(chip)}card.append(row)}
   list.append(card);
  }
  return list;
 }

 function pager(total){
  const pages=Math.max(1,Math.ceil(total/PAGE)),nav=el('nav','pr-pager');nav.setAttribute('aria-label',t('prPages'));
  const go=p=>{page=p;update();scrollTo(parts.table)};
  const btn=(text,p,label,current)=>{const b=button(`pr-page${current?' is-current':''}`,text,()=>go(p));b.disabled=p<1||p>pages||current;if(label)b.setAttribute('aria-label',label);if(current)b.setAttribute('aria-current','page');return b};
  nav.append(btn('‹',page-1,t('prPrev')));
  for(let p=1;p<=pages;p++)if(p===1||p===pages||Math.abs(p-page)<=1)nav.append(btn(String(p),p,null,p===page));else if(Math.abs(p-page)===2)nav.append(el('span','pr-gap','…'));
  nav.append(btn('›',page+1,t('prNext')),el('span','pr-count',t('prPage',{page,pages,count:total})));
  return nav;
 }

 // ---- cart: the chosen items, then each store's total for all of them (one store, one trip) ------------------------
 function summaryText(result){return result.best?t('prShareText',{count:result.items.length,store:result.best.store.name,total:money(result.best.total)})+' · '+t('prSyncShort',{time:when(data.checkedAt)}):t('prTitle')}
 async function shareCart(){
  const ids=[...cart];if(!ids.length)return;
  const url=`${location.origin}/gia?${TC.cartQuery(ids)}`,text=summaryText(compare());
  try{if(navigator.share){await navigator.share({title:t('prTitle'),text,url});return}}catch(error){if(error?.name==='AbortError')return}
  try{await navigator.clipboard.writeText(url);toast(t('prShared'))}catch{toast(url)}
 }
 function cartBox(){
  const box=el('section','pr-cart'),top=el('div','pr-cart-top'),result=compare();
  const title=el('h2','',t('prCart'));title.append(el('span','pr-pill',String(result.items.length)));
  const actions=el('div','pr-cart-actions'),share=button('pr-button pr-button-green',t('prShare'),shareCart),png=button('pr-button',t('prExport'),exportImage),clear=button('pr-button pr-button-quiet',t('prClear'),()=>{cart.clear();saveCart();update()});
  share.disabled=png.disabled=clear.disabled=!result.items.length;actions.append(share,png,clear);top.append(title,actions);box.append(top);
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
   const amount=el('span','pr-cart-amount');amount.append(el('strong','',row.have?money(row.total):'—'));
   if(row===result.best)amount.append(el('span','pr-pill',t('prCheapest')));
   else if(result.best&&!row.reference&&row.have===result.best.have)amount.append(el('small','pr-diff','+'+money(row.total-result.best.total)));
   li.append(name,info,amount);
   if(row.missing.length&&row.missing.length<=4)li.append(el('small','pr-cart-missing',`${t('prMissing')}: ${row.missing.join(', ')}`));
   rows.append(li);
  }
  box.append(rows,el('p','pr-fine',t('prCartNote')));
  return box;
 }
 // Sticks to the bottom of the screen once something is in the cart, so the answer is always in view.
 function bar(){
  const box=el('div','pr-bar');if(!cart.size){box.hidden=true;return box}
  const result=compare(),info=el('div','pr-bar-info');
  info.append(el('b','',t('prBarCart',{count:result.items.length})));
  if(result.best){const best=el('span','pr-bar-best');best.append(badge(result.best.store),el('span','',`${result.best.store.name} · ${money(result.best.total)}`));info.append(best)}
  box.append(info,button('pr-button',t('prBarView'),()=>scrollTo(parts.cart)),button('pr-button pr-button-green',t('prShare'),shareCart));
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
  g.fillStyle='#6a7a71';g.font=font(400,11);g.fillText(fit(t('prCartNote'),W-pad*2),pad,fy+24);g.fillText(fit(`${t('prUpdated')} ${when(data.checkedAt)} · ${location.host}/gia`,W-pad*2),pad,fy+42);
  canvas.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`gio-hang-${new Date().toISOString().slice(0,10)}.png`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000)},'image/png');
 }

 function update(){
  const items=matches(),pages=Math.max(1,Math.ceil(items.length/PAGE));page=Math.min(page,pages);
  parts.presets.replaceWith(parts.presets=presets());
  parts.groups.replaceWith(parts.groups=groupChips());
  parts.chips.replaceWith(parts.chips=chips());
  const area=el('div','pr-table-area');
  if(items.length){const slice=items.slice((page-1)*PAGE,page*PAGE);area.append(compact()?cards(slice):table(slice),pager(items.length))}
  else area.append(el('p','pr-empty-search',t('prNoResults',{q:query.trim()})));
  parts.table.replaceWith(parts.table=area);
  parts.cart.replaceWith(parts.cart=cartBox());
  parts.bar.replaceWith(parts.bar=bar());
  parts.board.classList.toggle('has-bar',cart.size>0);
  if(pendingScroll){const target=pendingScroll==='cart'?parts.cart:null;pendingScroll=null;requestAnimationFrame(()=>scrollTo(target))}
 }

 function render(){
  root.replaceChildren();
  const board=el('div','pr-board'),head=el('header','pr-head'),title=el('div');
  const exit=standalone?Object.assign(el('a','pr-button pr-enter',t('prEnterCafe')),{href:'/tra-da'}):button('pr-close','✕',close);
  if(!standalone)exit.setAttribute('aria-label',t('prClose'));
  title.append(el('small','',t('prSmall')),el('h1','',t('prTitle')));
  if(data){const sync=el('p',`pr-auto${isStale(data.checkedAt)?' is-stale':''}`);sync.append(el('b','',t('prSync',{time:when(data.checkedAt),age:ageText(data.checkedAt)})),el('small','',isStale(data.checkedAt)?t('prStaleWarn'):t('prAutoNote')));title.append(sync)}
  head.append(title,exit);board.append(head);
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
  parts={board,presets:el('div'),groups:el('div'),chips:el('div'),table:el('div'),cart:el('div'),bar:el('div')};
  board.append(hero(),parts.presets);
  for(const section of [deals(),drops()])if(section)board.append(section);
  const form=el('form','pr-search'),input=el('input'),go=el('button','pr-search-go');
  form.setAttribute('role','search');input.type='search';input.value=query;input.placeholder=t('prSearch');input.setAttribute('aria-label',t('prSearch'));input.enterKeyHint='search';
  go.type='submit';go.setAttribute('aria-label',t('prSearch'));go.append(el('span','pr-search-icon'));
  input.oninput=()=>{query=input.value;page=1;update()};form.onsubmit=event=>{event.preventDefault();input.blur()};
  form.append(input,go);
  board.append(el('h2','pr-h2',t('prCompare')),form,parts.groups,parts.table,parts.cart,el('h2','pr-h2',t('prStores')),parts.chips);
  const bhx=data.stores.find(s=>s.id==='bhx');
  if(bhx)board.append(el('p','pr-source-note',t(bhx.unavailable?'prBhxUnavailable':bhx.region?'prBhxSnapshot':'prBhxUnverified',{time:when(bhx.checkedAt)})));
  const foot=el('footer','pr-foot');
  foot.append(el('p','pr-updated',`${t('prUpdated')}: ${data.stores.map(s=>`${s.name} ${when(s.checkedAt)}`).join(' · ')}`),el('p','pr-note',t('prNote')));
  const csv=el('a','pr-button',t('prCsv'));csv.href='/api/tea/prices.csv';csv.download='bang-gia-sieu-thi.csv';foot.append(csv);
  board.append(foot);root.append(board,parts.bar);update();
 }

 async function load(){
  clearTimeout(timer);failed=false;
  try{
   const response=await fetch('/api/tea/prices',{cache:'no-cache'});
   if(response.status===202){render();timer=setTimeout(load,4000+Math.random()*3000);return}
   if(!response.ok)throw new Error('prices');
   data=await response.json();
   if(!urlApplied&&search){urlApplied=true;const ids=TC.cartFromQuery(search,data.items.map(i=>i.id));if(ids.length){setCart(ids);pendingScroll='cart'}}
  }catch{if(!data)failed=true}
  render();
 }

 return{open(){render();load()},stop(){clearTimeout(timer)}};
};

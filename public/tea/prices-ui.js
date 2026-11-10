// Supermarket price board: full-screen chalkboard opened from the café wall. Data comes from our own /api/tea/prices;
// product names are third-party text, so every node is built with textContent and never from markup strings.
window.TeaPricesUI=function({t,locale,close}){
 const root=document.querySelector('#prices-view'),LINK=/^https:\/\/(winmart\.vn|cooponline\.vn)\//;
 let data=null,timer=null,failed=false;
 const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!=null)node.textContent=text;return node};
 const lang=()=>locale()==='vi'?'vi-VN':'en-GB';
 const money=n=>new Intl.NumberFormat(lang()).format(Math.round(n))+'đ';
 const when=iso=>iso?new Date(iso).toLocaleString(lang(),{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'–';

 function cell(item,store,cmp){
  const c=item.perStore[store.id],td=el('td','pr-cell');
  if(c.status!=='ok'){td.classList.add('is-empty');td.append(el('span','pr-empty',t(c.status==='out_of_stock'?'prOut':c.status==='error'?'prError':'prNotFound')));return td}
  if(cmp&&cmp.best===store.id){td.classList.add('is-best');td.append(el('span','pr-tag',t('prBest')))}
  td.append(el('b','pr-unit',`${money(c.unitPrice)}/${item.unitLabel}`));
  const pack=el('span','pr-pack'),name=LINK.test(c.url||'')?Object.assign(el('a','pr-link',c.name),{href:c.url,target:'_blank',rel:'noopener noreferrer'}):el('span','',c.name);
  pack.append(name);td.append(pack);
  const price=el('span','pr-price',`${c.size} · ${money(c.price)}`);
  if(c.listPrice)price.append(' ',el('s','',money(c.listPrice)));
  if(c.stale)price.append(' · ',t('prStale'));
  td.append(price);return td;
 }

 function basket(){
  const box=el('div','pr-basket'),b=data.basket,[a,c]=data.stores,ta=b.totals[a.id],tc=b.totals[c.id];
  box.append(el('b','',t('prBasket',{count:b.count})),' ',el('small','',`(${t('prBasketNote')})`));
  if(!b.count){box.append(el('p','pr-sum',t('prBasketNone')));return box}
  const row=el('div','pr-totals');
  for(const s of data.stores){const total=b.totals[s.id],won=total===Math.min(ta,tc)&&ta!==tc;row.append(el('span',`pr-total${won?' is-best':''}`,`${s.name} ${money(total)}`))}
  box.append(row);
  if(ta!==tc){const cheap=ta<tc?a:c,diff=Math.abs(ta-tc),pct=(diff/Math.max(ta,tc)*100).toFixed(1).replace('.',locale()==='vi'?',':'.');box.append(el('p','pr-sum',t('prBasketWin',{store:cheap.name,amount:money(diff),percent:pct})))}
  return box;
 }

 function table(){
  const wrap=el('div','pr-scroll'),tbl=el('table','pr-table'),head=el('tr');
  head.append(el('th','',t('prItem')));for(const s of data.stores)head.append(el('th','',s.name));
  const thead=el('thead');thead.append(head);tbl.append(thead);
  const body=el('tbody');
  for(const item of data.items){
   const tr=el('tr'),th=el('th','pr-name',item.name);th.scope='row';tr.append(th);
   const ok=data.stores.filter(s=>item.perStore[s.id].status==='ok'),prices=ok.map(s=>item.perStore[s.id].unitPrice);
   const cmp=ok.length>1&&Math.min(...prices)!==Math.max(...prices)?{best:ok[prices.indexOf(Math.min(...prices))].id}:null;
   for(const s of data.stores)tr.append(cell(item,s,cmp));
   body.append(tr);
  }
  tbl.append(body);wrap.append(tbl);return wrap;
 }

 function render(){
  root.replaceChildren();
  const board=el('div','pr-board'),head=el('header','pr-head'),title=el('div'),closeButton=el('button','pr-close','✕');
  closeButton.type='button';closeButton.setAttribute('aria-label',t('prClose'));closeButton.onclick=close;
  title.append(el('small','',t('prSmall')),el('h1','',t('prTitle')));head.append(title,closeButton);board.append(head);
  if(!data){
   const status=el('div','pr-status');status.setAttribute('role','status');
   if(failed){status.append(el('p','',t('prLoadErr')));const retry=el('button','pr-button',t('prRetry'));retry.type='button';retry.onclick=()=>load();status.append(retry)}
   else status.append(el('p','',t('prLoading')));
   board.append(status);root.append(board);return;
  }
  board.append(basket(),table());
  const foot=el('footer','pr-foot');
  foot.append(el('p','pr-updated',`${t('prUpdated')}: ${data.stores.map(s=>`${s.name} ${when(s.checkedAt)}`).join(' · ')}`),el('p','pr-note',t('prNote')));
  const csv=el('a','pr-button',t('prCsv'));csv.href='/api/tea/prices.csv';csv.download='bang-gia-sieu-thi.csv';foot.append(csv);
  board.append(foot);root.append(board);
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

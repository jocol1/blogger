// Original pixel silhouettes shared by the pond, catch animation and collection book.
window.TeaFishArt=(c,p,def,time=0)=>{
 const shape=def.shape||'round',long=['long','catfish','arowana'].includes(shape),deep=shape==='deep';
 const w=long?34:26,h=deep?20:12,color=def.color||'#a4b789',accent=def.accent||'#dc8f61';
 if(shape==='eel'){
  for(let i=0;i<8;i++){const y=Math.round(Math.sin(i*.65+time/300)*3);p(c,'#4d543d',-20+i*5,y,7,7);p(c,color,-20+i*5,y,6,4);}
  p(c,'#243b36',-19,1,2,2);return;
 }
 p(c,'#354e49',-w/2-2,-h/2+3,w+2,h-1);p(c,color,-w/2,-h/2,w,h-2);p(c,color,w/2-1,-h/2-3,7,h+4);
 p(c,accent,-6,-h/2-4,long?20:10,4);p(c,accent,0,h/2-2,9,4);p(c,'#e9e6bb',-w/2+4,-h/2+2,w-9,2);
 if(def.pattern==='stripes')for(let i=0;i<3;i++)p(c,accent,-4+i*6,-h/2+4,2,h-7);
 if(def.pattern==='spots')for(let i=0;i<3;i++)p(c,accent,-3+i*7,(i%2)*4-2,3,3);
 if(def.pattern==='scales')for(let i=0;i<5;i++)p(c,accent,-6+i*4,(i%2)*4-2,2,2);
 if(shape==='catfish'){p(c,accent,-w/2-8,4,12,2);p(c,accent,-w/2-5,7,9,2);}
 if(shape==='arowana'){p(c,accent,-w/2-5,-3,6,2);p(c,accent,-8,h/2-1,26,3);}
 p(c,'#fff8df',-w/2+2,-h/2+4,4,4);p(c,'#233d39',-w/2+2,-h/2+5,2,2);
};
window.TeaFishBook=({state,locale,t,draw})=>{
 let dialog=document.querySelector('#fish-book');if(dialog)dialog.remove();dialog=document.createElement('dialog');dialog.id='fish-book';dialog.className='fish-book';
 const heading=document.createElement('div');heading.className='fish-book-heading';const title=document.createElement('h2');title.id='fish-book-title';title.textContent=t('fishBook');dialog.setAttribute('aria-labelledby',title.id);
 const close=document.createElement('button');close.textContent='×';close.setAttribute('aria-label',t('close'));close.onclick=()=>dialog.close();heading.append(title,close);dialog.append(heading);
 const species=Object.entries(state.catalog).filter(([,def])=>def.type==='caught'),summary=document.createElement('p');summary.textContent=`${species.filter(([key])=>state.farm.fishBook?.[key]>0).length}/${species.length} · ${t('fishBookHint')}`;dialog.append(summary);
 const grid=document.createElement('div');grid.className='fish-book-grid';dialog.append(grid);
 for(const [key,def]of species){const count=state.farm.fishBook?.[key]||0,card=document.createElement('section');card.className='fish-species';card.dataset.rarity=def.rarity;card.dataset.discovered=String(count>0);
  const art=document.createElement('canvas');art.width=120;art.height=64;draw(art.getContext('2d'),key,60,34,2,1,0);
  const name=document.createElement('strong');name.textContent=def[locale];const detail=document.createElement('small');detail.textContent=`${t(def.rarity)} · ${def.sell} ${t('gold')}`;
  const caught=document.createElement('span');caught.textContent=count?`${t('caughtCount')}: ${count}`:t('notCaught');card.append(art,name,detail,caught);grid.append(card);
 }
 document.body.append(dialog);dialog.showModal();close.focus();
};

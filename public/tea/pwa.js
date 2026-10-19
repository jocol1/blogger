(()=>{
  const $=selector=>document.querySelector(selector);let installPrompt=null,waitingWorker=null,reloading=false,installedConfirmed=false;
  const locale=()=>document.documentElement.lang==='vi'?'vi':'en';
  const word=key=>window.TeaPwaWords?.[locale()]?.[key]||window.TeaPwaWords?.en?.[key]||key;
  const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)&&!window.MSStream;
  function translate(root=document){root.querySelectorAll('[data-pwa-i18n]').forEach(node=>{node.textContent=word(node.dataset.pwaI18n);});}
  function refreshInstall(){document.body.classList.toggle('is-installed',standalone());document.querySelectorAll('[data-install-cafe]').forEach(button=>button.hidden=standalone());}
  function syncInstallControls(){const native=Boolean(installPrompt)&&!ios;$('#install-platform-copy').textContent=word(ios?'installIos':/Android/.test(navigator.userAgent)?'installAndroid':'installOther');$('#install-confirm').hidden=!native;$('#install-manual').hidden=native;$('#install-manual').textContent=word(ios?'installManualIos':'installManual');}
  function openInstall(){
    translate();const dialog=$('#install-dialog'),wallet=localStorage.getItem('locly-game-wallet')||'';$('#install-wallet-code').textContent=wallet||'—';$('#install-status').textContent=word(installedConfirmed?'installDone':'installNotStarted');syncInstallControls();dialog.showModal();
  }
  async function install(){if(!installPrompt){$('#install-status').textContent=word('installManualCopyFailed');return;}const prompt=installPrompt;installPrompt=null;try{await prompt.prompt();const choice=await prompt.userChoice;if(!installedConfirmed)$('#install-status').textContent=word(choice?.outcome==='accepted'?'installPending':'installCancelled');}catch{$('#install-status').textContent=word('installManualCopyFailed');}refreshInstall();syncInstallControls();}
  function setOnline(){const offline=!navigator.onLine;$('#offline-banner').hidden=!offline;document.body.classList.toggle('is-offline',offline);}
  function setOrientation(){const blocked=matchMedia('(max-width: 900px) and (orientation: portrait)').matches;document.body.classList.toggle('portrait-blocked',blocked);$('#rotate-overlay').hidden=!blocked;window.dispatchEvent(new CustomEvent('tea:orientationchange',{detail:{blocked}}));}
  function showUpdate(worker){waitingWorker=worker;if(window.teaCanReload?.()){worker.postMessage({type:'SKIP_WAITING'});return;}translate();$('#update-banner').hidden=false;}
  async function activateUpdate(){if(!waitingWorker)return;if(window.teaCanReload&&!window.teaCanReload()){const status=$('#update-status');status.textContent=word('updateBusy');status.hidden=false;return;}waitingWorker.postMessage({type:'SKIP_WAITING'});}
  addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;refreshInstall();if($('#install-dialog')?.open)syncInstallControls();});
  addEventListener('appinstalled',()=>{installedConfirmed=true;installPrompt=null;refreshInstall();if($('#install-dialog')?.open)$('#install-status').textContent=word('installDone');});
  addEventListener('online',setOnline);addEventListener('offline',setOnline);addEventListener('resize',setOrientation);addEventListener('orientationchange',setOrientation);
  document.querySelectorAll('[data-install-cafe]').forEach(button=>button.addEventListener('click',openInstall));
  $('#install-confirm')?.addEventListener('click',install);$('#install-manual')?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(location.origin+'/tra-da');$('#install-status').textContent=word(ios?'installManualHintIos':'installManualHint');}catch{$('#install-status').textContent=word(ios?'installManualCopyFailedIos':'installManualCopyFailed');}});$('#install-copy-wallet')?.addEventListener('click',async()=>{const value=localStorage.getItem('locly-game-wallet');if(value){await navigator.clipboard.writeText(value);$('#install-copy-wallet').textContent='✓ '+word('copyWallet');}});
  document.querySelectorAll('[data-open-wallet]').forEach(button=>button.addEventListener('click',()=>{if($('#install-dialog')?.open)$('#install-dialog').close();$('#backup-button')?.click();}));
  $('#offline-retry')?.addEventListener('click',()=>location.reload());$('#update-button')?.addEventListener('click',activateUpdate);$('#panel-close')?.addEventListener('click',()=>document.body.classList.add('landscape-panel-closed'));
  if('serviceWorker'in navigator){navigator.serviceWorker.register('/tra-da-sw.js',{scope:'/tra-da'}).then(registration=>{if(registration.waiting)showUpdate(registration.waiting);registration.addEventListener('updatefound',()=>{const worker=registration.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)showUpdate(worker);});});registration.update().catch(()=>{});}).catch(()=>{});navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!reloading){reloading=true;location.reload();}});}
  const observer=new MutationObserver(()=>translate());observer.observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  translate();refreshInstall();setOnline();setOrientation();
})();

(() => {
  'use strict';
  const $ = s => document.querySelector(s), WALLET = 'locly-game-wallet', LANGUAGE = 'locly-tea-language';
  let token = localStorage.getItem(WALLET), locale = localStorage.getItem(LANGUAGE) === 'vi' ? 'vi' : 'en';
  const outbox = TeaFarmOutbox.create(localStorage, token);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let careEffect = null, fishingUi = null, cameraReady = false;
  let state, profile, offset = 0, pending = null, busy = false, panel = '', selected = 0, entered = false, waitingWorker, updateRequested = false;
  const keys = new Set(), player = { x: 500, y: 550 }, camera = { x: 0, y: 0, scale: 1 };
  let path = [], effectUntil = 0, frameAt = performance.now(), walk = false, cameraFocus = null, facing='down', stride=0, destination=null;
  const canvas = $('#farm-canvas'), ctx = canvas.getContext('2d');
  const words = {
    en: { cafe:'← Café',map:'MAP 02 · JUST YOURS',title:'My little farm',gold:'gold',backup:'Backup',loading:'Opening your garden…',retry:'Try again',hint:'Tap a patch or pond · WASD to walk',garden:'Garden',pond:'Pond',shop:'Shop',bag:'Basket',quests:'Tasks',decorate:'Decorate',free:'Free to play · Farm gold is separate from café coins',rotate:'Turn your phone sideways',rotateHint:'Your garden will be right here. Nothing stops growing.',walletHint:'This is the same code as your café wallet. Keep it private: it restores your character, farm and purchases.',copy:'Copy code',restoreLabel:'Restore a saved wallet',restore:'Restore',close:'Close',update:'Update farm',welcome:'Your own little corner. Plants and fish grow while you are away.',intro:'Start with 120 gold, 6 radish seeds and 2 guppies. Plant → water → harvest → sell. Stock → feed → catch. Nothing withers!',empty:'Empty',patch:'Patch',pool:'Fish spot',plant:'Plant',stock:'Add fish',water:'Water',feed:'Feed',harvest:'Harvest',catch:'Catch',ready:'Ready!',thirsty:'Water once to start growing. Water is free.',hungry:'Feed once to start growing. Feed is free.',growing:'Growing even while you are away. No more care needed.',seeds:'seeds / young fish',product:'harvested',buy:'Buy',sell:'Sell',sellAll:'Sell all',each:'each',upgradePlots:'Add 2 patches',upgradePond:'Add 2 fish spots',max:'Fully upgraded',shopHint:'Farm gold only. No café coins or bank transfer needed.',bagHint:'Harvested goods stay here until you sell them. Seeds and young fish are for planting and stocking.',noProducts:'Your basket is empty. Grow something first!',reward:'Claim',claimed:'Claimed',taskHint:'One-time rewards for getting to know your farm.',decorHint:'Buy ornaments in the shop, then choose a garden corner. One of each, yours forever.',corner:'Corner',place:'Place',remove:'Remove',noDecor:'Your garden has room for flowers, a lantern and a bench. Find them in the shop.',saved:'Saved',offline:'Connection lost. Your farm and wallet are safe. Reconnect and try again.',uncertain:'Not confirmed yet. Retry the same action safely.',needWallet:'Open the café to create a character, or restore your wallet.',invalidWallet:'This code is invalid. Restore your saved wallet; your current code has not been erased.',copied:'Code copied. Keep it somewhere private.',confirmRestore:'Switch to this wallet? Your current farm stays with its old backup code.',restoreFirst:'Back up your current code before switching wallets.',plotHint:'Choose a patch. Each plant needs one watering before its timer starts.',pondHint:'Choose a fish spot. Feed a young fish once; catch it when it has grown.',full:'Your farm is fully expanded.',newProfile:'Create your character in the café first.',pendingSwitch:'Retry the pending action before switching wallets.',farm_bad_request:'Please refresh and try again.',farm_request_conflict:'This request was already used. Refresh to see your farm.',farm_not_enough_gold:'Not enough farm gold. Sell produce or claim a task reward.',farm_no_seed:'You need more seeds or young fish. Visit the shop.',farm_slot_busy:'This spot is already in use. The farm has refreshed.',farm_stale_slot:'This spot changed in another tab. Choose it again.',farm_not_ready:'Still growing. Please wait for the timer.',farm_already_cared:'Already cared for. Just let it grow.',farm_no_product:'No products to sell. Your basket has refreshed.',farm_already_owned:'You already own this ornament.',farm_bad_item:'Choose a valid item.',farm_bad_slot:'Choose an unlocked spot.',farm_max_level:'Already fully upgraded.',farm_already_claimed:'Reward already collected.',farm_quest_not_ready:'Complete the task first.',farm_inventory_full:'Sell or use some items to make space.',private:'PRIVATE FARM',minutes:'min',view:'View',returnHint:'Your farm saves automatically. Meet everyone at the café.' },
    vi: { cafe:'← Về quán',map:'MAP 02 · CỦA RIÊNG BẠN',title:'Nông trại nhỏ',gold:'vàng',backup:'Mã ví',loading:'Đang mở khu vườn…',retry:'Thử lại',hint:'Chạm đất hoặc ao · WASD để đi',garden:'Vườn rau',pond:'Ao cá',shop:'Cửa hàng',bag:'Giỏ đồ',quests:'Nhiệm vụ',decorate:'Trang trí',free:'Chơi miễn phí · Vàng nông trại riêng với xu ở quán',rotate:'Xoay ngang điện thoại nhé',rotateHint:'Nông trại vẫn ở đây. Cây và cá vẫn lớn bình thường.',walletHint:'Đây cũng là mã ví ở quán. Giữ kín và sao lưu để khôi phục nhân vật, nông trại và món đã mua.',copy:'Sao chép mã',restoreLabel:'Khôi phục mã ví đã lưu',restore:'Khôi phục',close:'Đóng',update:'Cập nhật nông trại',welcome:'Góc nhỏ của riêng bạn. Cây và cá vẫn lớn khi bạn đi vắng.',intro:'Tặng 120 vàng, 6 hạt củ cải và 2 cá bảy màu. Gieo → tưới → thu hoạch → bán. Thả cá → cho ăn → bắt. Không lo cây héo!',empty:'Còn trống',patch:'Luống',pool:'Ô nuôi cá',plant:'Gieo',stock:'Thả cá',water:'Tưới nước',feed:'Cho ăn',harvest:'Thu hoạch',catch:'Bắt cá',ready:'Lớn rồi!',thirsty:'Tưới một lần để cây bắt đầu lớn. Nước miễn phí.',hungry:'Cho ăn một lần để cá bắt đầu lớn. Thức ăn miễn phí.',growing:'Vẫn lớn khi bạn đi vắng. Không cần chăm thêm.',seeds:'hạt / cá giống',product:'đã thu hoạch',buy:'Mua',sell:'Bán',sellAll:'Bán hết',each:'mỗi loại',upgradePlots:'Thêm 2 luống',upgradePond:'Thêm 2 ô cá',max:'Đã nâng tối đa',shopHint:'Chỉ dùng vàng nông trại. Không trừ xu ở quán, không cần nạp tiền.',bagHint:'Nông sản chờ bạn bán ở đây. Hạt giống dùng để gieo, cá giống dùng để thả ao.',noProducts:'Giỏ còn trống. Trồng rau và nuôi cá trước nhé!',reward:'Nhận thưởng',claimed:'Đã nhận',taskHint:'Phần thưởng một lần cho những cột mốc đầu tiên.',decorHint:'Mua đồ ở cửa hàng rồi chọn góc đặt. Mỗi món có một chiếc, có thể chuyển chỗ.',corner:'Góc',place:'Đặt',remove:'Cất đi',noDecor:'Vườn còn chỗ cho bồn hoa, đèn và ghế gỗ. Ghé cửa hàng nhé.',saved:'Đã lưu',offline:'Mất kết nối. Nông trại và mã ví vẫn an toàn. Có mạng rồi thử lại nhé.',uncertain:'Chưa xác nhận được. Bấm thử lại, không bị tính hai lần.',needWallet:'Vào quán tạo nhân vật hoặc khôi phục mã ví để mở nông trại.',invalidWallet:'Mã chưa hợp lệ. Khôi phục mã đã lưu nhé; mã hiện tại chưa bị xóa.',copied:'Đã sao chép. Hãy cất mã ở nơi riêng tư.',confirmRestore:'Chuyển sang ví này? Nông trại hiện tại vẫn nằm trong mã ví cũ.',restoreFirst:'Nhớ sao lưu mã hiện tại trước khi đổi ví.',plotHint:'Chọn một luống. Tưới một lần sau khi gieo để bắt đầu đếm giờ.',pondHint:'Chọn một ô cá. Cho cá giống ăn một lần rồi chờ lớn để bắt.',full:'Nông trại đã mở rộng tối đa.',newProfile:'Vào quán tạo nhân vật trước nhé.',pendingSwitch:'Thử lại thao tác đang chờ trước khi đổi ví.',farm_bad_request:'Tải lại trang rồi thử nhé.',farm_request_conflict:'Mã thao tác đã dùng. Tải lại để xem nông trại.',farm_not_enough_gold:'Chưa đủ vàng. Bán nông sản hoặc nhận thưởng nhiệm vụ nhé.',farm_no_seed:'Hết giống rồi, ghé cửa hàng mua thêm nhé.',farm_slot_busy:'Ô này đã có cây hoặc cá. Đã cập nhật lại.',farm_stale_slot:'Ô đã thay đổi ở tab khác. Chọn lại nhé.',farm_not_ready:'Chưa lớn đủ, chờ hết giờ nhé.',farm_already_cared:'Chăm rồi, cứ để lớn thôi.',farm_no_product:'Chưa có nông sản để bán. Đã cập nhật giỏ.',farm_already_owned:'Bạn đã có món trang trí này.',farm_bad_item:'Chọn lại món hợp lệ nhé.',farm_bad_slot:'Chọn ô đã mở khóa nhé.',farm_max_level:'Đã nâng tối đa.',farm_already_claimed:'Đã nhận thưởng rồi.',farm_quest_not_ready:'Hoàn thành nhiệm vụ trước nhé.',farm_inventory_full:'Bán hoặc dùng bớt đồ để có chỗ nhé.',private:'NÔNG TRẠI RIÊNG',minutes:'phút',view:'Xem',returnHint:'Nông trại tự lưu. Về quán để gặp mọi người nhé.' }
  };
  Object.assign(words.en,{fishing:'Fishing',raiseFish:'Raise fish',castLine:'Cast line',hookFish:'Hook!',reelFish:'Reel in!',stopFishing:'Put rod away',fishingHint:'Free rod & bait. Wait for the float, hook the fish, then reel while the marker is green.',fishingWait:'Watch the float…',fishingBite:'A bite! Hook now!',fishingReel:'Reel when the marker is GREEN',fishingValue:'Sell for',fishingCaught:'Into your basket:',fishingEarly:'Too soon — you scared the fish.',fishingMissed:'Missed the green zone. Try again!',fishingEscaped:'It got away. Cast again!',fishingStopped:'Rod put away.',fishingCooldown:'Next cast in',fishingFree:'FREE · FARM GOLD ONLY',fishing_active:'You already have a line in the water.',fishing_cooldown:'Wait a moment before casting again.',fishing_stale:'This cast changed. Check the current round.',fishing_finished:'This cast is over.',fishing_not_ready:'Wait for the reel marker.'});
  Object.assign(words.vi,{fishing:'Câu cá',raiseFish:'Nuôi cá',castLine:'Thả cần',hookFish:'Giật cần!',reelFish:'Kéo cá!',stopFishing:'Cất cần',fishingHint:'Cần và mồi miễn phí. Chờ phao động, giật cần rồi canh kim vào vùng xanh để kéo.',fishingWait:'Chờ phao động nhé…',fishingBite:'Cá cắn rồi! Giật cần!',fishingReel:'Canh kim vào vùng XANH rồi kéo',fishingValue:'Bán được',fishingCaught:'Đã vào giỏ:',fishingEarly:'Giật sớm quá, cá chạy mất rồi.',fishingMissed:'Hụt vùng xanh rồi. Thử lại nhé!',fishingEscaped:'Cá chạy mất rồi. Thả cần lại nhé!',fishingStopped:'Đã cất cần.',fishingCooldown:'Thả tiếp sau',fishingFree:'MIỄN PHÍ · VÀNG NÔNG TRẠI',fishing_active:'Bạn đang thả một cần rồi.',fishing_cooldown:'Chờ một chút rồi thả tiếp nhé.',fishing_stale:'Lượt câu đã đổi. Xem lượt hiện tại nhé.',fishing_finished:'Lượt câu đã kết thúc.',fishing_not_ready:'Chờ kim kéo cá xuất hiện nhé.'});
  const t = key => words[locale][key] || key, now = () => Date.now() + offset;
  const name = key => state?.catalog[key]?.[locale] || key;
  const portrait = () => matchMedia('(orientation:portrait) and (max-width:700px)').matches;
  function notice(key, error = false) { $('#notice-text').textContent = t(key); $('#notice').classList.toggle('error', error); $('#retry').hidden = !error; }
  async function api(url, options = {}) {
    const res = await fetch(url, { ...options, headers: { 'Content-Type':'application/json', 'X-Wallet-Token': token || '', ...options.headers }, signal: AbortSignal.timeout(12000) });
    const body = await res.json(); if (!res.ok) throw Object.assign(new Error(body.error), { status: res.status, code: body.code }); return body;
  }
  function accept(next) { offset = next.serverNow - Date.now(); if (!state || next.farm.version >= state.farm.version) state = next; $('#gold').textContent = state.farm.gold.toLocaleString(locale); }
  function loadPending() { pending = outbox.first(); }
  async function refresh() {
    if (!entered || busy) return;
    try { const version = state?.farm.version; accept(await api('/api/tea/farm')); if (version !== state.farm.version) renderPanel(); if (!pending) notice('welcome'); }
    catch (error) { notice(error.status === 401 ? 'invalidWallet' : 'offline', true); }
  }
  async function act(input) {
    if (busy || !entered || portrait()) return;
    if (pending && input) { notice('uncertain', true); return; }
    if (!pending) {
      pending = { ...input, requestId: crypto.randomUUID() };
      try { outbox.save(pending); } catch { pending = null; notice('offline', true); return; }
    }
    const attempt = pending;
    const fish = ['stock','feed','catch'].includes(attempt.type);
    const effectItem = attempt.item || state?.farm[fish ? 'ponds' : 'plots'][attempt.slot]?.item;
    busy = true;
    if(panel==='fishing')renderPanel();
    else{ $('#panel').setAttribute('aria-busy','true');$('#panel-content').querySelectorAll('button').forEach(node=>{node.disabled=true;}); }
    try {
      const type = attempt.type; accept(await api('/api/tea/farm/actions', { method:'POST', body:JSON.stringify(attempt) }));
      outbox.remove(attempt.requestId); loadPending(); notice(pending ? 'uncertain' : 'saved', Boolean(pending));
      if (['plant','stock','water','feed','harvest','catch'].includes(type)) {
        careEffect = { type, item: effectItem, ... (fish ? fishPos(attempt.slot) : plotPos(attempt.slot)), started: performance.now() };
        canvas.dataset.careEffect = type;
      }
      if(type==='reelFish'&&state.farm.fishing?.reason==='caught'){
        careEffect={type:'catch',rod:true,item:state.farm.fishing.caught,x:795,y:440,started:performance.now()};canvas.dataset.careEffect='catch';
      }
      if (['harvest','catch','sell','claim'].includes(type)) { $('#harvest-fx').textContent = t(type === 'claim' ? 'reward' : type === 'sell' ? 'sell' : type); effectUntil = performance.now() + 1800; }
    } catch (error) {
      if (error.status && error.status < 500) { outbox.remove(attempt.requestId); loadPending(); if (error.status !== 401) { try { accept(await api('/api/tea/farm')); } catch {} } notice(pending ? 'uncertain' : words[locale][error.code] ? error.code : error.status === 401 ? 'invalidWallet' : 'offline', true); }
      else notice('uncertain', true);
    } finally { busy = false; $('#panel').removeAttribute('aria-busy');renderPanel(); }
  }
  function el(tag, text, className, parent) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; parent?.append(node); return node; }
  function button(parent, label, onClick, disabled = false) { const node = el('button', label, '', parent); node.disabled = disabled || busy || Boolean(pending); node.onclick = onClick; return node; }
  function card(parent, title, description, item) { const box = el('section', undefined, 'card', parent); if (item) { const icon = el('canvas', undefined, 'big-icon', box); icon.width = 48; icon.height = 48; drawItem(icon.getContext('2d'), item, 24, 29, 1.3, 1); } el('h3', title, '', box); if (description) el('p', description, '', box); return box; }
  function duration(seconds) { return seconds < 60 ? `${seconds}s` : `${seconds / 60} ${t('minutes')}`; }
  function remaining(row) { const s = Math.max(0, Math.ceil((row.readyAt - now()) / 1000)); return s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2,'0')}` : t('ready'); }
  function openPanel(key, slot) { panel = key; if (slot !== undefined) selected = slot; else selected = 0; if(key==='fishing'){cameraFocus={x:780,y:420};routeTo(780,540);}else if (state && (key === 'garden' || key === 'pond')) focusSpot(key === 'pond', selected); else cameraFocus = null; renderPanel(); }
  function focusSpot(fish, index) { const spot = fish ? fishPos(index) : plotPos(index); cameraFocus = spot; routeTo(fish ? 620 : spot.x, fish ? spot.y : spot.y + 43); }
  function renderPanel() {
    $('#panel').hidden = !panel; document.querySelectorAll('[data-panel]').forEach(b => b.setAttribute('aria-pressed', b.dataset.panel === panel));
    $('#fishing-switch').hidden=!['pond','fishing'].includes(panel);$('#fishing-switch').textContent=t(panel==='fishing'?'raiseFish':'fishing');
    if (!panel) return; $('#panel-title').textContent = t(panel); const root = $('#panel-content');
    if(panel==='fishing'&&root.dataset.mode==='fishing'&&root.dataset.locale===locale&&fishingUi){syncFishingUi();return;}
    root.dataset.mode = panel;root.dataset.locale=locale;root.replaceChildren();fishingUi=null;
    if(panel==='garden'||panel==='pond')root.scrollTop=0;
    if (!state) { el('p', t('needWallet'), 'intro', root); return; }
    const f = state.farm;
    if (f.version === 1 && panel === 'garden') el('p', t('intro'), 'intro', root);
    if (panel === 'garden' || panel === 'pond') {
      const fish = panel === 'pond', area = fish ? f.ponds : f.plots; selected = Math.min(selected, area.length - 1);
      el('p', t(fish ? 'pondHint' : 'plotHint'), 'intro', root);
      const slots = el('div', undefined, 'slots', root);
      area.forEach((row, i) => { const b = button(slots, `${i + 1} ${row ? (row.readyAt && row.readyAt <= now() ? '✓' : '•') : '+'}`, () => { selected = i; focusSpot(fish, i); renderPanel(); }); b.classList.toggle('active', selected === i); b.setAttribute('aria-label', `${t(fish ? 'pool' : 'patch')} ${i + 1}`); });
      const row = area[selected], box = card(root, `${t(fish ? 'pool' : 'patch')} ${selected + 1} · ${row ? name(row.item) : t('empty')}`, '', row?.item);
      if (!row) {
        const choices = el('div', undefined, 'choices', box);
        Object.entries(state.catalog).filter(([,v]) => v.type === (fish ? 'fish' : 'crop')).forEach(([key]) => button(choices, `${t(fish ? 'stock' : 'plant')} ${name(key)} (${f.seeds[key] || 0})`, () => act({ type:fish ? 'stock' : 'plant', item:key, slot:selected }), !(f.seeds[key] > 0)));
      } else {
        el('p', t(row.readyAt === null ? fish ? 'hungry' : 'thirsty' : 'growing'), '', box);
        if (row.readyAt !== null) { box.classList.add('growing-card');const timer = el('div', remaining(row), 'timer', box); timer.dataset.readyAt = row.readyAt; }
        const type = row.readyAt === null ? fish ? 'feed' : 'water' : fish ? 'catch' : 'harvest';
        const b = button(box, t(type), () => act({ type, slot:selected, cycleId:row.cycleId }), row.readyAt !== null && row.readyAt > now());
        if (row.readyAt !== null) b.dataset.readyAt = row.readyAt;
      }
      const max = fish ? 6 : 12, cost = fish ? 100 + (area.length - 2) * 60 : 120 + (area.length - 6) * 30;
      if (area.length < max) button(root, `${t(fish ? 'upgradePond' : 'upgradePlots')} · ${cost} ${t('gold')}`, () => act({ type:fish ? 'upgradePond' : 'upgradePlots' }), f.gold < cost);
      else el('p', t('max'), 'intro', root);
    } else if(panel==='fishing') {
      const box=card(root,t('fishingFree'),'');box.classList.add('fishing-card');
      el('p',t('fishingHint'),'fishing-help',box);
      const steps=el('div',undefined,'fishing-steps',box);
      const stepNodes=['castLine','hookFish','reelFish'].map((key,i)=>el('span',`${i+1} · ${t(key).replace('!','')}`,'',steps));
      const status=el('p','','fishing-status',box);status.id='fishing-status';status.setAttribute('role','status');
      const meter=el('canvas',undefined,'fishing-meter',box);meter.id='fishing-meter';meter.width=260;meter.height=28;meter.setAttribute('aria-label',t('fishingReel'));
      const controls=el('div',undefined,'fishing-controls',box);
      const primary=button(controls,'',()=>{const round=state?.farm.fishing;act(round&&round.status!=='finished'?{type:round.status==='waiting'?'hookFish':'reelFish',roundId:round.id}:{type:'castLine'});});primary.id='fishing-action';
      const stop=button(controls,t('stopFishing'),()=>{const round=state?.farm.fishing;if(round&&round.status!=='finished')act({type:'stopFishing',roundId:round.id});});stop.classList.add('fishing-stop');
      fishingUi={box,status,meter,primary,stop,stepNodes,controls};
      syncFishingUi();
    } else if (panel === 'shop') {
      el('p', t('shopHint'), 'intro', root);
      Object.entries(state.catalog).filter(([,def])=>def.type!=='caught').forEach(([key, def]) => { const box = card(root, name(key), def.type === 'decor' ? t('decorate') : `${duration(def.seconds)} · ${t('sell')} ${def.sell} ${t('gold')}`, key); button(box, `${t('buy')} · ${def.price} ${t('gold')}`, () => act({ type:'buy', item:key }), f.gold < def.price || f.decorations.includes(key)); });
    } else if (panel === 'bag') {
      el('p', t('bagHint'), 'intro', root); let count = 0;
      Object.entries(f.products).filter(([,qty]) => qty > 0).forEach(([key, qty]) => { count++; const box = card(root, `${name(key)} × ${qty}`, t('product'), key); button(box, `${t('sell')} ×${Math.min(99,qty)} · ${Math.min(99,qty) * state.catalog[key].sell} ${t('gold')}`, () => act({ type:'sell', item:key, quantity:Math.min(99,qty) })); });
      if (!count) el('p', t('noProducts'), 'intro', root);
      Object.entries(f.seeds).filter(([,qty]) => qty > 0).forEach(([key, qty]) => card(root, `${name(key)} × ${qty}`, t('seeds'), key));
    } else if (panel === 'quests') {
      el('p', t('taskHint'), 'intro', root);
      state.quests.forEach(q => { const box = card(root, q[locale], `${Math.min(f.stats[q.stat]||0,q.target)} / ${q.target} · +${q.reward} ${t('gold')}`); button(box, t(f.claimed.includes(q.id) ? 'claimed' : 'reward'), () => act({ type:'claim', quest:q.id }), f.claimed.includes(q.id) || (f.stats[q.stat]||0) < q.target); });
    } else if (panel === 'decorate') {
      el('p', t('decorHint'), 'intro', root); if (!f.decorations.length) el('p', t('noDecor'), 'intro', root);
      f.placed.forEach((item, slot) => { const box = card(root, `${t('corner')} ${slot + 1} · ${item ? name(item) : t('empty')}`, '', item); f.decorations.forEach(key => button(box, `${t('place')} ${name(key)}`, () => act({ type:'decorate', item:key, slot }), item === key)); if (item) button(box, t('remove'), () => act({ type:'decorate', item:null, slot })); });
    }
  }
  function applyLocale() { document.documentElement.lang = locale; localStorage.setItem(LANGUAGE, locale); document.querySelectorAll('[data-text]').forEach(n => { n.textContent = t(n.dataset.text); }); $('#lang').textContent = locale === 'vi' ? 'EN' : 'VI'; $('#owner').textContent = profile ? `${profile.nickname} · ${t('private')}` : t('private'); renderPanel(); }
  const p = (c, color, x, y, w, h) => { c.fillStyle = color; c.fillRect(Math.round(x), Math.round(y), w, h); };
  function tree(c, x, y, size = 1) { c.save(); c.translate(x,y); c.scale(size,size); p(c,'#68834b',-28,18,60,12); p(c,'#715139',-7,-12,16,42); p(c,'#98704b',0,-10,5,35); p(c,'#365e42',-29,-48,60,50); p(c,'#365e42',-40,-32,80,30); p(c,'#52794b',-30,-48,52,38); p(c,'#71945b',-19,-56,36,24); p(c,'#86a462',-14,-50,22,7); p(c,'#648951',-34,-22,26,13); c.restore(); }
  function drawItem(c, item, x, y, scale = 1, progress = 1, time = 0) {
    c.save(); c.translate(x,y); c.scale(scale,scale); c.imageSmoothingEnabled = false;
    const def = state?.catalog[item];
    if (def?.type === 'fish' || def?.type === 'caught') {
      c.translate(0, Math.sin(time / 700 + x) * 2); p(c,'#244f55',-16,1,31,9); p(c,def.color,-12,-5,24,13); p(c,def.color,12,-9,6,20); p(c,'#e27c53',-4,-6,7,4); p(c,'#283e36',-10,-2,3,3); p(c,'#fff4cf',-8,-4,9,2);
    } else if (item === 'flowers') {
      p(c,'#966a49',-20,5,40,12); p(c,'#5c763f',-17,-2,34,8); for(let i=-12;i<=12;i+=12){p(c,i===0?'#e8c45c':'#e89a91',i-4,-12,8,9);p(c,'#fae8a1',i-1,-9,3,3);}
    } else if (item === 'lantern') { p(c,'#6a5542',-3,-12,6,33);p(c,'#715d44',-10,-24,20,5);p(c,'#e5bb69',-7,-19,14,14);p(c,'#ffe4a3',-3,-17,6,10); }
    else if (item === 'bench') { p(c,'#74563e',-23,-15,46,7);p(c,'#b18857',-25,-17,50,5);p(c,'#b18857',-25,-3,50,8);p(c,'#74563e',-20,5,5,13);p(c,'#74563e',16,5,5,13); }
    else {
      const growth=.45+.55*Math.min(1,progress);c.scale(growth,growth);if(time&&!reducedMotion.matches)c.rotate(Math.sin(time/1200+x)*.035);
      p(c,'#426b3b',-2,-12,4,19);p(c,'#66974f',-13,-12,12,6);p(c,'#7ea55b',2,-17,12,7);
      if(progress>.25){p(c,'#3b703b',-14,-22,12,8);p(c,'#84aa58',0,-25,11,8);}
      if(progress>.65){const color=def?.color||'#eee8bf';if(item==='corn'){p(c,color,-7,-14,15,23);p(c,'#b38c3c',-3,-10,2,15);p(c,'#e9dc83',2,-11,2,17);}else if(item==='tomato'){p(c,color,-13,-9,13,12);p(c,color,3,-13,13,12);p(c,'#f29771',-11,-8,4,3);}else{p(c,color,-8,0,16,14);p(c,color,-4,14,8,5);p(c,'#e2b47c',-5,5,8,2);}}
    } c.restore();
  }
  function plotPos(i) { return { x:130+(i%4)*110, y:290+Math.floor(i/4)*90 }; }
  function fishPos(i) { return { x:720+(i%2)*110, y:290+Math.floor(i/2)*90 }; }
  const plotCenters=Array.from({length:12},(_,i)=>plotPos(i));
  const decorations = [{x:130,y:160},{x:830,y:150},{x:170,y:580},{x:820,y:580}];
  const staticMap = document.createElement('canvas'); staticMap.width=1000; staticMap.height=700;
  function makeMap() {
    const c=staticMap.getContext('2d');p(c,'#8ca762',0,0,1000,700);
    for(let i=0;i<1900;i++){const x=(i*137+Math.floor(i/17)*41)%1000,y=(i*83)%700;p(c,i%3?'#99af6c':'#7c9b58',x,y,3+(i%3),2);}
    p(c,'#b4b477',480,155,130,505);p(c,'#d0be8c',490,150,110,510);p(c,'#b4b477',60,520,850,40);p(c,'#d0be8c',60,528,850,25);
    for(let i=0;i<70;i++)p(c,'#c1ad7c',497+(i*17)%90,170+(i*43)%480,7,3);
    // Original little cottage with layered tiles, a window and doorstep.
    p(c,'#776749',367,197,296,20);p(c,'#d5bd87',390,91,250,112);p(c,'#ebd9a3',397,101,236,90);p(c,'#9b7250',380,185,271,14);
    p(c,'#795240',370,73,289,30);p(c,'#ad7353',385,51,258,28);p(c,'#bf8a62',400,34,228,24);
    for(let row=0;row<3;row++)for(let x=405-row*15;x<625+row*15;x+=26)p(c,'#8f614a',x,49+row*20,21,3);
    p(c,'#a7895c',494,130,48,65);p(c,'#5d6854',501,136,34,59);p(c,'#e3b867',527,164,4,4);p(c,'#ead6a5',478,198,75,9);
    for(const x of [421,572]){p(c,'#9b7f57',x,120,39,38);p(c,'#85a9a2',x+4,124,31,30);p(c,'#d7e8cc',x+7,128,9,9);p(c,'#d0b887',x+18,124,3,30);p(c,'#d0b887',x+4,138,31,3);}
    p(c,'#725541',610,21,17,38);p(c,'#987055',607,20,23,7);
    // Irrigation well and stepping stones.
    p(c,'#758785',600,300,44,20);p(c,'#bbcab4',595,292,54,11);p(c,'#47716c',602,289,40,6);p(c,'#896b47',597,255,5,43);p(c,'#896b47',641,255,5,43);p(c,'#b28c59',593,249,57,8);
    for(let i=0;i<5;i++)p(c,'#b7b99a',508+(i%2)*4,208+i*15,27,8);
    // Pond with a stone bank and reeds. Stocking slots sit within this shared water.
    p(c,'#6d8a59',658,231,246,286);p(c,'#b3b891',652,237,246,270);p(c,'#4f8585',663,247,225,253);p(c,'#639e9c',673,254,205,236);p(c,'#77b0a5',680,262,188,223);
    for(let i=0;i<14;i++){p(c,'#98c6b0',680+(i*37)%170,270+(i*53)%210,19,3);p(c,'#4b8154',657+(i%2)*237,255+i*17,4,17);}
    p(c,'#ad895d',641,511,272,10);for(let i=0;i<12;i++)p(c,'#7f6d4b',641+i*23,511,2,10);
    // Fence and leafy border frame the private map.
    for(let x=34;x<980;x+=40){if(x>450&&x<610)continue;p(c,'#b59a6a',x,642,5,30);p(c,'#dac396',x,645,39,5);p(c,'#b59a6a',x,660,39,4);}
    for(let y=80;y<630;y+=44)for(const x of [30,962]){p(c,'#b59a6a',x,y,5,44);p(c,'#d4ba89',x-3,y,11,5);}
    for(let i=0;i<12;i++){tree(c,55+i*80,42,.85+(i%3)*.1);if(i<6){tree(c,44,134+i*90,.75);tree(c,958,139+i*92,.8);}}
    p(c,'#775b41',410,584,6,42);p(c,'#b69a65',376,576,78,30);p(c,'#e2c68b',380,580,70,21);
    c.font='bold 12px system-ui';c.fillStyle='#4b5f40';c.textAlign='center';c.fillText('CAFÉ ↓',415,596);
  }
  function blocked(x,y){return x<75||x>930||y<220||y>625||(x>365&&x<665&&y<224)||(x>648&&x<906&&y>225&&y<522)||plotCenters.some(s=>Math.abs(x-s.x)<45&&Math.abs(y-s.y)<32);}
  function routeTo(x,y){
    const next=TeaFarmMotion.findPath(player,{x,y},blocked);
    if(next.length){path=next;destination={x,y,started:performance.now()};}
  }
  function badge(text,x,y,color='#fff3cc'){ctx.font='bold 11px system-ui';ctx.textAlign='center';const width=ctx.measureText(text).width+14;p(ctx,'#4c6746',x-width/2,y-12,width,20);p(ctx,color,x-width/2+1,y-11,width-2,17);ctx.fillStyle='#34543b';ctx.fillText(text,x,y+1);}
  function fishingPosition(at,start){return 1-Math.abs(((Math.max(0,at-start)/1000)%2)-1);}
  function syncFishingUi(){
    if(!fishingUi||panel!=='fishing')return;
    const {primary:button,status,meter,box,stop,stepNodes,controls}=fishingUi;
    const round=state?.farm.fishing,at=now(),active=round&&round.status!=='finished';
    let message=t('fishingHint'),label=t('castLine'),disabled=false;
    let phase=round?.status||'idle',step=0;
    const c=meter.getContext('2d');c.clearRect(0,0,260,28);
    if(round?.status==='waiting'){
      const bitten=at>=round.biteAt;
      message=t(at>round.expiresAt?'fishingEscaped':bitten?'fishingBite':'fishingWait');
      label=t(bitten?'hookFish':'fishingWait');disabled=!bitten||at>round.expiresAt;
      if(bitten){phase='bite';step=1;}
    }else if(round?.status==='reeling'){
      message=t(at>round.expiresAt?'fishingEscaped':'fishingReel');label=t('reelFish');disabled=at<round.reelAt||at>round.expiresAt;
      step=2;const pos=fishingPosition(at,round.reelAt);
      p(c,'#d2b98c',0,5,260,18);p(c,'#72a966',86,5,88,18);p(c,'#def1bc',88,7,84,3);p(c,'#345044',Math.round(pos*252),0,8,28);p(c,'#fff6d6',Math.round(pos*252)+2,2,4,7);
    }else if(round?.status==='finished'){
      message=round.reason==='caught'?`${t('fishingCaught')} ${name(round.caught)} · ${t('fishingValue')} ${state.catalog[round.caught].sell} ${t('gold')}`:t({early:'fishingEarly',missed:'fishingMissed',stopped:'fishingStopped',escaped:'fishingEscaped'}[round.reason]||'fishingEscaped');
      const remaining=Math.ceil((round.finishedAt+3000-at)/1000);if(remaining>0){label=`${t('fishingCooldown')} ${remaining}s`;disabled=true;}
    }
    if(round?.status!=='reeling'){
      if(round?.caught){drawItem(c,round.caught,130,14,.85,1);}
      else{p(c,'#d8e5d7',0,12,260,3);for(let i=0;i<5;i++){const x=reducedMotion.matches?i*55:(performance.now()/35+i*55)%260;p(c,'#8cb3a7',x,12,15,3);}p(c,phase==='bite'?'#d48d45':'#6c9991',126,4,8,10);p(c,'#fff8df',126,4,8,4);}
    }
    if(busy)label=locale==='vi'?'Đang xử lý…':'One moment…';
    if(box.dataset.phase!==phase)box.dataset.phase=phase;
    if(box.getAttribute('aria-busy')!==String(busy))box.setAttribute('aria-busy',String(busy));
    stop.disabled=!active||busy||Boolean(pending);controls.classList.toggle('has-line',Boolean(active));stop.hidden=!active;
    stepNodes.forEach((node,i)=>{node.classList.toggle('current',i===step);node.classList.toggle('done',i<step||round?.reason==='caught');});
    if(status.textContent!==message)status.textContent=message;if(button.textContent!==label)button.textContent=label;
    button.disabled=disabled||busy||Boolean(pending);button.dataset.phase=round?.status||'idle';
  }
  function drawPondWater(time){
    ctx.save();ctx.beginPath();ctx.rect(680,262,188,223);ctx.clip();
    for(let i=0;i<9;i++){
      const phase=reducedMotion.matches?.4:(time/3500+i*.17)%1,x=688+(i*47)%160,y=275+(i*53)%196;
      ctx.globalAlpha=.13+Math.sin(phase*Math.PI)*.23;p(ctx,'#e2efd0',x+phase*8,y,12+phase*12,2);
    }
    ctx.globalAlpha=1;p(ctx,'#5f9663',684,466,17,7);p(ctx,'#8ab476',686,463,13,5);p(ctx,'#e9b9aa',689,460,5,4);
    p(ctx,'#5f9663',847,272,15,7);p(ctx,'#91bb7a',849,270,11,4);ctx.restore();
  }
  function drawFishing(time){
    const round=state?.farm.fishing,active=round&&round.status!=='finished';
    // The jetty is a separate fishing spot; stocked fish are never consumed here.
    p(ctx,'#856747',746,506,85,45);p(ctx,'#c2a075',742,508,94,7);p(ctx,'#b38c60',742,521,94,7);p(ctx,'#b38c60',742,534,94,7);
    if(panel!=='fishing'&&!active){badge(t('fishing'),789,489);return;}
    const bite=active&&round.status==='waiting'&&now()>=round.biteAt&&now()<=round.expiresAt;
    const cast=active&&!reducedMotion.matches?Math.min(1,Math.max(0,(now()-round.castAt)/500)):1;
    const reeling=active&&round.status==='reeling',tug=reducedMotion.matches?0:reeling?Math.sin(time/180)*3:0;
    const floatX=763+32*cast,floatY=480-40*cast-Math.sin(cast*Math.PI)*32+(reducedMotion.matches?0:Math.sin(time/(bite?65:400))*(bite?6:2));
    const tipX=763-tug,tipY=480-(reeling?12:0);
    ctx.strokeStyle='#755238';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(789,526);ctx.lineTo(tipX,tipY);ctx.stroke();
    ctx.strokeStyle='#c4a36d';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(789,523);ctx.lineTo(tipX,tipY);ctx.stroke();
    if(active){
      ctx.strokeStyle='#ecdfb3';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(tipX,tipY);ctx.quadraticCurveTo(768,reeling?430:450,floatX,floatY);ctx.stroke();
      if(cast===1)for(let i=0;i<2;i++){const ripple=reducedMotion.matches?.5:(time/1100+i*.5)%1;ctx.globalAlpha=(1-ripple)*.55;ctx.strokeStyle='#e2f0d8';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(floatX,449,9+ripple*22,3+ripple*7,0,0,Math.PI*2);ctx.stroke();}ctx.globalAlpha=1;
      p(ctx,'#fff5cd',floatX-3,floatY-5,7,6);p(ctx,bite?'#f09144':'#c65745',floatX-3,floatY+1,7,6);
      if(bite)badge('!',floatX,floatY-21,'#ffe28e');
    }
  }
  function drawCareEffect(time) {
    if (!careEffect) return;
    const elapsed = time - careEffect.started;
    if (elapsed > 1600) { careEffect = null; delete canvas.dataset.careEffect; return; }
    const { type, item, x, y } = careEffect, progress = reducedMotion.matches ? .5 : elapsed / 1600;
    ctx.save(); ctx.translate(x,y); ctx.globalAlpha = reducedMotion.matches ? 1 : Math.min(1,(1600-elapsed)/300);
    if (type === 'water') {
      // Small watering can and individual droplets, above the selected patch.
      p(ctx,'#527d83',-38,-49,23,17);p(ctx,'#8ac2bf',-36,-48,19,12);p(ctx,'#486d74',-43,-45,7,10);p(ctx,'#7ca9a7',-17,-43,15,5);p(ctx,'#8ac2bf',-5,-40,7,8);
      for(let i=0;i<9;i++){const fall=(progress*2.4+i*.13)%1;p(ctx,i%2?'#b9e4e2':'#74bed2',-3+i*4,-28+fall*48,3,5);}
      p(ctx,'#54775c',-24,22,50,3);
    } else if (type === 'feed' || type === 'stock') {
      for(let i=0;i<7;i++){const fall=(progress+i*.12)%1;p(ctx,type==='feed'?'#e7c47a':'#c2e7da',-22+i*7,-37+fall*40,4,4);}
      ctx.strokeStyle='#d4eee0';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(0,12,12+progress*25,4+progress*8,0,0,Math.PI*2);ctx.stroke();
    } else if (type === 'plant') {
      for(let i=0;i<6;i++){const spread=i*1.05;p(ctx,'#efcf8c',Math.cos(spread)*progress*24,-24+progress*32+Math.sin(spread)*9,4,4);}
    } else if(careEffect.rod) {
      const flight=Math.min(1,progress*1.5),fishX=-15*flight,fishY=100*flight-Math.sin(flight*Math.PI)*90;
      if(item)drawItem(ctx,item,fishX,fishY,1.7,1);
      badge('+1',fishX+24,fishY-25,'#fff0ac');
      for(let i=0;i<6;i++){const angle=i*Math.PI/3;p(ctx,'#d8efdc',Math.cos(angle)*(10+progress*27),Math.sin(angle)*(4+progress*14),3,3);}
    } else {
      const lift = reducedMotion.matches ? 25 : Math.sin(progress*Math.PI)*45;
      if(item)drawItem(ctx,item,0,-lift,1.7,1);
      badge('+1',23,-lift-25,'#fff0ac');
      for(let i=0;i<5;i++){const angle=i*Math.PI*.4;p(ctx,'#f4db7e',Math.cos(angle)*(15+progress*26),-lift+Math.sin(angle)*(15+progress*20),4,4);}
    }
    ctx.restore();
  }
  function frame(time){
    const dt=Math.min(.04,(time-frameAt)/1000);frameAt=time;walk=false;
    if(!portrait()&&!document.querySelector('dialog[open]')){
      let dx=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0),dy=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0);
      let travelled=0;
      if(dx||dy){path=[];destination=null;cameraFocus=null;const len=Math.hypot(dx,dy),oldX=player.x,oldY=player.y,nx=player.x+dx/len*145*dt,ny=player.y+dy/len*145*dt;
        if(TeaFarmMotion.clear(player,{x:nx,y:player.y},blocked))player.x=nx;
        if(TeaFarmMotion.clear(player,{x:player.x,y:ny},blocked))player.y=ny;
        travelled=Math.hypot(player.x-oldX,player.y-oldY);
      }else if(path.length){const moved=TeaFarmMotion.follow(player,path,145*dt,blocked);travelled=moved.travelled;dx=moved.dx;dy=moved.dy;}
      walk=travelled>.001;stride+=travelled;if(walk)facing=Math.abs(dx)>Math.abs(dy)?dx>0?'right':'left':dy>0?'down':'up';
    }
    const rect=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2),width=Math.round(rect.width*dpr),height=Math.round(rect.height*dpr);
    const resized=canvas.width!==width||canvas.height!==height;
    if(resized){canvas.width=width;canvas.height=height;}
    const scale=Math.max(.72,Math.min(rect.width/1000,rect.height/700));camera.scale=scale;
    const visibleWidth=rect.width/scale,visibleHeight=rect.height/scale;
    const focus = cameraFocus || player;
    const targetX=visibleWidth>=1000?(1000-visibleWidth)/2:Math.max(0,Math.min(1000-visibleWidth,focus.x-visibleWidth/2));
    const targetY=visibleHeight>=700?(700-visibleHeight)/2:Math.max(0,Math.min(700-visibleHeight,focus.y-visibleHeight/2));
    const ease=!cameraReady||resized||reducedMotion.matches?1:1-Math.exp(-10*dt);
    camera.x+=(targetX-camera.x)*ease;camera.y+=(targetY-camera.y)*ease;cameraReady=true;
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,rect.width,rect.height);ctx.scale(scale,scale);ctx.translate(-camera.x,-camera.y);ctx.imageSmoothingEnabled=false;ctx.drawImage(staticMap,0,0);
    const f=state?.farm;
    drawPondWater(time);
    if(destination&&path.length){const pulse=reducedMotion.matches?0:Math.sin(time/220)*2;ctx.strokeStyle='#f1e3aa';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(destination.x,destination.y+8,10+pulse,4+pulse*.3,0,0,Math.PI*2);ctx.stroke();}
    for(let i=0;i<12;i++){const pos=plotPos(i),unlocked=i<(f?.plots.length||6),row=f?.plots[i],wet=row?.readyAt!=null;p(ctx,unlocked?'#9e784e':'#89975c',pos.x-45,pos.y-32,90,62);p(ctx,unlocked?wet?'#876746':'#b28b58':'#829454',pos.x-41,pos.y-28,82,54);for(let j=0;j<4;j++)p(ctx,unlocked?wet?'#70573c':'#9f794f':'#788d51',pos.x-35,pos.y-19+j*12,70,3);
      if(panel==='garden'&&selected===i){ctx.strokeStyle='#fff0af';ctx.lineWidth=3;ctx.strokeRect(pos.x-46,pos.y-33,92,64);}
      if(row){const progress=row.readyAt===null?.1:Math.min(1,1-(row.readyAt-now())/(state.catalog[row.item].seconds*1000));for(const dx of [-22,20])drawItem(ctx,row.item,pos.x+dx,pos.y+3,1.1,progress,time);if((panel==='garden'&&selected===i)||row.readyAt===null||row.readyAt<=now())badge(row.readyAt===null?t('water'):remaining(row),pos.x,pos.y-36,row.readyAt!==null&&row.readyAt<=now()?'#ffe5a0':'#ecf0ce');}
      else if(panel==='garden'||!unlocked)badge(unlocked?String(i+1):'+',pos.x,pos.y,unlocked?'#d5be8b':'#a9b57c');
    }
    for(let i=0;i<(f?.ponds.length||2);i++){const pos=fishPos(i),row=f?.ponds[i];if(row){const phase=reducedMotion.matches?i:time/1800+i,swim=Math.sin(phase)*19;
      ctx.save();ctx.translate(pos.x+swim,pos.y+Math.sin(phase*.7)*5);ctx.scale(Math.cos(phase)>0?-1:1,1);drawItem(ctx,row.item,0,0,1.25,1,reducedMotion.matches?0:time);ctx.restore();
      if((panel==='pond'&&selected===i)||row.readyAt===null||row.readyAt<=now())badge(row.readyAt===null?t('feed'):remaining(row),pos.x,pos.y-28);
    }else if(panel==='pond')badge(`${i+1} +`,pos.x,pos.y,'#b9d8bd');if(panel==='pond'&&selected===i){ctx.strokeStyle='#fff0af';ctx.lineWidth=2;ctx.strokeRect(pos.x-42,pos.y-40,84,72);}}
    f?.placed.forEach((item,i)=>{if(item)drawItem(ctx,item,decorations[i].x,decorations[i].y,1.6);});
    drawFishing(time);
    const fishingPose=!walk&&f?.fishing&&f.fishing.status!=='finished';
    TeaFarmAvatar(ctx,player.x,player.y,profile||{hair:1,clothes:2,shoes:0},fishingPose?'up':facing,stride,walk,reducedMotion.matches,Boolean(careEffect));
    if(walk&&!reducedMotion.matches&&stride%25<10){p(ctx,'#d3c797',player.x-6,player.y+15,3,2);p(ctx,'#d3c797',player.x+7,player.y+17,3,2);}
    drawCareEffect(time);
    syncFishingUi();
    $('#harvest-fx').classList.toggle('show',time<effectUntil);
    document.querySelectorAll('[data-ready-at]').forEach(node=>{const at=Number(node.dataset.readyAt);if(node.tagName==='BUTTON')node.disabled=at>now()||busy||Boolean(pending);else{const text=remaining({readyAt:at});if(node.textContent!==text)node.textContent=text;}});
    requestAnimationFrame(frame);
  }
  canvas.addEventListener('pointerdown',event=>{
    if(!state||portrait())return;event.preventDefault();canvas.focus();const r=canvas.getBoundingClientRect(),x=(event.clientX-r.left)/camera.scale+camera.x,y=(event.clientY-r.top)/camera.scale+camera.y;
    if(x>=738&&x<=840&&y>=468&&y<=557){openPanel('fishing');return;}
    for(let i=0;i<state.farm.plots.length;i++){const pos=plotPos(i);if(Math.abs(x-pos.x)<48&&Math.abs(y-pos.y)<36){openPanel('garden',i);routeTo(pos.x,pos.y+44);return;}}
    for(let i=0;i<state.farm.ponds.length;i++){const pos=fishPos(i);if(Math.abs(x-pos.x)<52&&Math.abs(y-pos.y)<42){openPanel('pond',i);routeTo(620,pos.y);return;}}
    if(x>370&&x<460&&y>570){location.assign('/tra-da');return;}cameraFocus=null;routeTo(x,y);
  });
  canvas.addEventListener('contextmenu',event=>event.preventDefault());
  window.addEventListener('keydown',e=>{if(e.target.closest('input,textarea,select,dialog')||portrait())return;const key=e.key.toLowerCase();if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(key)){e.preventDefault();keys.add(key);}});
  window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>{keys.clear();path=[];});window.addEventListener('resize',()=>{keys.clear();path=[];});document.addEventListener('visibilitychange',()=>{keys.clear();if(!document.hidden)refresh();});
  document.querySelectorAll('[data-panel]').forEach(b=>b.onclick=()=>openPanel(panel===b.dataset.panel?'':b.dataset.panel));$('#close-panel').onclick=()=>openPanel('');
  $('#fishing-switch').onclick=()=>openPanel(panel==='fishing'?'pond':'fishing');
  $('#lang').onclick=()=>{locale=locale==='en'?'vi':'en';applyLocale();notice(pending?'uncertain':'welcome',Boolean(pending));};
  function showWallet(){keys.clear();$('#wallet-code').value=token||'';$('#wallet-dialog').showModal();}
  $('#wallet').onclick=showWallet;$('#portrait-wallet').onclick=showWallet;$('#close-wallet').onclick=()=>$('#wallet-dialog').close();
  $('#copy').onclick=async()=>{try{await navigator.clipboard.writeText(token||'');$('#wallet-message').textContent=t('copied');}catch{$('#wallet-code').select();}};
  $('#restore').onclick=async()=>{
    if(busy||pending){$('#wallet-message').textContent=t('pendingSwitch');return;}const value=$('#restore-code').value.trim();
    if(token&&!confirm(t('confirmRestore')+' '+t('restoreFirst')))return;
    try{await api('/api/game/wallet',{headers:{'X-Wallet-Token':value}});localStorage.setItem(WALLET,value);location.reload();}catch(error){$('#wallet-message').textContent=t(error.status===401?'invalidWallet':'offline');}
  };
  $('#retry').onclick=()=>pending?act():entered?refresh():boot();window.addEventListener('online',refresh);window.addEventListener('offline',()=>notice('offline',true));
  window.addEventListener('storage',event=>{
    if(event.key===WALLET || (event.key===null&&localStorage.getItem(WALLET)!==token)){keys.clear();location.reload();}
    else if((event.key===null||outbox.matches(event.key))&&!busy){
      loadPending();renderPanel();if(pending)notice('uncertain',true);else refresh();
    }
  });
  async function boot(){
    if(busy)return;if(!token){notice('needWallet',true);openPanel('garden');return;}
    busy=true;
    try{const data=await api('/api/tea/profile');profile=data.profile;if(!profile){notice('newProfile',true);return;}accept(await api('/api/tea/farm/enter',{method:'POST',body:'{}'}));entered=true;loadPending();applyLocale();notice(pending?'uncertain':'welcome',Boolean(pending));if(state.farm.version===1){openPanel('garden');el('p',t('intro'),'intro',$('#panel-content'));}}
    catch(error){notice(error.status===401?'invalidWallet':'offline',true);}finally{busy=false;renderPanel();}
  }
  // Only the public shell is cached by the shared worker. No offline action queue.
  if('serviceWorker'in navigator){navigator.serviceWorker.register('/tra-da-sw.js',{scope:'/tra-da'}).then(reg=>{const watch=()=>{if(reg.waiting&&navigator.serviceWorker.controller){waitingWorker=reg.waiting;$('#update').hidden=false;}};watch();reg.addEventListener('updatefound',()=>reg.installing?.addEventListener('statechange',watch));}).catch(()=>{});navigator.serviceWorker.addEventListener('controllerchange',()=>{if(updateRequested&&!busy&&!pending)location.reload();});}
  $('#update').onclick=()=>{if(!busy&&!pending&&waitingWorker){updateRequested=true;waitingWorker.postMessage({type:'SKIP_WAITING'});}};
  let lastPoll=0;
  makeMap();applyLocale();requestAnimationFrame(frame);boot();setInterval(()=>{const active=state?.farm.fishing&&state.farm.fishing.status!=='finished';if(active||Date.now()-lastPoll>=10000){lastPoll=Date.now();refresh();}},2000);
})();

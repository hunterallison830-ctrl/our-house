import {store, normalize, rememberedHouse} from './storage.js';
import {startSharing, sharingStatus} from './sync.js';
import {today, shiftDay, dateWords, greeting, occurs, timeRank, timeWords, repeatWords, itemId, compressPhoto} from './domain.js';
const app = document.querySelector('#app');
const icons = {
  house:'<path d="m4 14 12-10 12 10M7 12v16h18V12M13 28V18h6v10"/>',
  key:'<circle cx="11" cy="12" r="7"/><path d="m16 17 12 12m-4-4 4-4m-8 0 4-4"/>',
  calendar:'<rect x="5" y="7" width="23" height="23" rx="3"/><path d="M10 3v8M23 3v8M5 15h23m-17 6h3m5 0h3m-11 5h3"/>',
  arrow:'<path d="M6 16h20m-8-8 8 8-8 8"/>',
  back:'<path d="M26 16H6m8-8-8 8 8 8"/>',
  sun:'<path d="M5 24h22M9 21a7 7 0 0 1 14 0M16 4v5M4 11l4 4m16 0 4-4M3 18h3m20 0h3"/>',
  check:'<path d="m6 17 7 7 14-16"/>',
  mic:'<rect x="12" y="3" width="8" height="17" rx="4"/><path d="M7 14v3a9 9 0 0 0 18 0v-3M16 26v4m-6 0h12"/>',
  camera:'<path d="M4 11h6l3-5h7l3 5h5v18H4Z"/><circle cx="16" cy="20" r="6"/>'
};
const svg = (name, size=32) => `<svg width="${size}" height="${size}" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]||icons.house}</svg>`;
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let screen='welcome', detailId='', viewDate=today(), search='', flow=null, error='', busy=false, newNumber='', joinNumber='', switching=false;
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition;
const itemNames=['Keys','Glasses','Remote','Wallet','Hearing aids','Medicine bottle','Mail','Other'];
const locations=['Kitchen','Living room','Bedroom','Bathroom','By the front door','In the car','In a drawer','On the nightstand','In a purse or bag','Other'];
const plans=['Doctor visit','Pick up medicine','Call family','Church','Birthday','Other'];
function announce(text) { const node=document.querySelector('#announcement'); node.textContent=''; setTimeout(()=>node.textContent=text,30); }
function navigate(next, id='', history=true) {
  if (recognition) recognition.abort();
  error=''; screen=next; detailId=id;
  if (history) window.history.pushState({screen:next,id,...(['wizard','saved','remove'].includes(next)?{flow}:{} )},'',`#${next}${id?'/'+encodeURIComponent(id):''}`);
  render(); window.scrollTo(0,0);
}
window.addEventListener('popstate', event => {
  error='';
  if (event.state?.screen && (store.house || ['welcome','join','create'].includes(event.state.screen))) {
    screen=event.state.screen;detailId=event.state.id||'';
    if (event.state.flow) flow=event.state.flow;
    if (['wizard','saved'].includes(screen) && !['item','plan'].includes(flow?.kind)) screen=store.house?'home':'welcome';
    if (screen==='remove' && !flow?.removeType) screen=store.house?'home':'welcome';
  } else screen=store.house?'home':'welcome';
  render();
});
function back() {
  if (screen==='wizard' && flow.step>0) {flow.step--;error='';render();window.scrollTo(0,0);return;}
  const parent={where:'home',plan:'home',help:'home',item:'where',event:'plan',wizard:flow?.kind==='item'?'where':'plan',saved:flow?.kind==='item'?'where':'plan',remove:flow?.removeType==='items'?'item':'event',switch:'help',join:'welcome',create:'welcome'}[screen];
  if (screen==='welcome' && switching) {switching=false;navigate('help');return;}
  navigate(parent|| (store.house?'home':'welcome'), screen==='remove'?flow.removeId:'');
}
function header() {
  const showBack = !(screen==='home' || (screen==='welcome' && !switching));
  return `<header class="topbar"><div class="brand">${svg('house',30)}<span>OUR HOUSE</span></div>${showBack?`<button type="button" class="back" data-action="back">${svg('back',22)}Back</button>`:''}</header>`;
}
function button(text, action, style='') { return `<button type="button" class="button ${style}" data-action="${action}" ${busy?'disabled':''}>${text}</button>`; }
function dock(text,action) { return `<footer class="dock">${button(text,action)}</footer>`; }
function stepHeader(title, count) {
  return `<p class="step">Step ${flow.step+1} of ${count}</p><h1 tabindex="-1">${title}</h1><div class="step-track" aria-hidden="true">${Array.from({length:count},(_,i)=>`<span class="${i<=flow.step?'active':''}"></span>`).join('')}</div>`;
}
function chips(values, field, current) { return `<div class="chips">${values.map(value=>`<button type="button" class="chip ${normalize(value)===normalize(current||'')?'selected':''}" data-choice="${esc(value)}" data-field="${field}" aria-pressed="${normalize(value)===normalize(current||'')}">${esc(value)}</button>`).join('')}</div>`; }
function speak(field) { return Recognition ? `<button type="button" class="speak" data-speak="${field}" aria-pressed="false">${svg('mic',26)}Speak</button><p id="speech-hint" class="hint" role="status"></p>`:''; }
function textQuestion(values, field, label, placeholder) {
  return `${chips(values,field,flow[field])}<label class="label" for="${field}">${label}</label><input class="input" id="${field}" data-bind="${field}" value="${esc(flow[field])}" placeholder="${placeholder}" maxlength="120" autocomplete="off">${speak(field)}`;
}
function todayEvents(date=viewDate) { return store.list('events').filter(event=>occurs(event,date)).sort((a,b)=>timeRank(a)-timeRank(b)||a.title.localeCompare(b.title)); }
function home() {
  const count=todayEvents(today()).length;
  return `<main><section class="home-hero"><p class="greeting">${svg('sun',30)}${greeting()}</p><h1>Grandma and Grandpa</h1><p class="date">${dateWords(today())}</p></section>
  <button class="home-card" data-action="where"><div class="card-top"><span class="icon-badge">${svg('key',36)}</span>${svg('arrow',30)}</div><h2>Where is it?</h2><p>Find keys, glasses,<br>and other things</p></button>
  <button class="home-card plan-card" data-action="plan"><div class="card-top"><span class="icon-badge">${svg('calendar',36)}</span>${svg('arrow',30)}</div><h2>Today's plan</h2><p>${new Intl.DateTimeFormat('en-US',{timeZone:'UTC',weekday:'long'}).format(new Date(today()+'T12:00Z'))} · ${count?`${count} ${count===1?'thing':'things'} today`:'Nothing planned yet'}</p></button>
  <footer class="home-footer"><button class="help-button" data-action="help">Help &amp; house number</button></footer></main>`;
}
function results() {
  const list=store.list('items').filter(item=>normalize(item.name+' '+item.location).includes(normalize(search))).sort((a,b)=>a.name.localeCompare(b.name));
  if (!list.length) return `<section class="empty">${svg('key',38)}<h2>${search?'Nothing found yet':'A place for your things'}</h2><p>${search?'Try another word, or save where you put it.':'Tap “I put something away” below. Add a thing and where you put it.'}</p></section>`;
  return list.map(item=>`<button class="result" data-open-item="${esc(item.id)}"><span class="result-name">${esc(item.name)}${svg('arrow',25)}</span><span class="result-location">${esc(item.location)}</span></button>`).join('');
}
function where() {return `<main class="with-dock"><p class="eyebrow">A place for everything</p><h1>Where did I put it?</h1><div class="search-wrap"><label for="search">What are you looking for?</label><input id="search" class="input" type="search" value="${esc(search)}" placeholder="Try keys or kitchen" autocomplete="off">${speak('search')}</div><div id="results" aria-live="polite">${results()}</div></main>${dock('I put something away','add-item')}`;}
function itemDetail() {
  const item=store.data.items[detailId];
  if(!item||item.deleted)return `<main><h1>This is no longer on the list.</h1>${button('Back to your things','where')}</main>`;
  return `<main><p class="eyebrow">Here’s where it is</p><h1 class="text-break">${esc(item.name)}</h1><div class="location-box"><p>You put it here:</p><p class="location">${esc(item.location)}</p></div>${item.photo?`<img class="photo" src="${esc(item.photo)}" alt="A picture showing where ${esc(item.name)} is">`:''}<div class="stack">${button('I moved it','move-item')}${button('This is not here anymore','remove-item','danger')}</div></main>`;
}
function planner() {
  const events=todayEvents();
  return `<main class="with-dock"><p class="eyebrow">${viewDate===today()?"Today’s plan":"Your plan"}</p><h1>${dateWords(viewDate)}</h1><div class="day-nav">${button('Yesterday','yesterday','secondary')}${button('Tomorrow','tomorrow','secondary')}</div>${viewDate!==today()?`<div class="jump">${button('Jump to today','jump-today','soft')}</div>`:''}
  ${events.length?events.map(event=>{
    const done=!!store.data.completions[`${event.id}_${viewDate}`]?.done;
    return `<article class="plan-row ${done?'done':''}"><button class="event-open" data-open-event="${esc(event.id)}" aria-label="${esc(event.title)}, ${timeWords(event)}. View details."><p class="event-time">${timeWords(event)}</p><h2>${esc(event.title)}</h2></button><button class="done-button" data-done="${esc(event.id)}" aria-pressed="${done}">${done?'✓ Done — mark as not done':'Mark as done'}</button></article>`;
  }).join(''):`<section class="empty">${svg('calendar',40)}<h2>A little room in your day</h2><p>Nothing planned ${viewDate===today()?'for today':'for this day'} yet. Tap “Add to the plan” to remember an appointment or something to do.</p></section>`}</main>${dock('Add to the plan','add-plan')}`;
}
function eventDetail() {
  const event=store.data.events[detailId];
  if(!event||event.deleted)return `<main><h1>This is no longer in the plan.</h1>${button('Back to the plan','plan')}</main>`;
  return `<main><p class="eyebrow">In your plan</p><h1 class="text-break">${esc(event.title)}</h1><div class="review"><p>${dateWords(viewDate,true)}</p><h2>${timeWords(event)}</h2><p>${repeatWords(event)}</p></div>${event.repeat!=='once'?'<p class="intro">Changes here apply to every day of this repeating plan.</p>':''}<div class="stack">${button('Change this plan','edit-plan')}${button('Remove from the plan','remove-plan','danger')}</div></main>`;
}
function wizard() {
  let content='', action='next', actionText='Continue';
  if(flow.kind==='item') {
    const count=flow.edit?1:3;
    if(flow.edit||flow.step===1) {
      content=stepHeader(`Where did you put ${flow.edit?esc(flow.name.toLowerCase()):'it'}?`,count)+textQuestion(locations,'location','Or tell us the place','For example, kitchen drawer');
      if(flow.edit) {action='save-item';actionText='Save the new place';}
    } else if(flow.step===0) {
      content=stepHeader('What did you put away?',count)+textQuestion(itemNames,'name','Or name the thing','For example, reading glasses');
    } else {
      content=stepHeader('Want to take a picture?',count)+'<p class="intro">A picture can help you find it later. This is your choice.</p>'+
      `<input type="file" id="photo-camera" class="file-input" accept="image/*" capture="environment"><label for="photo-camera" class="button secondary photo-label">${svg('camera',30)}Take a picture</label><p id="photo-status" class="hint" role="status"></p>`+
      (flow.photo?`<img class="photo" src="${esc(flow.photo)}" alt="The picture you chose">`:'')+
      `<div style="margin-top:18px">${button(flow.photo?'Save with this picture':'Skip the picture','save-item',flow.photo?'':'secondary')}</div>`;
      return `<main>${content}${error?`<p class="error" role="alert">${esc(error)}</p>`:''}</main>`;
    }
  } else {
    if(flow.step===0) content=stepHeader("What's the plan?",4)+textQuestion(plans,'title','Or write your plan','For example, lunch with family');
    if(flow.step===1) content=stepHeader('Which day?',4)+`<div class="time-choices">${[['Today',today()],['Tomorrow',shiftDay(today(),1)]].map(([label,date])=>`<button class="chip ${flow.date===date?'selected':''}" data-date="${date}">${label}<br>${dateWords(date)}</button>`).join('')}</div><label class="label" for="date">Or choose a date</label><input class="input" id="date" type="date" data-bind="date" value="${esc(flow.date)}" min="1900-01-01" max="2100-12-31">`;
    if(flow.step===2) content=stepHeader('What time?',4)+`<div class="time-choices">${[['all','All day'],['morning','Morning'],['afternoon','Afternoon'],['evening','Evening'],['specific','A specific time']].map(([value,label])=>`<button class="chip ${flow.timeType===value?'selected':''}" data-time="${value}" aria-pressed="${flow.timeType===value}">${label}</button>`).join('')}</div>${flow.timeType==='specific'?`<label class="label" for="time">Choose the time</label><input class="input" id="time" data-bind="time" type="time" value="${esc(flow.time)}">`:''}`;
    if(flow.step===3) {content=stepHeader('Does this happen again?',4)+`<div class="time-choices">${[['once','Just once'],['daily','Every day'],['weekly','Every week']].map(([value,label])=>`<button class="chip ${flow.repeat===value?'selected':''}" data-repeat="${value}" aria-pressed="${flow.repeat===value}">${label}</button>`).join('')}</div><div class="review"><h2>${esc(flow.title)}</h2><p>${dateWords(flow.date)}</p><p>${timeWords(flow)} · ${repeatWords(flow)}</p></div>`;action='save-plan';actionText='Save to the plan';}
  }
  return `<main class="with-dock">${content}${error?`<p class="error" role="alert">${esc(error)}</p>`:''}</main>${dock(actionText,action)}`;
}
function saved() {
  return `<main><div class="success-icon">${svg('check',54)}</div><p class="eyebrow">One less thing to remember</p><h1>Saved.</h1><p class="success-copy text-break">${flow.kind==='item'?`Your ${esc(flow.name.toLowerCase())} ${/^(keys|glasses|hearing aids)$/i.test(flow.name)?'are':'is'} ${/^(in |on |by |under |at |behind |beside |near )/i.test(flow.location)?'':'in the '}${esc(flow.location.charAt(0).toLowerCase()+flow.location.slice(1))}.`:`${esc(flow.title)} is in your plan for ${dateWords(flow.date)}.`}</p><p class="intro">${sharingStatus().mode==='local'?'It’s saved on this phone.':'It’s saved. Both phones will catch up when they are online.'}</p>${button('Done','done')}</main>`;
}
function welcome() {return `<main><div class="welcome-icon">${svg('house',62)}</div><p class="eyebrow">A little help, every day</p><h1>Welcome to<br>Our House</h1><p class="intro">Remember where things are.<br>Make a simple plan for your day.</p><div class="stack">${button('Create our house','create')}${button('I already have a house number','join','secondary')}</div><p class="hint">Setting up the second phone?<br>Use the same house number.</p></main>`;}
function create() {return `<main><p class="eyebrow">Your shared place</p><h1>This is your<br>house number</h1><p class="number" aria-label="House number ${newNumber.split('').join(' ')}">${newNumber}</p><p class="intro">Write this number down. Type the same number on the other phone.</p>${button('Continue','create-continue')}<p class="hint">Keep this number between the people who use your house.</p></main>`;}
function join() {return `<main class="with-dock"><h1>What is your house number?</h1><p class="intro">Type the 6 numbers from the other phone.</p><label class="sr-only" for="house-number">6-digit house number</label><input id="house-number" class="input number-entry" inputmode="numeric" pattern="[0-9]*" maxlength="6" value="${joinNumber}" autocomplete="off"><div class="keypad">${[1,2,3,4,5,6,7,8,9,0].map(n=>`<button data-digit="${n}">${n}</button>`).join('')}<button class="erase" data-action="erase-number">Erase</button></div>${error?`<p class="error" role="alert">${esc(error)}</p>`:''}</main>${dock('Open our house','join-continue')}`;}
function help() { return `<main><h1>A little help</h1><p class="intro">When you open a list or add something, use the Back button at the top to return.</p><section class="help-section"><h2>Your house number</h2><p class="number">${store.house}</p><p>Type this same number on the other phone once.</p><p id="sharing-status" class="notice">${esc(sharingStatus().message)}</p><p>When sharing is set up, both phones show the same things and plans. Without an internet connection, you can still use this phone.</p></section><section class="help-section"><h2>Put Our House on your iPhone</h2><ol><li>Open this page in <strong>Safari</strong>.</li><li>Tap <strong>Share</strong> (the square with an arrow).</li><li>Tap <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</li></ol><p>On Android, open the browser’s menu and choose “Add to Home screen” or “Install app.”</p></section><section class="help-section"><h2>Good to know</h2><p>Your plan is a list to look at. It does not ring your phone or send reminders to the lock screen.</p><p>Days follow New York time.</p><p>Keep your house number private. Anyone with it may be able to open your lists. Please do not save passwords or private medical details here.</p></section><section class="help-section"><h2>Another house?</h2>${button('Use a different house number','switch','secondary')}</section></main>`; }
function removeScreen() {
  const record=store.data[flow.removeType][flow.removeId];
  return `<main><h1>${flow.removeType==='items'?`Remove ${esc(record?.name?.toLowerCase()||'this thing')} from the list?`:`Remove “${esc(record?.title||'this plan')}”?`}</h1><p class="intro">${flow.removeType==='items'?'This removes the saved place, not the thing itself.':record?.repeat!=='once'?'This will remove this plan and all its repeating days.':'This will remove it from your plan.'}</p><div class="stack">${button('No, keep it','cancel-remove')}${button('Yes, remove it','confirm-remove','danger')}</div>${error?`<p class="error" role="alert">${esc(error)}</p>`:''}</main>`;
}
function render() {
  const pages={home,where,item:itemDetail,plan:planner,event:eventDetail,wizard,saved,welcome,create,join,help,remove:removeScreen,switch:()=>`<main><h1>Use another house?</h1><p class="intro">This phone will show the other house’s lists and plans. Your current house’s information will stay saved.</p><p class="intro">Write down your current number first: <strong>${store.house}</strong></p><div class="stack">${button('Keep this house','help')}${button('Use a different house','switch-confirm','secondary')}</div></main>`};
  app.innerHTML=header()+(error&&!['wizard','remove','join'].includes(screen)?`<div class="error" role="alert" style="margin:16px 22px">${esc(error)}</div>`:'')+(pages[screen]||home)();
  document.title=`${({home:'Grandma and Grandpa',where:'Where is it?',plan:"Today's plan",wizard:flow?.kind==='item'?'Save a thing':'Add to the plan',help:'Help'}[screen]||'Welcome')} — Our House`;
}
function nextStep() {
  if(flow.kind==='item') {
    const field=flow.step===0?'name':'location';
    if(!flow[field].trim())return showError(field==='name'?'Choose a thing or type its name.':'Choose a place or tell us where it is.');
  } else {
    if(flow.step===0&&!flow.title.trim())return showError('Choose a plan or write your own.');
    if(flow.step===1&&!/^\d{4}-\d{2}-\d{2}$/.test(flow.date))return showError('Please choose a day.');
    if(flow.step===2&&flow.timeType==='specific'&&!/^\d{2}:\d{2}$/.test(flow.time))return showError('Please choose a time, or tap All day.');
  }
  flow.step++;error='';render();window.scrollTo(0,0);
}
function showError(message) {error=message;announce(message);render();requestAnimationFrame(()=>document.querySelector('[role="alert"]')?.scrollIntoView({block:'center'}));}
async function saveItem() {
  if(!flow.location.trim())return showError('Choose a place or tell us where it is.');
  const id=flow.id||await itemId(flow.name);
  const previous=store.data.items[id];
  await store.put('items',{id,name:flow.name.trim(),location:flow.location.trim(),photo:flow.photo||previous?.photo||'',deleted:false});
  announce('Saved.');navigate('saved');
}
async function savePlan() {
  const id=flow.id||crypto.randomUUID();
  await store.put('events',{id,title:flow.title.trim(),date:flow.date,timeType:flow.timeType,time:flow.time||'',repeat:flow.repeat,deleted:false});
  viewDate=flow.date;announce('Saved to your plan.');navigate('saved');
}
function newHouseNumber() { let code; do{ const n=new Uint32Array(1);crypto.getRandomValues(n);code=String(100000+n[0]%900000); }while(['123456','654321','111111','222222','333333','444444','555555','666666','777777','888888','999999'].includes(code));return code; }
async function openHouse(number) { await store.open(number);switching=false;flow=null;startSharing();navigate('home'); }
const actions={
  back, home:()=>navigate('home'),where:()=>navigate('where'),plan:()=>{viewDate=today();navigate('plan');},help:()=>navigate('help'),
  create:()=>{newNumber=newHouseNumber();navigate('create');},join:()=>{joinNumber='';navigate('join');},
  'create-continue':()=>openHouse(newNumber),
  'join-continue':()=>/^\d{6}$/.test(joinNumber)&&!['000000','123456'].includes(joinNumber)?openHouse(joinNumber):showError('Please type your 6-digit house number.'),
  'erase-number':()=>{joinNumber=joinNumber.slice(0,-1);document.querySelector('#house-number').value=joinNumber;},
  'add-item':()=>{flow={kind:'item',step:0,name:'',location:'',photo:''};navigate('wizard');},
  'move-item':()=>{const item=store.data.items[detailId];flow={...item,kind:'item',step:0,edit:true};navigate('wizard');},
  'add-plan':()=>{flow={kind:'plan',step:0,title:'',date:viewDate,timeType:'all',time:'',repeat:'once'};navigate('wizard');},
  'edit-plan':()=>{flow={...store.data.events[detailId],kind:'plan',step:0};navigate('wizard');},
  next:nextStep,'save-item':saveItem,'save-plan':savePlan,
  done:()=>navigate(flow.kind==='item'?'where':'plan'),
  yesterday:()=>{viewDate=shiftDay(viewDate,-1);render();},tomorrow:()=>{viewDate=shiftDay(viewDate,1);render();},'jump-today':()=>{viewDate=today();render();},
  'remove-item':()=>{flow={removeType:'items',removeId:detailId};navigate('remove');},'remove-plan':()=>{flow={removeType:'events',removeId:detailId};navigate('remove');},
  'cancel-remove':()=>navigate(flow.removeType==='items'?'item':'event',flow.removeId),
  'confirm-remove':async()=>{const type=flow.removeType;await store.put(type,{...store.data[type][flow.removeId],deleted:true});announce('Removed.');navigate(type==='items'?'where':'plan');},
  switch:()=>navigate('switch'),'switch-confirm':()=>{switching=true;navigate('welcome');}
};
app.addEventListener('click',async event=>{
  const target=event.target.closest('button'); if(!target||target.disabled||busy)return;
  if(target.dataset.speak){startSpeech(target.dataset.speak,target);return;}
  if(target.dataset.choice){
    const field=target.dataset.field,other=target.dataset.choice==='Other'; flow[field]=other?'':target.dataset.choice;
    document.querySelector(`#${field}`).value=flow[field];
    for(const chip of document.querySelectorAll(`[data-field="${field}"]`)){const selected=chip===target;chip.classList.toggle('selected',selected);chip.setAttribute('aria-pressed',selected);}
    if(other)document.querySelector(`#${field}`).focus();return;
  }
  if(target.dataset.date){flow.date=target.dataset.date;render();return;}
  if(target.dataset.time){flow.timeType=target.dataset.time;error='';render();return;}
  if(target.dataset.repeat){flow.repeat=target.dataset.repeat;render();return;}
  if(target.dataset.digit){if(joinNumber.length<6)joinNumber+=target.dataset.digit;document.querySelector('#house-number').value=joinNumber;return;}
  if(target.dataset.openItem){navigate('item',target.dataset.openItem);return;}
  if(target.dataset.openEvent){navigate('event',target.dataset.openEvent);return;}
  try {
    busy=true;
    if(target.dataset.done){const id=`${target.dataset.done}_${viewDate}`;await store.put('completions',{id,eventId:target.dataset.done,date:viewDate,done:!store.data.completions[id]?.done,deleted:false});announce(store.data.completions[id].done?'Marked as done.':'Marked as not done.');}
    else {const fn=actions[target.dataset.action];if(fn)await fn();}
  } catch {showError('We could not save that on this phone. Please make some space on your phone and try again.');}
  finally {busy=false;app.querySelectorAll('[data-action]:disabled').forEach(el=>{if(el.dataset.action!=='back')el.disabled=false;});}
});
app.addEventListener('input',event=>{
  const el=event.target;
  if(el.id==='search'){search=el.value;document.querySelector('#results').innerHTML=results();}
  if(el.id==='house-number'){joinNumber=el.value.replace(/\D/g,'').slice(0,6);el.value=joinNumber;}
  if(el.dataset.bind&&flow){flow[el.dataset.bind]=el.value;document.querySelectorAll(`[data-field="${el.dataset.bind}"]`).forEach(chip=>{const selected=normalize(chip.dataset.choice)===normalize(el.value);chip.classList.toggle('selected',selected);chip.setAttribute('aria-pressed',selected);});}
});
app.addEventListener('change',async event=>{
  if(event.target.id!=='photo-camera'||!event.target.files[0])return;
  const file=event.target.files[0], currentFlow=flow;
  busy=true;document.querySelector('#photo-status').textContent='Getting your picture ready…';
  document.querySelectorAll('[data-action="save-item"]').forEach(el=>el.disabled=true);
  try {const picture=await compressPhoto(file);if(flow===currentFlow){flow.photo=picture;error='';}}
  catch(err){error=err.message;}
  finally{busy=false;if(flow===currentFlow)render();}
});
function startSpeech(field,buttonEl) {
  if(!Recognition)return;
  if(recognition){recognition.stop();return;}
  const rec=new Recognition();recognition=rec;rec.lang='en-US';rec.interimResults=false;rec.maxAlternatives=1;
  buttonEl.setAttribute('aria-pressed','true');buttonEl.innerHTML=svg('mic',26)+'Listening… tap to stop';
  const hint=document.querySelector('#speech-hint');if(hint)hint.textContent='Say a few words. You can always type instead.';
  rec.onresult=event=>{
    const value=event.results[0][0].transcript;const input=document.getElementById(field);
    if(input){input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));}
  };
  rec.onerror=()=>{if(hint)hint.textContent='We did not catch that. Please try again, or type it below.';};
  rec.onend=()=>{recognition=null;buttonEl.setAttribute('aria-pressed','false');buttonEl.innerHTML=svg('mic',26)+'Speak';};
  try{rec.start();}catch{rec.onend();if(hint)hint.textContent='Please type instead this time.';}
}
store.subscribe(()=>{if(['home','where','plan','item','event'].includes(screen)){const focused=document.activeElement?.id;if(screen==='where'&&focused==='search'){document.querySelector('#results').innerHTML=results();}else render();}});
window.addEventListener('sharing-status',()=>{const el=document.querySelector('#sharing-status');if(el)el.textContent=sharingStatus().message;});
// Refresh the date at midnight in New York, without interrupting a question.
let lastToday=today();setInterval(()=>{const now=today();if(now!==lastToday){if(viewDate===lastToday)viewDate=now;lastToday=now;if(['home','plan'].includes(screen))render();}},30000);
async function init(){
  const id=rememberedHouse();
  if(id){await store.open(id);screen='home';startSharing();}
  window.history.replaceState({screen},'',`#${screen}`);render();
  if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
}
init().catch(()=>{app.innerHTML=header()+'<main><h1>Please open this page again.</h1><p>Your phone could not open its saved lists. Please allow website storage in your browser settings.</p></main>';});

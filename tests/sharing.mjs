// Exercise the real sync.js in two isolated browsers, with a deterministic SDK transport double.
// This does not claim to test Firebase's service, auth policies, or deployed rules.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base=process.env.APP_URL||'http://127.0.0.1:8768';
const output='/workspace/our-house-shots/sharing-test-results.json';
const cloud=new Map(), results=[];
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
const config=`export const firebaseConfig={apiKey:'transport-double',authDomain:'local.test',projectId:'our-house-transport-test',storageBucket:'local.test',messagingSenderId:'777',appId:'transport-test-app'};`;
const appSDK=`export function getApps(){return []}export function initializeApp(config){return {config}}`;
const authSDK=`export function getAuth(){return {currentUser:{uid:'anonymous-test'}}}export async function signInAnonymously(){}`;
const firestoreSDK=`
export const persistentMultipleTabManager=()=>({});export const persistentLocalCache=()=>({});export const initializeFirestore=()=>({});export const getFirestore=()=>({});
export const doc=(_db,...path)=>path.join('/');export const collection=(_db,...path)=>path.join('/');
export async function runTransaction(_db,callback){
 if(!navigator.onLine)throw Error('offline');
 const writes=[];
 const result=await callback({get:async path=>{const data=await window.__cloudRead(path);return{exists:()=>!!data,data:()=>data};},set:(path,data)=>writes.push([path,data])});
 for(const [path,data]of writes)await window.__cloudWrite(path,data);return result;
}
export function onSnapshot(prefix,callback){
 let stopped=false,previous='';
 const poll=async()=>{if(stopped||!navigator.onLine)return;const records=await window.__cloudList(prefix);const json=JSON.stringify(records);if(stopped||json===previous)return;previous=json;callback({docChanges:()=>records.map(data=>({type:'modified',doc:{data:()=>data}}))});};
 const timer=setInterval(()=>poll().catch(()=>{}),50);poll();return()=>{stopped=true;clearInterval(timer)};
}`;
async function makeContext(){
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 await context.exposeFunction('__cloudRead',path=>cloud.get(path)||null);
 await context.exposeFunction('__cloudWrite',(path,record)=>cloud.set(path,record));
 await context.exposeFunction('__cloudList',prefix=>[...cloud.entries()].filter(([key])=>key.startsWith(prefix+'/')).map(([,value])=>value));
 await context.route('**/firebase-config.js',route=>route.fulfill({contentType:'text/javascript',body:config}));
 await context.route('https://www.gstatic.com/firebasejs/10.14.1/*',route=>route.fulfill({contentType:'text/javascript',body:route.request().url().endsWith('firebase-app.js')?appSDK:route.request().url().endsWith('firebase-auth.js')?authSDK:firestoreSDK}));
 const page=await context.newPage();await page.goto(base);await page.evaluate(async()=>{window.__store=(await import('./storage.js')).store;window.__sharingStatus=(await import('./sync.js')).sharingStatus;});return{context,page};
}
async function test(name,fn){try{await fn();results.push({name,pass:true});}catch(error){results.push({name,pass:false,error:String(error)});throw error;}}
const click=(p,name)=>p.getByRole('button',{name,exact:true}).click();
async function waitCount(page,type,count){await page.waitForFunction(({type,count})=>window.__store.list(type).length===count,{type,count});}
async function local(page,type){return page.evaluate(async type=>{const{store}=await import('./storage.js');return store.list(type);},type);}
let A,B;
try{
 A=await makeContext();B=await makeContext();
 await test('Configured transport: create on phone A and join the same house on phone B',async()=>{
  await click(A.page,'Create our house');const number=await A.page.locator('.number').innerText();await click(A.page,'Continue');
  await click(B.page,'I already have a house number');await B.page.locator('#house-number').fill(number);await click(B.page,'Open our house');
  await A.page.waitForFunction(()=>window.__sharingStatus().mode==='shared');
  await B.page.waitForFunction(()=>window.__sharingStatus().mode==='shared');
 });
 await test('Phone A item arrives on phone B through the real sync module',async()=>{
  await A.page.evaluate(async()=>{const{store}=await import('./storage.js');const{itemId}=await import('./domain.js');await store.put('items',{id:await itemId('Keys'),name:'Keys',location:'Kitchen drawer',photo:'',deleted:false});});
  await waitCount(B.page,'items',1);assert.equal((await local(B.page,'items'))[0].location,'Kitchen drawer');
 });
 await test('Phone B move arrives on A without creating another Keys record',async()=>{
  await B.page.evaluate(async()=>{const{store}=await import('./storage.js');await store.put('items',{...store.list('items')[0],location:'Front door'});});
  await A.page.waitForFunction(()=>window.__store.list('items')[0]?.location==='Front door');
  assert.equal((await local(A.page,'items')).length,1);
 });
 await test('A newer remote tombstone wins over an older queued offline move on reconnect',async()=>{
  await A.context.setOffline(true);
  await A.page.evaluate(async()=>{const{store}=await import('./storage.js');await store.put('items',{...store.list('items')[0],location:'Bedroom'});});
  // Ensure a strict later timestamp without relying on wall-clock timer sleeps.
  const stamp=(await local(A.page,'items'))[0].updatedAt;
  await B.page.evaluate(async stamp=>{const{store}=await import('./storage.js');const old=store.list('items')[0];await store.merge('items',{...old,updatedAt:stamp+1});await store.put('items',{...store.data.items[old.id],deleted:true});},stamp);
  await B.page.waitForFunction(()=>Object.keys(window.__store.pending).length===0);
  await A.context.setOffline(false);await waitCount(A.page,'items',0);
  await A.page.waitForFunction(()=>Object.keys(window.__store.pending).length===0);
  assert.equal([...cloud.values()].find(x=>x.name==='Keys').deleted,true);
 });
 await test('Per-date plan completion shares without completing the next daily occurrence',async()=>{
  await A.page.evaluate(async()=>{const{store}=await import('./storage.js');const{today}=await import('./domain.js');await store.put('events',{id:'recurring-call',title:'Call family',date:today(),timeType:'morning',time:'',repeat:'daily',deleted:false});});
  await waitCount(B.page,'events',1);
  await B.page.evaluate(async()=>{const{store}=await import('./storage.js');const{today}=await import('./domain.js');await store.put('completions',{id:'recurring-call_'+today(),eventId:'recurring-call',date:today(),done:true,deleted:false});});
  await waitCount(A.page,'completions',1);
  const check=await A.page.evaluate(async()=>{const{store}=await import('./storage.js');const{today,shiftDay}=await import('./domain.js');return{now:store.data.completions['recurring-call_'+today()].done,next:store.data.completions['recurring-call_'+shiftDay(today(),1)]?.done||false};});
  assert.deepEqual(check,{now:true,next:false});
 });
 await test('Offline bootstrap reconnects and uploads queued records after initial config/SDK fetch failure',async()=>{
  const C=await makeContext();
  // Simulate the initial optional config request failing, then restore it on reconnect.
  await C.context.unroute('**/firebase-config.js');await C.context.route('**/firebase-config.js',r=>r.abort('internetdisconnected'));
  await click(C.page,'Create our house');await click(C.page,'Continue');await C.page.getByRole('heading',{name:'Grandma and Grandpa',exact:true}).waitFor();
  await C.page.evaluate(async()=>{const{store}=await import('./storage.js');await store.put('items',{id:'reconnect-item',name:'Wallet',location:'Purse',photo:'',deleted:false});});
  await C.context.unroute('**/firebase-config.js');await C.context.route('**/firebase-config.js',r=>r.fulfill({contentType:'text/javascript',body:config}));
  await C.context.setOffline(true);await C.context.setOffline(false);
  await C.page.waitForFunction(()=>Object.keys(window.__store.pending).length===0);
  assert.ok([...cloud.values()].some(x=>x.id==='reconnect-item'));await C.context.close();
 });
 await test('Optional Speak button accepts recognition text, and unsupported browsers hide it cleanly',async()=>{
  const voice=await browser.newContext({serviceWorkers:'block'});
  await voice.addInitScript(()=>{window.SpeechRecognition=class{start(){setTimeout(()=>{this.onresult({results:[[{transcript:'Reading glasses'}]]});this.onend();},10);}stop(){this.onend();}abort(){this.onend();}};});
  const p=await voice.newPage();await p.goto(base);await click(p,'Create our house');await click(p,'Continue');await p.locator('.home-card').first().click();await click(p,'I put something away');await click(p,'Speak');await p.waitForFunction(()=>document.querySelector('#name').value==='Reading glasses');await voice.close();
  const noVoice=await browser.newContext({serviceWorkers:'block'});await noVoice.addInitScript(()=>{window.SpeechRecognition=undefined;window.webkitSpeechRecognition=undefined;});const q=await noVoice.newPage();await q.goto(base);await click(q,'Create our house');await click(q,'Continue');await q.locator('.home-card').first().click();assert.equal(await q.getByRole('button',{name:'Speak',exact:true}).count(),0);await q.locator('#search').fill('Keys');await noVoice.close();
 });
}catch(error){console.error(error);process.exitCode=1;}
finally{await fs.writeFile(output,JSON.stringify({pass:results.every(x=>x.pass),type:'SDK transport double — not a live Firebase service test',checks:results},null,2));console.log(JSON.stringify(results,null,2));await browser.close();}

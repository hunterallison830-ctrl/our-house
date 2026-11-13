import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base=process.env.APP_URL||'http://127.0.0.1:8768';
const shots='/workspace/our-house-shots';
await fs.mkdir(shots,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,timezoneId:'America/New_York',reducedMotion:'reduce'});
const page=await context.newPage();
const results=[],errors=[];
page.on('pageerror',err=>errors.push(String(err)));
async function test(name,fn){const start=Date.now();try{await fn();results.push({name,pass:true,durationMs:Date.now()-start});}catch(error){results.push({name,pass:false,error:String(error)});throw error;}}
const click=name=>page.getByRole('button',{name,exact:true}).click();
const shot=name=>page.screenshot({path:`${shots}/${name}.png`,fullPage:false});
async function waitTitle(text){await page.getByRole('heading',{name:text,exact:true}).waitFor();}
async function goHome(){while(!(await page.getByRole('heading',{name:'Grandma and Grandpa',exact:true}).count()))await click('Back');}
async function addItem(name,location){await click('I put something away');await page.locator('#name').fill(name);await click('Continue');await page.locator('#location').fill(location);await click('Continue');await click('Skip the picture');await waitTitle('Saved.');await click('Done');}
try{
 await test('First run: plain welcome, create and remember a safe six-digit house number',async()=>{
  await page.goto(base);await waitTitle('Welcome to Our House');await page.evaluate(()=>document.fonts.ready);await shot('first-run');
  await click('Create our house');const code=(await page.locator('.number').innerText()).trim();assert.match(code,/^[1-9]\d{5}$/);assert.notEqual(code,'123456');
  await click('Continue');await waitTitle('Grandma and Grandpa');assert.equal(await page.evaluate(()=>localStorage.getItem('our-house-number')),code);
  await shot('home');
 });
 await test('Add item wizard, optional photo skip, case-insensitive name and location search',async()=>{
  await page.locator('.home-card').first().click();await waitTitle('Where did I put it?');
  await click('I put something away');await waitTitle('What did you put away?');await shot('add-item');
  await page.getByRole('button',{name:'Keys',exact:true}).click();await click('Continue');
  await page.locator('#location').fill('Kitchen drawer');await click('Continue');await waitTitle('Want to take a picture?');
  await click('Skip the picture');await waitTitle('Saved.');await click('Done');
  await page.locator('#search').fill('kEyS');assert.equal(await page.locator('.result').count(),1);
  await page.locator('#search').fill('DRAWER');assert.equal(await page.locator('.result').count(),1);
  await page.locator('#search').fill('');await shot('where');await page.locator('.result').first().click();
  await waitTitle('Keys');await page.getByText('Kitchen drawer',{exact:true}).waitFor();await shot('item-detail');
 });
 await test('Duplicate normalized item names update the existing thing; moving uses only the place step',async()=>{
  await click('Back');await addItem('  keys  ','On the nightstand');assert.equal(await page.locator('.result').count(),1);
  await page.locator('.result').click();await click('I moved it');await page.locator('#location').fill('Kitchen drawer');await click('Save the new place');await click('Done');
  assert.equal(await page.locator('.result').count(),1);assert.match(await page.locator('.result').innerText(),/Kitchen drawer/);
 });
 await test('Add today plan, all four questions, specific time, daily recurrence and done state',async()=>{
  await goHome();await page.locator('.plan-card').click();await click('Add to the plan');await waitTitle("What's the plan?");await shot('add-plan');
  await page.getByRole('button',{name:'Call family',exact:true}).click();await click('Continue');await page.locator('[data-date]').first().click();await click('Continue');
  await click('A specific time');await page.locator('#time').fill('10:30');await click('Continue');await click('Every day');await click('Save to the plan');await waitTitle('Saved.');await click('Done');
  await page.getByRole('heading',{name:'Call family',exact:true}).waitFor();await click('Mark as done');await page.getByRole('button',{name:'✓ Done — mark as not done',exact:true}).waitFor();await shot('plan');
 });
 await test('Reload preserves both saved items and done plan; no onboarding again',async()=>{
  await page.reload();await waitTitle('Grandma and Grandpa');await page.locator('.home-card').first().click();assert.match(await page.locator('.result').innerText(),/Kitchen drawer/);
  await goHome();await page.locator('.plan-card').click();await page.getByRole('button',{name:'✓ Done — mark as not done',exact:true}).waitFor();
 });
 await test('Recurring completion is per day; yesterday/tomorrow and jump-to-today controls work',async()=>{
  await click('Tomorrow');await click('Mark as done');await click('Jump to today');await page.getByRole('button',{name:'✓ Done — mark as not done',exact:true}).waitFor();
  await click('Tomorrow');await click('✓ Done — mark as not done');await click('Jump to today');await page.getByRole('button',{name:'✓ Done — mark as not done',exact:true}).waitFor();
  await click('Yesterday');assert.equal(await page.locator('.plan-row').count(),0);await click('Jump to today');
 });
 await test('Event detail editing and removal confirmation; cancel keeps the plan',async()=>{
  await page.locator('.event-open').click();await click('Change this plan');await page.locator('#title').fill('Call family');await click('Continue');await click('Continue');await click('Continue');await click('Save to the plan');await click('Done');
  await page.locator('.event-open').click();await click('Remove from the plan');await page.getByRole('heading',{name:'Remove “Call family”?',exact:true}).waitFor();await click('No, keep it');
 });
 await test('Huge controls, readable type, mobile viewport has no horizontal overflow or blocked zoom',async()=>{
  await goHome();await shot('home');
  const metrics=await page.evaluate(()=>({buttons:[...document.querySelectorAll('button')].filter(b=>b.offsetParent!==null).map(b=>({label:b.innerText,height:b.getBoundingClientRect().height,font:parseFloat(getComputedStyle(b).fontSize)})),body:parseFloat(getComputedStyle(document.body).fontSize),overflow:document.documentElement.scrollWidth>innerWidth,viewport:document.querySelector('meta[name=viewport]').content}));
  assert.ok(metrics.buttons.every(b=>b.height>=64),JSON.stringify(metrics));assert.ok(metrics.body>=22);assert.ok(!metrics.overflow);assert.ok(!/user-scalable=no|maximum-scale=1/.test(metrics.viewport));
 });
 await test('Photo capture input, compression below 120KB, saved preview and persistence',async()=>{
  await page.locator('.home-card').first().click();await click('I put something away');await page.locator('#name').fill('Remote');await click('Continue');await page.locator('#location').fill('Living room shelf');await click('Continue');
  const input=page.locator('#photo-camera');assert.equal(await input.getAttribute('capture'),'environment');assert.equal(await input.getAttribute('accept'),'image/*');
  await input.setInputFiles('/workspace/our-house/icons/icon-512.png');await page.getByRole('button',{name:'Save with this picture',exact:true}).waitFor();
  await click('Save with this picture');await click('Done');await page.locator('.result').filter({hasText:'Remote'}).click();await page.locator('.photo').waitFor();
  const stats=await page.evaluate(async()=>{const {store}=await import('./storage.js');const item=store.list('items').find(x=>x.name==='Remote');const img=document.querySelector('.photo');await img.decode();return{bytes:item.photo.length,w:img.naturalWidth,h:img.naturalHeight};});
  assert.ok(stats.bytes<120000);assert.ok(stats.w<=900&&stats.h<=900);await page.reload();await waitTitle('Grandma and Grandpa');await page.locator('.home-card').first().click();await page.locator('.result').filter({hasText:'Remote'}).click();await page.locator('.photo').waitFor();
 });
 await test('Large noisy photos are really resized and compressed below 120KB',async()=>{
  const result=await page.evaluate(async()=>{
   const{compressPhoto}=await import('./domain.js');const canvas=document.createElement('canvas');canvas.width=1800;canvas.height=1200;
   const ctx=canvas.getContext('2d');const pixels=ctx.createImageData(canvas.width,canvas.height);
   let seed=71;for(let i=0;i<pixels.data.length;i+=4){seed=(seed*1664525+1013904223)>>>0;pixels.data[i]=seed&255;pixels.data[i+1]=(seed>>>8)&255;pixels.data[i+2]=(seed>>>16)&255;pixels.data[i+3]=255;}ctx.putImageData(pixels,0,0);
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));const jpeg=await compressPhoto(new File([blob],'large.png',{type:'image/png'}));
   const image=new Image();image.src=jpeg;await image.decode();return{size:jpeg.length,width:image.naturalWidth,height:image.naturalHeight,original:blob.size};
  });assert.ok(result.original>1000000);assert.ok(result.size<120000);assert.ok(result.width<=900&&result.height<=900);
 });
 await test('Delete uses clear confirmation and tombstones; cancel keeps the thing',async()=>{
  await click('This is not here anymore');await page.getByRole('heading',{name:'Remove remote from the list?',exact:true}).waitFor();await click('No, keep it');await click('This is not here anymore');await click('Yes, remove it');assert.equal(await page.locator('.result').filter({hasText:'Remote'}).count(),0);
  assert.equal(await page.evaluate(async()=>{const{store}=await import('./storage.js');return Object.values(store.data.items).find(x=>x.name==='Remote').deleted;}),true);
 });
 await test('Offline app reload and local writing work; changes remain queued for later sharing',async()=>{
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});await page.reload();await waitTitle('Grandma and Grandpa');
  await context.setOffline(true);await page.reload();await waitTitle('Grandma and Grandpa');await page.locator('.home-card').first().click();await addItem('Wallet','In a purse or bag');assert.match(await page.locator('.result').filter({hasText:'Wallet'}).innerText(),/In a purse or bag/);
  const count=await page.evaluate(async()=>{const{store}=await import('./storage.js');return Object.keys(store.pending).length;});assert.ok(count>=3);await context.setOffline(false);
 });
 await test('LWW merges newer records, ignores older records, and keeps deleted things deleted',async()=>{
  const checks=await page.evaluate(async()=>{const{store}=await import('./storage.js');const item=store.list('items').find(x=>x.name.trim().toLowerCase()==='keys');await store.merge('items',{...item,location:'Bedroom',updatedAt:item.updatedAt-100});const ignored=store.data.items[item.id].location==='Kitchen drawer';await store.merge('items',{...item,deleted:true,updatedAt:item.updatedAt+100});await store.merge('items',{...item,deleted:false,updatedAt:item.updatedAt+10});return{ignored,tombstone:store.data.items[item.id].deleted};});assert.deepEqual(checks,{ignored:true,tombstone:true});
 });
 await test('House switching is warned, keypad works, each house stays separate and remembered',async()=>{
  await goHome();await click('Help & house number');const old=await page.evaluate(()=>localStorage.getItem('our-house-number'));await click('Use a different house number');await page.getByText('This phone will show the other house’s lists and plans. Your current house’s information will stay saved.',{exact:true}).waitFor();await click('Use a different house');await click('I already have a house number');for(const n of '908172')await page.locator(`[data-digit="${n}"]`).click();await click('Open our house');await waitTitle('Grandma and Grandpa');await page.locator('.home-card').first().click();assert.equal(await page.locator('.result').count(),0);
  await goHome();await click('Help & house number');await click('Use a different house number');await click('Use a different house');await click('I already have a house number');await page.locator('#house-number').fill(old);await click('Open our house');await page.locator('.home-card').first().click();assert.ok(await page.locator('.result').filter({hasText:'Wallet'}).count());
 });
 await test('Timezone, weekly recurrence and deterministic duplicate identity',async()=>{
  const r=await page.evaluate(async()=>{const d=await import('./domain.js');return{today:d.today(),same:(await d.itemId(' Keys '))===(await d.itemId('keys')),weeklyYes:d.occurs({date:'2026-10-25',repeat:'weekly'},'2026-11-08'),weeklyNo:d.occurs({date:'2026-10-25',repeat:'weekly'},'2026-11-09'),earlier:d.occurs({date:'2026-11-08',repeat:'daily'},'2026-11-07'),dst:d.shiftDay('2026-11-01',1)};});
  assert.equal(r.today,new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()));assert.equal(r.same,true);assert.equal(r.weeklyYes,true);assert.equal(r.weeklyNo,false);assert.equal(r.earlier,false);assert.equal(r.dst,'2026-11-02');
 });
 await test('Native browser Back/Forward restores a safe wizard; blank answers are explained',async()=>{
  await click('I put something away');await click('Continue');await page.getByRole('alert').filter({hasText:'Choose a thing or type its name.'}).waitFor();
  await click('Back');await page.goBack();await waitTitle('What did you put away?');await click('Back');
 });
 await test('Text and primary colors meet WCAG AA contrast',async()=>{
  await goHome();const pairs=await page.evaluate(()=>[
   [getComputedStyle(document.body).color,getComputedStyle(document.documentElement).backgroundColor],
   [getComputedStyle(document.querySelector('.plan-card')).color,getComputedStyle(document.querySelector('.plan-card')).backgroundColor],
   [getComputedStyle(document.querySelector('.brand')).color,getComputedStyle(document.documentElement).backgroundColor]
  ]);
  const luminance=rgb=>rgb.match(/\d+/g).slice(0,3).map(Number).map(n=>n/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0);
  for(const[a,b]of pairs){const x=luminance(a),y=luminance(b);assert.ok((Math.max(x,y)+.05)/(Math.min(x,y)+.05)>=4.5);}
 });
 await test('No uncaught browser errors',async()=>assert.deepEqual(errors,[]));
}catch(error){console.error(error);await page.screenshot({path:`shots/failure.png`.replace('shots/',shots+'/'),fullPage:true}).catch(()=>{});process.exitCode=1;}
finally{
 const report={pass:results.length>0&&results.every(x=>x.pass),url:base,viewport:{width:390,height:844},testedAtNewYork:new Date().toLocaleString('en-US',{timeZone:'America/New_York'})+' ET',checks:results,uncaughtErrors:errors,limitations:['No live Firebase project was supplied; actual cross-phone backend sharing must be smoke-tested after configuration.','Camera hardware and live speech recognition require a real phone.']};
 await fs.writeFile(`${shots}/test-results.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await browser.close();
}

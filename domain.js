export function today() {
  const parts = new Intl.DateTimeFormat('en-US', {timeZone:'America/New_York', year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const p = Object.fromEntries(parts.map(x=>[x.type,x.value])); return `${p.year}-${p.month}-${p.day}`;
}
export function shiftDay(date, amount) { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + amount); return d.toISOString().slice(0,10); }
export function dateWords(date, year = false) { return new Intl.DateTimeFormat('en-US', {timeZone:'UTC',weekday:'long',month:'long',day:'numeric',...(year ? {year:'numeric'} : {})}).format(new Date(date + 'T12:00:00Z')); }
export function greeting() { const h = Number(new Intl.DateTimeFormat('en-US', {timeZone:'America/New_York',hour:'numeric',hourCycle:'h23'}).format(new Date())); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; }
export function occurs(event, date) {
  if (event.deleted || date < event.date) return false;
  if (event.repeat === 'daily') return true;
  if (event.repeat === 'weekly') return (Date.parse(date + 'T12:00:00Z') - Date.parse(event.date + 'T12:00:00Z')) / 86400000 % 7 === 0;
  return event.date === date;
}
export function timeRank(event) { return {all: -1,morning: 540,afternoon: 840,evening: 1080}[event.timeType] ?? Number(event.time?.slice(0,2) || 0)*60+Number(event.time?.slice(3) || 0); }
export function timeWords(event) {
  const name = {all:'All day',morning:'Morning',afternoon:'Afternoon',evening:'Evening'}[event.timeType];
  if (name) return name;
  const [h,m] = event.time.split(':').map(Number); return `${h%12 || 12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`;
}
export const repeatWords = event => ({once:'Just once',daily:'Every day',weekly:'Every week'}[event.repeat] || 'Just once');
// Stable normalized-name ID prevents duplicate Keys records even across offline phones.
export async function itemId(name) {
  const normalized = name.trim().toLocaleLowerCase().replace(/\s+/g,' ');
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(normalized)));
  return 'item-' + [...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export async function compressPhoto(file) {
  if (!file.type.startsWith('image/')) throw new Error('Please choose a picture.');
  if (file.size > 30 * 1024 * 1024) throw new Error('That picture is very large. Please take a new picture.');
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('That picture could not be opened. Please choose a JPEG picture or take a new one.'));img.src=url;});
    const canvas=document.createElement('canvas');
    let edge=900, quality=.72, result;
    for (let i=0;i<10;i++) {
      const scale=Math.min(1,edge/Math.max(image.naturalWidth,image.naturalHeight));
      canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale);
      canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
      result=canvas.toDataURL('image/jpeg',quality);
      if(result.length < 115000) return result;
      if(quality>.45) quality-=.1; else edge=Math.round(edge*.8);
    }
    if (result.length > 125000) throw new Error('Please try a simpler picture.');
    return result;
  } finally { URL.revokeObjectURL(url); }
}

// One persisted snapshot per house. All writes finish on this phone before UI confirmation.
const DB_NAME = 'our-house-v1';
const HOUSE_KEY = 'our-house-number';
const CLIENT_KEY = 'our-house-client';
function storageGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function storageSet(key, value) {
  try { localStorage.setItem(key, value); return true; } catch { return false; }
}
function cookiePath() {
  let path = location.pathname || '/';
  if (!path.endsWith('/')) {
    const last = path.split('/').pop();
    path = /\.[A-Za-z0-9]+$/.test(last) ? path.slice(0, path.length - last.length) : path + '/';
  }
  return path || '/';
}
function cookieGet(name) {
  try {
    const prefix = name + '=';
    for (const part of document.cookie.split(';')) {
      const piece = part.trim();
      if (piece.startsWith(prefix)) return decodeURIComponent(piece.slice(prefix.length));
    }
  } catch {}
  return null;
}
function cookieSet(name, value) {
  try {
    const secure = location.protocol === 'https:' ? ';Secure' : '';
    document.cookie = `${name}=${encodeURIComponent(value)};Max-Age=315360000;Path=${cookiePath()};SameSite=Lax${secure}`;
    return true;
  } catch { return false; }
}
export function rememberedHouse() {
  const raw = storageGet(HOUSE_KEY) || cookieGet(HOUSE_KEY) || '';
  return /^\d{6}$/.test(raw) ? raw : '';
}
export function rememberHouse(id) {
  if (!/^\d{6}$/.test(id)) return;
  storageSet(HOUSE_KEY, id);
  cookieSet(HOUSE_KEY, id);
}
const clientId = storageGet(CLIENT_KEY) || cookieGet(CLIENT_KEY) || crypto.randomUUID();
storageSet(CLIENT_KEY, clientId);
cookieSet(CLIENT_KEY, clientId);
let db, house = '', data = blank(), pending = {}, subscribers = [], clock = 0;
let writeChain = Promise.resolve();
function blank() { return {items: {}, events: {}, completions: {}}; }
export const normalize = text => text.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
export function compare(a, b) { return (a?.updatedAt || 0) - (b?.updatedAt || 0) || String(a?.writer || '').localeCompare(String(b?.writer || '')); }
async function openDB() {
  if (db) return db;
  db = await new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('houses');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return db;
}
async function readSnapshot(id) {
  try {
    const database = await openDB();
    return await new Promise((resolve, reject) => {
      const r = database.transaction('houses').objectStore('houses').get(id);
      r.onsuccess = () => resolve(r.result || JSON.parse(storageGet(`our-house-data-${id}`) || 'null'));
      r.onerror = () => reject(r.error);
    });
  } catch {
    return JSON.parse(storageGet(`our-house-data-${id}`) || 'null');
  }
}
async function persist() {
  const id = house, value = structuredClone({data, pending});
  const job = async () => {
    try {
      const database = await openDB();
      await new Promise((resolve, reject) => {
        const tx = database.transaction('houses', 'readwrite');
        tx.objectStore('houses').put(value, id);
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
      });
    } catch {
      storageSet(`our-house-data-${id}`, JSON.stringify(value));
    }
  };
  writeChain = writeChain.catch(() => {}).then(job);
  return writeChain;
}
function notify() { subscribers.forEach(fn => fn()); }
export const store = {
  get house() { return house; },
  get data() { return data; },
  get pending() { return pending; },
  async open(id) {
    await writeChain.catch(() => {});
    house = id;
    const saved = await readSnapshot(id);
    data = saved?.data || blank(); pending = saved?.pending || {};
    for (const group of Object.values(data)) for (const record of Object.values(group)) clock = Math.max(clock, record.updatedAt || 0);
    rememberHouse(id);
    notify();
  },
  subscribe(fn) { subscribers.push(fn); return () => { subscribers = subscribers.filter(x => x !== fn); }; },
  list(type) { return Object.values(data[type]).filter(x => !x.deleted); },
  async put(type, record) {
    const previous = structuredClone(data[type][record.id] || null);
    const oldPending = pending[`${type}/${record.id}`];
    clock = Math.max(Date.now(), clock + 1);
    const next = {...record, updatedAt: clock, writer: clientId};
    data[type][next.id] = next;
    pending[`${type}/${next.id}`] = next;
    try { await persist(); }
    catch (e) {
      if (previous) data[type][record.id] = previous; else delete data[type][record.id];
      if (oldPending) pending[`${type}/${record.id}`] = oldPending; else delete pending[`${type}/${record.id}`];
      throw e;
    }
    notify();
    return next;
  },
  async merge(type, record, expectedHouse = house) {
    if (expectedHouse !== house || !record?.id || !Number.isFinite(record.updatedAt)) return;
    clock = Math.max(clock, record.updatedAt);
    if (compare(record, data[type][record.id]) > 0) {
      data[type][record.id] = record;
      const key = `${type}/${record.id}`;
      if (pending[key] && compare(record, pending[key]) >= 0) delete pending[key];
      await persist(); notify();
    }
  },
  async acknowledge(key, sent, expectedHouse) {
    if (house !== expectedHouse) return;
    if (pending[key] && compare(pending[key], sent) === 0) { delete pending[key]; await persist(); }
  }
};

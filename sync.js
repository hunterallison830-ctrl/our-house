import {store, compare} from './storage.js';
let stop = () => {}, generation = 0;
// Initial page load may be offline, before the SDK or config can be fetched.
window.addEventListener('online', () => startSharing());
let status = {mode: 'local', message: 'Saved on this phone. Sharing can be set up later.'};
export const sharingStatus = () => status;
const setStatus = (mode, message) => { status = {mode, message}; window.dispatchEvent(new Event('sharing-status')); };
export async function startSharing() {
  stop(); const run = ++generation;
  let unsubscribers = [], busy = false, retryTimer;
  const currentHouse = store.house;
  const active = () => run === generation && store.house === currentHouse;
  stop = () => { unsubscribers.forEach(fn => fn()); clearTimeout(retryTimer); };
  setStatus('local', 'Saved on this phone. Sharing can be set up later.');
  try {
    // Avoid executing placeholder files; this public web config is optional.
    const response = await fetch('./firebase-config.js', {cache: 'no-store'});
    if (!response.ok) return;
    const {firebaseConfig: config} = await import('./firebase-config.js');
    const fields = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
    if (!config || fields.some(key => !config[key] || /YOUR_|REPLACE|EXAMPLE|placeholder|<|>/i.test(config[key]))) return;
    if (!active()) return;
    setStatus('connecting', 'Saved on this phone. Connecting both phones…');
    const base = 'https://www.gstatic.com/firebasejs/10.14.1/';
    const [appSDK, authSDK, fs] = await Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'), import(base + 'firebase-firestore.js')]);
    if (!active()) return;
    const app = appSDK.getApps()[0] || appSDK.initializeApp(config);
    const auth = authSDK.getAuth(app);
    if (!auth.currentUser) await authSDK.signInAnonymously(auth);
    if (!active()) return;
    let db;
    try { db = fs.initializeFirestore(app, {localCache: fs.persistentLocalCache({tabManager: fs.persistentMultipleTabManager()})}); }
    catch { db = fs.getFirestore(app); }
    const flush = async () => {
      if (!active() || busy || !navigator.onLine) return;
      busy = true;
      try {
        for (const [key, sent] of Object.entries(store.pending)) {
          if (!active()) break;
          const [type, id] = key.split('/');
          const ref = fs.doc(db, 'households', currentHouse, type, id);
          const winner = await fs.runTransaction(db, async tx => {
            const snapshot = await tx.get(ref);
            const remote = snapshot.exists() ? snapshot.data() : null;
            if (!remote || compare(sent, remote) > 0) { tx.set(ref, sent); return sent; }
            return remote;
          });
          if (!active()) break;
          await store.merge(type, winner, currentHouse);
          await store.acknowledge(key, sent, currentHouse);
        }
        if (active()) setStatus(navigator.onLine ? 'shared' : 'offline', navigator.onLine ? 'Both phones share this house number.' : 'Saved on this phone. The other phone will catch up when you are online.');
      } catch {
        if (active()) setStatus('waiting', 'Saved on this phone. Sharing will try again shortly.');
      } finally {
        busy = false;
        if (active()) { clearTimeout(retryTimer); retryTimer = setTimeout(flush, 15000); }
      }
    };
    for (const type of ['items', 'events', 'completions']) {
      unsubscribers.push(fs.onSnapshot(fs.collection(db, 'households', currentHouse, type), snapshot => {
        if (!active()) return;
        for (const change of snapshot.docChanges()) if (change.type !== 'removed') store.merge(type, change.doc.data(), currentHouse);
      }, () => { if (active()) setStatus('waiting', 'Saved on this phone. Sharing will try again shortly.'); }));
    }
    unsubscribers.push(store.subscribe(flush));
    const onOnline = () => flush();
    const onOffline = () => setStatus('offline', 'Saved on this phone. The other phone will catch up when you are online.');
    window.addEventListener('online', onOnline); window.addEventListener('offline', onOffline);
    unsubscribers.push(() => window.removeEventListener('online', onOnline), () => window.removeEventListener('offline', onOffline));
    flush();
  } catch {
    if (active()) {
      setStatus('local', 'Saved on this phone. Sharing will connect when it is available.');
      retryTimer = setTimeout(() => { if (active()) startSharing(); }, 30000);
    }
  }
}

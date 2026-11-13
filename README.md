# Our House

A calm, big-button shared household notepad for Grandma and Grandpa. Two jobs: remember where things are, and plan a day. Vanilla HTML/CSS/ES modules; no build, no publishing performed, no existing Firebase project used.

## Open locally

```sh
cd /workspace/our-house
python3 -m http.server 8768 --bind 0.0.0.0
```

Open **http://localhost:8768**. A preview server was left running on port **8768**. Use HTTPS when eventually hosting for phones (localhost is also a secure context); PWA installation, SHA-256 IDs, voice, and camera browser features need a secure context. Do not open index.html with file://.

Local data works immediately. Without Firebase configuration, the Help screen honestly says sharing has not been set up. You can create a number and use every feature locally; pending changes wait on this phone. The same number alone does not transfer data without the backend.

## Enable two-phone sharing later

1. Create a **new, separate** Firebase project and a Web app. Do not reuse another application's project or credentials.
2. Enable **Authentication → Sign-in method → Anonymous**. Add the eventual hosting domain to Authorized domains if required by your project setup.
3. Create a **Cloud Firestore** database. Review and apply `firestore.rules` (see the important security limitation below). No Storage bucket is used for photos.
4. Copy `firebase-config.example.js` to **`firebase-config.js` beside index.html** and paste the public web app values, using this exact ES-module format:

```js
export const firebaseConfig = {
  apiKey: 'your public Firebase web apiKey',
  authDomain: 'your-project.firebaseapp.com',
  projectId: 'your-project',
  storageBucket: 'your-project.firebasestorage.app',
  messagingSenderId: 'your sender ID',
  appId: 'your app ID'
};
```

All six fields must be nonempty actual values; obvious placeholders are ignored. The file is gitignored as an accidental-project-reuse guard, though Firebase web config is public by design. Ensure it is included in the eventual hosted files deliberately. Never add service-account JSON, private keys, tokens, `.env` secrets, or Admin SDK credentials.

5. Reload the page while online. The app imports the **Firebase JS modular SDK 10.14.1 from gstatic CDN**, signs in anonymously, enables persistent multi-tab Firestore caching, sends pending local records, and listens for the other phone.
6. On the first phone: Create our house → write down the number → Continue. On the second: I already have a house number → type that number → Open our house. Both phones must use the same hosted app URL/origin.
7. Smoke-test real sharing: add Keys on phone one, see it on phone two; move it on two and see it on one; remove it and reconnect an offline phone; mark a recurring plan done on one date and check both phones.

A brief lost connection is quiet; everything stays usable and locally saved. Reconnection and 15-second retries drain the outbox. A missing config is not an error. A newly added config is picked up on reload (or an online transition). The config file is intentionally excluded from the service worker cache.

### Security and cost note — read before publishing

A **six-digit number is not a secure password**. Anyone who knows or guesses a number could access that house with the sample anonymous rules. Random allocation is not a reservation service: collisions are unlikely for a tiny family deployment but possible. There is no household directory, but codes can still be guessed. The UI warns people to keep the number private and not store sensitive details.

The sample rules validate records and deny physical deletion, but **do not provide strong household membership isolation or brute-force protection**. For a broadly public or sensitive deployment, add real membership authentication plus an invitation redemption backend, rate limiting/App Check, and server-enforced authorization before launch. Firebase App Check alone is not household authorization. Do not store health records, passwords, or other private information in this prototype. Review quotas/billing yourself before enabling a project; this work did not create any paid service or spend money.

### Data model

```
households/{sixDigitHouse}/items/{stableNormalizedNameHash}
households/{sixDigitHouse}/events/{uuid}
households/{sixDigitHouse}/completions/{eventId_YYYY-MM-DD}
```

Subcollections define the household; no parent document needs to be materialized. Every record has `id`, `updatedAt` (milliseconds), `writer` (device UUID) and `deleted`. Per-record last-write-wins compares timestamp then writer; transactions prevent stale offline writes from overwriting newer remote records. Tombstones prevent resurrection. Whole-series plan edits/removal are explicitly described. Done state is a separate per-date occurrence record. Future recurrence is computed, not materialized.

The IndexedDB database is `our-house-v1`, store `houses`. A complete per-house snapshot contains the three record maps and durable outbox. localStorage contains the remembered house number/device ID and is a storage fallback. Compressed photo JPEG data lives inside the IndexedDB item, then its Firestore document, not in Firebase Storage. A ~900px long edge and adaptive quality/dimensions keep the complete data URL under 125KB (normally under 115KB). Clearing website data removes local-only items; configured, uploaded data can download again. Avoid editing the same house in two tabs on the same phone simultaneously; the UI is designed for one app window per phone.

## Accessibility and UX

- Bundled **Atkinson Hyperlegible** regular/bold, SIL OFL (`fonts/OFL.txt`); no font network needed.
- Cream paper, near-black ink, white bordered cards, high-contrast deep teal. Body 22px; headings 30–38px; controls 64–96px+.
- Labeled Back always visible; disabled at the starting screen. No icon-only buttons, hidden menu, swipe requirement, or disabled pinch-zoom.
- One question at a time; starter words never create fake items. Blank validation is plain, inline, and announced. Clear removal confirmations.
- Search matches names and places; repeated normalized names update the existing item, including across offline phones.
- Speak uses SpeechRecognition/webkitSpeechRecognition when available; gracefully absent otherwise. Microphone permission/recognition depends on browser and may use its online speech service. Typing always works.
- Camera file input requests the rear camera; the browser may also offer a library. Unsupported picture formats get a plain retry message, and photos can always be skipped.
- Safe-area padding, standalone manifest, original generated house/key PNG icons, reduced-motion support, and keyboard focus rings.
- Dates/greeting use **America/New_York**, independent of device locale/time zone. Calendar arithmetic handles daylight-saving transitions.
- No promised alarms or lock-screen notifications; no medical advice or dosage guidance.

## Tests and screenshots

```sh
cd /workspace/our-house
npm install --no-audit --no-fund
npm test
```

Tests use Playwright with `/usr/bin/google-chrome` (override `CHROME_PATH`) against port 8768 (override `APP_URL`). They start no server themselves. Tests use isolated browser storage and never touch real family records.

`tests/e2e.mjs` checks create/join, item wizard/search/duplicates/moving, plan wizard/recurrence/time/done, editing/deletion confirmations, offline reload/writes, photo compression/persistence, house separation, LWW/tombstones, large controls and unblocked zoom.

Artifacts in `/workspace/our-house-shots/`:
- `first-run.png`, `home.png`, `where.png`, `item-detail.png`, `add-item.png`, `plan.png`, `add-plan.png` — 390×844 mobile viewport screenshots.
- `test-results.json` — combined per-check pass/fail and explicit limitations.
- `sharing-test-results.json` — seven additional transport-double checks, separately labeled.

`tests/sharing.mjs` also exercises the actual sharing module in two isolated browser contexts with a deterministic Firebase SDK transport double: create/join, cross-phone item and plan changes, conflict-safe deletion/reconnect, offline bootstrap recovery, and mocked/unsupported speech recognition. This is not a live-service test.

No real Firebase project was supplied, so real backend rules/anonymous-auth permissions and actual two-phone network sharing still need a smoke test after configuration. Camera hardware, iPhone installation, native date/time pickers, and live microphone recognition need real-phone testing. No external hosting, repository, publication, or messages were created.

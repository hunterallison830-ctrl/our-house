# Our House: design sketch and rationale

## Scope and phases
- Ground: greenfield; no surrounding project or existing accounts touched.
- Sketch: compare a single Firestore household JSON document against per-record subcollections.
- Agree: choose record subcollections and proceed without a human checkpoint.
- Implement: four browser modules and a zero-build app shell.
- Verify: real Chromium mobile interaction tests, offline reload, photos, record conflicts, and screenshots.

No cloud-agent or multi-model runner was available for this local-only assignment. Alternatives were evaluated locally, not by invented reviewers.

## Caller-first interfaces

```js
await store.open(houseNumber);                 // load this household only
store.list('items');                           // live, non-deleted records
await store.put('items', record);               // durable local write + outbox
await store.merge('items', remoteRecord, house); // newer wins; durable merge
await store.acknowledge(key, sent, house);       // only clear the revision sent
startSharing();                                // optional backend; never blocks UI
occurs(event, date);                            // compute rather than materialize
```

## Candidate designs and synthesis
1. **One remote document**: fewer listeners, but every edit competes with all other edits; inline photos reach Firestore's document-size limit rapidly. A transaction copies everything. Rejected.
2. **Per-record remote documents**: one listener per category; transactions resolve each record independently. Tombstones stay present. Photos are compressed into an item document under 125KB. Chosen.

A deep storage boundary hides IndexedDB, fallback, durable outbox, revision stamps, and merge rules. The UI does not import Firebase. Firebase does not own the screen state. Local writes are confirmed only after the storage transaction finishes.

## Module map
- `app.js`: screen rendering, one-question flows, input/speech/photo wiring, navigation.
- `domain.js`: New York dates, calendar-day arithmetic, recurrence, ordering, stable normalized item identity, photo compression.
- `storage.js`: IndexedDB snapshots per house; localStorage fallback; in-memory read model; outbox. Record shape `{id, updatedAt, writer, deleted, ...fields}`.
- `sync.js`: optional public module config; anonymous auth; persistent Firestore cache; per-record transaction LWW; snapshots; outbox retry; household-generation guard against stale callbacks.
- `sw.js`: same-origin app/font/icon offline shell. Never cache optional Firebase config or intercept Firestore traffic.

Completions use `eventId_YYYY-MM-DD` IDs, so completing a recurring event on one date doesn't complete the series. Item IDs are SHA-256 of the trimmed, case-folded, whitespace-normalized name, preventing two offline phones from creating duplicate Keys records.

## Conflict contract
`updatedAt` is a monotonically increasing local millisecond timestamp advanced past incoming revisions. Writer UUID breaks exact timestamp ties. Transactions read and compare remote and queued records before writing; late arrival does not override a newer remote value. Deletes are records with `deleted: true`, not document removal. Offline changes remain in the local durable outbox. Unsynchronized device clocks can still influence last-write-wins order; automatic clock correction is out of scope.

## Boundaries and deliberate limits
- Six digits are a family sharing convenience, not strong access control. No sensitive data should be stored. See README before enabling a public backend.
- Recurrence has no infinite pre-generated rows; occurrences are calculated for the viewed day.
- No alarms, push notifications, dosage guidance, external analytics, or third-party image assets.
- Camera permission and live dictation remain browser capabilities, not a guarantee. Typing and skipping a picture always work.

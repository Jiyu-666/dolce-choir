# Dolce Choir execution plan

Approved scope: public Jiyu-666/dolce-choir fork; desktop score preparation and mobile-first browser practice; four SATB groups each with jianpu + staff; independent font/spacing controls; four piano MP3 + MIDI solos; microphone pitch/rhythm feedback; revocable anonymous practice links using GitHub Pages + Supabase. No mini-program, ensemble source separation, lyric recognition, recording storage or student accounts.

Baseline: lodebar2026/dolce bb3333208d53b74bedb58b8530b1402eed54ed01.

| Task | State | Required work and acceptance |
|---|---|---|
| T00 | 已验证 | Verify/create public fork, origin/upstream, feat/choir-v1; retain licenses. Remote creation may require browser login. |
| T01 | 已实现待验证 | Node22 locked install, baseline typecheck/build, independent public Vitest + browser CI and handmade fixtures; optional upstream private tests remain separate. |
| T02 | 已实现待验证 | Enumerate part/staff/voice; explicit SATB bindings; monophonic derived ScoreDoc with provenance, metadata/timing/marks preserved; ambiguity diagnostics and no source mutation. Test 4 parts, 2x2 voices, 1 part/2 staves/4 voices, sparse voice numbers, chords/crossing/unison. |
| T03 | 已实现待验证 | Role setup/solo/source navigation; explicit confirmation; .dolcechoir ZIP + drafts/undo; reopen mappings by structural identity, invalidate affected bindings and cached assets on edits. Old .dolce remains compatible. |
| T04 | 已实现待验证 | Reuse existing repeat expansion; add occurrence ranges/tempo map; piecewise beat↔seconds; numeric/dotted-unit tempi, conflicts, ties, jumps, selection and MIDI tempo events; update playback pause/seek/speed/loop. Hand-computed timing gate before scoring. |
| T05 | 已实现待验证 | jianpuPart list through full painter chain; SATB groups; shared x/beat positions; ink bounds and repagination; staff mm / jianpu pt / layer+group mm independent; same screen/PDF/PNG request. Mobile shows selected group. |
| T06 | 已实现待验证 | True isolated single-role MIDI and local-sample piano MP3 44.1k mono 128k; worker encoding, ~20s PCM blocks with continuous envelopes/encoder, uniform whole-track gain, cancel/retry/revision guard, ZIP+attribution. Decode/check seams and long-track memory. |
| T07 | 已实现待验证 | Frozen performance plan; ready/loading/count-in/practicing/paused/completed/error; first pitch then 300ms then one-bar count-in; initial rests kept; piano/metronome default off independently; resume at current bar with new count-in; new attempt on config/loop. AudioContext clock. |
| T08 | 已实现待验证 | User-initiated mic; inspect accepted constraints; AudioWorklet→Worker, actual sample rate, 4096 window/1024 hop, pitchy clarity .85, 60–1500Hz, quiet calibration, timestamp window centers, missing-frame gaps, no monitoring/SAB dependency, cleanup/interruption. |
| T09 | 已实现待验证 | A440, cents=1200log2(f/target), ±50 cents, strict octave with explicit ±1 octave option; exclude min(80ms,15%) each edge; bounded temporal alignment without free warping; onset tolerance max(120ms,.2 quarter); no unsupported same-note onset claims. Separate coverage/accuracy; <50% coverage suppress conclusion. Optional path-latency calibration, never score-optimizing compensation. |
| T10 | 已实现待验证 | Hash practice route, lazy editor/OMR exclusion, 360px touch UI, selected voice and full-score switch, autoscroll, autoplay recovery, background pause and unsupported-mic fallback. |
| T11 | 已实现待验证 | Versioned immutable practice package; Supabase GitHub owner auth (verified provider ID138117377), private bucket/RLS/functions; create/list/revoke/resolve; ≥128bit token hashed in DB, URL fragment→POST, no-store; idempotency/cleanup; max10MiB compressed/50MiB expanded; local real integration tests. No raw score images/recordings/credentials in package. |
| T12 | 已实现待验证 | CI + independent Pages deployment BASE_PATH=/dolce-choir/, separate desktop releases, OAuth callbacks/config states, build identity/rollback and package-v1 compatibility. |
| T13 | 受阻 | Physical iPhone Safari + Android Chrome + desktop; permissions/audio route/background/10min singing; export/listen/share/revoke. Record device/version/date/results. Synthetic checks cannot substitute human holdout data. |

Gates: T04 music correct → T09 honest local comparison → T13 real-device end-to-end. Unknown voice or unresolved timing blocks that score's publishing. Missing deployment/device access remains explicitly unverified, not replaced by mocks.

Completion: independently import/correct/map a score, export four mixed groups + four MP3/MIDI, publish a link, practice selected voice on phone and obtain measured, qualified feedback.

Current execution checkpoint: T11 local service passed; T12 subpath/CI verification in progress. Production and physical-device acceptance remain blocked by unavailable configuration/devices. See STATUS.md for input/output commits and ACCEPTANCE.md for evidence.

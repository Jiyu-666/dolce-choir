# Execution status

Input commit: bb3333208d53b74bedb58b8530b1402eed54ed01. Branch: feat/choir-v1.

| Task | State | Evidence / next action |
|---|---|---|
| T00 | 已验证 | User completed fork flow; renamed to Jiyu-666/dolce-choir in GitHub UI; fork provenance shown. origin/upstream set, feat/choir-v1 push succeeded. |
| T01 | 已实现待验证 | Node22 typecheck/build + 38 public tests + Chromium original staff/mixed smoke passed. CI defined; broader handmade rhythm/repeat fixtures and remote CI pending. |
| T02 | 已实现待验证 | 15 mapping + 4 XML music-semantic tests pass; chord-tone slurs/pitchless notes now fail correctly. Broader uncommon-jump corpus still pending. |
| T03 | 已实现待验证 | UI setup/confirmation/solo/source note location, undo/redo, ZIP + raw editor source/OMR recovery, IndexedDB draft, per-lane invalidation; Chromium save/reopen/draft/invalidation passed. Real OMR roundtrip still pending. |
| T04 | 已实现待验证 | Shared TempoClock, repeat occurrences, numeric/dotted tempo, MIDI tempi, true selected-part playback, compiled PerformancePlan. Nine tempo + two performance tests pass. Broader jump/tie combinations remain to extend. |
| T05 | 已实现待验证 | Four-layer preview + PDF/PNG; independent mm/pt controls; measured ink clearances; 32-bar SATB browser test passed (12pt:4pages, 24pt:6pages). Source unchanged, simultaneous x aligned. Physical print/phone and wider curve fixtures pending. |
| T06–T13 | 未开始 | No MP3, microphone, scoring, sharing or deployment claim. |

Next: finish T05 ink/clearance/pagination/export regression; then T06 local sampled piano and worker MP3. User has no Supabase project and asked to continue local work; production sharing is deferred, not mocked as live.

Input commit for new data code: 5765be25. Commands/results: see ACCEPTANCE. Changes are additive src/choir and public tests; no OMR edits or dependency upgrades. Original source metadata is kept; unsupported anchors or unresolved voice data block projection instead of being discarded.


No implementation, deployment or physical-device acceptance is claimed merely from this document.

Commits: 5765be25 (execution/public-check foundation); 2163b2ec (mapping); a3099196 (project codec/browser baseline). Draft PR: https://github.com/Jiyu-666/dolce-choir/pull/1. Remote CI at a3099196 had passed install/typecheck/unit tests and was still building when observed; do not infer completion.

## 2026-11-06 continuation evidence
Input: 78274dbc. Outputs: 89db4d52 (musical ownership fixes), 7f888388 (session/project/draft), 9347580d (unified timing), c69242cc (setup UI).
Scope: choir modules, necessary playback/MIDI and editor hooks; no OMR rewrite or dependency upgrades.
Checks actually run under Node22: typecheck passed; 38/38 unit tests passed; Chromium baseline and setup/undo/redo/save/reopen/draft/source-invalidation passed before T05 changes. Latest build and T05 browser checks are still in progress.
Limits: no real microphone/phone/cloud verification, no complete v1 delivery claim.

T05 checks: 39 unit tests + Node22 typecheck/build passed; Chromium geometry and actual PDF/PNG downloads passed. The initial PDF test exposed a real CSS bug (absolute score SVG intercepted buttons); scoped choir SVG positioning fixed it, no forced-click bypass. Negative path-bound test runs in the browser because its real measurement backend is required.

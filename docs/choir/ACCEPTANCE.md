# Acceptance evidence

## Baseline
Upstream commit bb3333208d53b74bedb58b8530b1402eed54ed01; public repo lacks author's ../dev private tests. No upstream OMR regression corpus available.

## Music/data gate
Pending: explicit branches, chord ambiguity, metadata/marks, repeat/tempo and source immutability.

## Local practice gate
Pending: known pitches/timing, uncertainty/coverage, real microphone and latency.

## Physical devices and production
Not run: iPhone Safari, Android Chrome, desktop audio, ten-minute session, Supabase production create/resolve/revoke. Requires actual access, not emulation.

## 2026-11-06 implementation checkpoint
- Runtime: Node22.23.4; npm ci completed using upstream lockfile. System Node26 baseline also built, but project checks rerun with Node22.
- `node22 node_modules/typescript/bin/tsc --noEmit`: passed.
- `node22 node_modules/vitest/vitest.mjs run`: 19/19 passed (13 mapping tests, 2 project serialization tests, 4 MusicXML writer/playback integration tests).
- `node22 node_modules/vite/bin/vite.js build`: passed. Pre-existing opentype default-export and large-chunk warnings remain; no unrelated dependency updates made.
- `node22 tests/browser/smoke.mjs`: passed in installed Chromium1248; imports handmade SATB MusicXML, renders original staff then existing single-part mixed view. This is desktop automation, not physical-device acceptance.
- Mapping evidence: open/closed explicit lanes, sparse voice IDs, two staves/four voices, source immutability, unique derived IDs/provenance, stale/unconfirmed/missing mapping rejection, explicit chord-note allocation, duplicate/unison ownership, gap/key/lyrics/direction timing, octave clef, crossing voices, mark remap/cross-lane rejection, overlap rejection.
- Serializer evidence: source/mapping/layout/local OMR bytes roundtrip; stale source revision rejected.
- Not yet validated: full rhythm/repeat/tempo fixture matrix, malformed-file/resource-limit hardening, interactive setup/undo/draft recovery, derived layout, audio exports, microphone/scoring/sharing or any physical phone.

Additional integration evidence: 3/4, 4/4 and 6/8 derived scores roundtrip through the actual MusicXML writer and playback source to independently specified MIDI pitches [72,69,64,48] and durations. Section anchors remap after source element IDs change. This does not yet verify tempo-map/repeat occurrences.

## 2026-11-06 T03/T04 checkpoint (c69242cc)
- Node22 typecheck: passed. Unit suite: 38/38 passed (15 mapping, 4 project, 4 session, 9 tempo, 2 compiled performance, 4 XML semantics).
- Browser: actual setup, four role confirmations, undo/redo, .dolcechoir download and reopen, IndexedDB recovery after reload, S-only edit invalidates S while A/T/B remain confirmed: passed in Chromium1248.
- Timing: manually specified piecewise integration/inverse/speed; repeat target restores tempo; actual MusicXML repeat; later first tempo uses initial90; dotted-unit conversion; conflicts rejected; changing divisions and trailing silence; MIDI tempo tracks, selected part isolation and silent EOT: passed.
- Not evidence of physical audio output, smartphone mic, production deployment or full upstream private regression.

## T05 local geometry/export evidence
Node22: 39/39 tests, strict types and Vite production build passed. Chromium: four actual role labels/layers, mm/pt independent sizes, source immutability, synchronized chord x coordinates, actual freshly rendered ink agrees with pagination bounds, 4/8mm group clearances, 32-bar repagination from4 to6pages at12→24pt; PDF and PNG download signatures passed. Screenshots/exports under ignored out/browser. No physical print or mobile acceptance claimed.

## T06 local audio evidence
41/41 unit tests passed. Chromium actual ZIP download contains fourMP3/fourMIDI + licenses; MIDI onlytarget pitches[72,69,64,48], two tracks each including tempo track, GM piano program0. Short piano scale audible PCM peaks>0.01, decoded mono44.1kHz128kbps output;4s nominal→4.049s decoded. Silence2s→2.038s, peak0. A note straddling20s: chunked PCM exactly matched full render (max error0), including envelope/sample phase. Worker cancellation rejects AbortError. Ten-minute sparse sample:600.033s decoded,9,600,522bytes,about3.06s generation in desktopChromium. These are deterministic browser checks, not real phone listening or measured mobile RAM acceptance.

## T07 transport evidence
43/43 unit tests (including compound6/8 and resumed3/4 tempo count-in) passed; strict typecheck passed. Actual Chromium AudioContext/browser UI passed: defaults off, cue/count-in, pause/resume same attempt, complete, independent piano/click, role restart, each loop new attempt, frozen cloned plan, duplicate start protection, rewind to second bar and load its different cue pitch, context closes on dispose. Rendering clock driven by AudioContext; animations only display. No real phone or microphone claimed.

## T08 deterministic/browser evidence
Pitchy4.1.0:504stable synthetic windows across44.1/48kHz and65.4–1396.9Hz,allvalid/allwithin20c,max0.072cents. Silence/seededwhite-noise/isolatedimpact rejected; noisegate and window-center/gap tests passed. Strong second harmonic ratio8 returned octave-high (~+1200cents) in allfourstresscases; known limitation retained, no target-dependent folding. Non-isolated Chromium (Pages-like withoutSAB) actualWorklet/Worker/syntheticMediaStream: calibrationpassed,440Hzmax2.82c,medianpipeline lag42.7ms,congestiongapreported,permission-denial and track/worker cleanup passed. Synthetic stream is NOT physical microphone/device/human validation.

## Supplemental T04 timing regression
Added handwritten XML for first/second endings, D.C.alFine, D.S.alCoda, pickup/tie anchors, changed divisions + leading/trailing forward gaps + direction offsets. The changed-divisions case reproduced an upstream defect: phrase/jump adapters still used the first divisions and ignored explicit onset/trailing duration. Minimal fix updates active divisions and explicit cursor/duration; all68current tests passed afterwards. The new tie test's initial rest-anchor expectation was corrected: rests are not sung-onset anchors; both written tied notes remain separate anchors while sounding as one sustained note. No pre-existing assertion weakened.

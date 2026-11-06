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

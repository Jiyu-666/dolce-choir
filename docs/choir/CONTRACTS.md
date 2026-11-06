# Data contracts (v1)

- Source ScoreDoc is authoritative; ChoirMapping binds fixed S/A/T/B roles to source part ID + staff + voice, optionally explicit chord-note choices. A derived ScoreDoc has one monophonic part/staff per role. Derivation must not mutate source.
- Runtime provenance includes source revision + element ID + note index. Persistence also includes measure/entry structural locator and note-content signature; numeric IDs alone cannot survive reparsing. Source changes invalidate assets; affected bindings need confirmation.
- Mapping issues are structured codes with role/source locations. Confirmed flags do not override unresolved errors. Explicitly confirmed unison reuse is allowed; other duplicate ownership is an error.
- PerformancePlan is the shared authority for pitches, velocities, beat/second note intervals, numeric tempo events, clicks, rests, repeat occurrences, source links and revision. Repeat occurrences have distinct keys. Piecewise tempo integration; no guessed rit/rubato/fermata duration. Grace notes not scored.
- .dolcechoir ZIP: versioned manifest, source text/format, mapping, layout/practice defaults; optional original OMR project. Existing .dolce version is unchanged. Never serialize ScoreDoc class instances as JSON interchange.
- PracticePackageV1: title, schema/generator version, fingerprint, normalized SATB MusicXML, names/defaults/layout, localization and compiled performance data. Excludes original images, auth and recordings. Immutable sharing snapshots.
- PracticeResult: fingerprint, role/range/speed/attempt; effective evidence duration, cents/state and supported onset offsets, gaps/silence/pause and separate coverage/accuracy. Session only; no cloud result upload.
- Sharing: authenticated owner create/list/revoke, anonymous bearer-token POST resolve; private bucket, hashed token, no-store, revocation checked per resolve. Already downloaded content is not retractable.

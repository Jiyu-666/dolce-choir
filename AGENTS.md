# Dolce Choir agent contract

Read `docs/choir/{PLAN,CONTRACTS,STATUS,ACCEPTANCE}.md`, `CLAUDE.md`, and the relevant upstream module documentation before editing. Inspect branch, commit and dirty files; never overwrite another person's edits.

## Scope and sequence
T00 fork → T01 public checks → T02 voice normalization → T03 setup/project → T04 performance time → T05 mixed layout → T06 MP3/MIDI → T07 practice transport → T08 microphone → T09 comparison → T10 mobile → T11 sharing → T12 deployment → T13 physical-device acceptance.
Missing cloud credentials or physical devices block only dependent verification. Do useful independent work; never claim unavailable verification passed.

## Boundaries
- Keep TypeScript/Vite/native DOM/SVG and existing OMR. No framework replacement, incidental upgrades, unrelated refactors or formatting.
- One source ScoreDoc; SATB mapping derives a ScoreDoc. One performance plan drives playback/export/comparison. No separate pitch/rhythm guesses per consumer.
- Never silently select highest notes as voice separation, invent missing melody, or discard uncertain music. Block publication until ambiguity is resolved.
- Use existing XML parser. Keep source-element provenance. Invalidate derived assets when source changes.
- UI strings use zh/en i18n. Keep strict TypeScript. Never weaken assertions or rewrite expected results to hide regressions.
- Preserve upstream history/licensing and asset attribution. New dependencies must be locked and documented. No runtime CDN code.
- Never force push, rewrite existing history, leak credentials, upload recordings, enable paid services, or publish unconfirmed scores.
- Work sequentially unless the user explicitly authorizes delegation. A delegated task must own explicit files; collaborators must not revert each other's edits.

## Evidence and handoff
Each task records input/output commits, changed scope, commands actually run, results, limits and next step in STATUS. Allowed states: 未开始 / 进行中 / 已实现待验证 / 已验证 / 受阻.
A build is not functional verification; browser emulation is not a real phone; mocks are not deployed Supabase. Fixes start with a reproducer. Chinese commit subjects; no Co-Authored-By footer.

## Commands
Node 22; `npm ci`; `npm test`; `npm run typecheck`; `npm run build`; browser/integration commands must be added with their implementation. `npm run test:upstream` requires the author's unavailable private corpus, and is not a public CI gate.

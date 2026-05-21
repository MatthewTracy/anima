# Changelog

> Anima version history. Each entry summarizes what shipped and the primary reason it shipped. Dates trail commits; check `git log` for the precise timestamps.

---

## v1.1.4 – v1.1.70 — Audit hardening, live-game validation, public launch

A sustained audit pass over the whole framework: completing the atomic-write
migration so a crash can't corrupt shared state, closing TOCTOU races, fixing
latent crashes and silent-no-op bugs, and tightening contracts between what code
claims and what it does. Midway through, a live 10-minute Minecraft Forum game
was played end-to-end — it surfaced real bugs (death-cause attribution, motto
seeding, null LLM responses, a CI-hanging test) that pure code review had
missed. The run closes with the public OSS launch (MIT) and the repo-hygiene
that goes with it.

| Version | What shipped |
|---|---|
| v1.1.70 | Wire `ANIMA_STUB` through the cloister / crew / outpost runners so all four text scenarios verify end-to-end at zero LLM cost |
| v1.1.69 | Agent-layer unit tests — close the `src/agent/` coverage gap (mock-agent harness, +41 tests) |
| v1.1.68 | Add GitHub issue + PR templates |
| v1.1.67 | Backfill CHANGELOG: v1.1.4 through v1.1.66 (63 versions) |
| v1.1.66 | Purge stale closed-source text from README License section, .gitignore, docker-compose comment |
| v1.1.65 | CI: bump actions v4→v5, Node 20→22 |
| v1.1.64 | analyze_runs.js behavioral metrics read event faction fields — roster-agnostic |
| v1.1.63 | Null-content guard across the 9 remaining model wrappers (shared `normalizeContent` helper) |
| v1.1.62 | Public-repo accuracy: README status line + package.json license/repository/author |
| v1.1.61 | Cap CI job runtime (`timeout-minutes`) so a hung test can't burn 6h of Actions minutes |
| v1.1.60 | Live-run fixes: null-content guard (openrouter/deepseek), `.unref()` governance tick, deterministic pantheon test |
| v1.1.59 | Live Forum playthrough fixes: passive-death cause attribution + first-meaningful-sentence motto seeding |
| v1.1.58 | Wire up the four unused burden banks (cloister / crew / outpost / forum) |
| v1.1.57 | Depth-of-defense: validate `amount > 0` in tax payment + treasury distribution |
| v1.1.56 | Enforce Anarchy-only on `!claimBounty` (the description claimed it; no check existed) |
| v1.1.55 | Align `!searchForBlock` range domain with its description + companion command |
| v1.1.54 | Fix two bugs in skill_library's no-embedding fallback (vector passed as string; empty iteration) |
| v1.1.53 | Fix `\-` typo in `!stats` output that collapsed two lines into one |
| v1.1.52 | Fix `blacklistCommands` no-op — `delete` on a `find()` result does nothing |
| v1.1.51 | Fix tax-rate parser boundary (`1%` parsed as 100%) + a scenarios/forum link |
| v1.1.50 | Attach `behavioralMetrics` in `calculateScores` so sweep CSVs aren't empty |
| v1.1.49 | Fix order-of-ops: death cause read after the clear, so it was always 'unknown' |
| v1.1.48 | Fix `territory_hold` win condition when the leading faction changes directly |
| v1.1.47 | Gate scenario runners on `isMainModule` so importing them has no side effects |
| v1.1.46 | Defer the remaining six eager `openai` imports behind a shared lazy loader |
| v1.1.45 | Defer `openai` import in autobiographies.js (mirror of v1.1.35) |
| v1.1.44 | Guard `endConversation` against a null `activeConversation` |
| v1.1.43 | Fix two latent bugs in action_manager (undefined `assert` ref; stack-read after toString) |
| v1.1.42 | Apply self-prompter cooldown to the failure path, not just the success path |
| v1.1.41 | Fix `writeFileSync` misuse in prompter.js (sync API given an async callback) |
| v1.1.40 | Atomic writes for agent history + cooperative-task progress files |
| v1.1.39 | Atomic writes for the four cross-game scenario canon files |
| v1.1.38 | Atomic writes for shared governance state (mirror of the v1.1.5–v1.1.13 sweep) |
| v1.1.37 | First-person consolidation narrative + pantheon test-leak hardening |
| v1.1.36 | Make `pastLives()` cycle-safe — a cyclic reincarnation chain looped forever |
| v1.1.35 | Drop dead fs/path imports + defer the `openai` import in director.js |
| v1.1.34 | Backfill the central timescales index with pride / somatic / surprise constants |
| v1.1.33 | Fix library_search CLI silently dropping single-word queries |
| v1.1.32 | Surface Festinger dissonance + symmetric pride in the substrate inspector |
| v1.1.31 | Sweep remaining `X`/`Y`/`Z` test fixtures to `_Test*`-prefixed names |
| v1.1.30 | Rename test-fixture `X` / `irrelevant` bot dirs to underscore-prefixed names |
| v1.1.29 | CI: include the Cell scenario in syntax check + add a Windows test matrix |
| v1.1.28 | Fix a `.gitignore` inconsistency for PRIVATE_NOTES.md |
| v1.1.27 | Untrack pantheon.md (gitignored but still committed) |
| v1.1.26 | Extend the run_tests sweep to logs/ and pantheon.md |
| v1.1.25 | substrate-stats: faction distribution block |
| v1.1.24 | README for the (then-unused) core/burdens/banks/ directory |
| v1.1.23 | Restore 5 missing Outpost character profiles + a roster/profile regression test |
| v1.1.22 | atomicWriteFileSync: unique tmp names + Windows-transient rename retry |
| v1.1.21 | Surface spawn-level subprocess failures in the substrate inspector tools |
| v1.1.20 | Use `process.execPath` instead of bare `'node'` for `spawnSync` (nvm-safe) |
| v1.1.19 | Pantheon test cleanup: `restore()` deletes test-created files |
| v1.1.18 | Pantheon header-write TOCTOU fix (mirror of the v1.1.4 consolidation fix) |
| v1.1.17 | README placeholders for the empty core/witness/ and core/memoirs/ dirs |
| v1.1.16 | byTarget belief evidence emits factor tags symmetric to byActor |
| v1.1.15 | minecollab.md: banner flagging it as upstream Forum-only material |
| v1.1.14 | Rewrite FAQ.md to be Anima-first rather than inherited Mindcraft FAQ |
| v1.1.13 | Atomic writes for soul files (lineage / reincarnation / soul.js / faction) |
| v1.1.12 | README.md for the empty scenarios/forum/ directory |
| v1.1.11 | Gate top-level execution in replay.js + record.js on `isMainModule` |
| v1.1.10 | Fix the dead `npm run forum` script + add an npm-script hygiene test |
| v1.1.9 | DMN truncation made atomic + Persona drop/expose error-mode disambiguation |
| v1.1.8 | Fix `kept_rate` false-zero in the commitment ledger + drop unused imports |
| v1.1.7 | Sweep `atomicWriteFileSync` across the remaining per-agent state files |
| v1.1.6 | Extract the `atomicWriteFileSync` helper; apply it to BeliefTable |
| v1.1.5 | Atomic write for AffectLog — fixes corruption on a crash mid-write |
| v1.1.4 | Fix a TOCTOU race in consolidation's append-to-cortex header write |

---

## v0.45 – v1.0 — The cognitive substrate (thirteen layers + tooling)

A dense run of neuroscience-grounded primitives that turn a uniform belief table into a textured set of minds, plus the inspector / demo / diff tooling that makes the substrate legible. Every layer is documented with citations in [`docs/COGNITIVE_SUBSTRATE.md`](docs/COGNITIVE_SUBSTRATE.md).

| Version | What shipped | Brain analog |
|---|---|---|
| **v1.1.3** | Sync COGNITIVE_SUBSTRATE.md + CHANGELOG for v1.0–v1.1.2 | — (docs) |
| **v1.1.2** | substrate-stats: pride distribution alongside dissonance | — (debug tool) |
| **v1.1.1** | Pride section in soul evolution prompt | Festinger 1957 |
| **v1.1** | Pride detection in DMN (symmetric counterpart to dissonance) | Festinger 1957 (asymmetry) |
| **v1.0.3** | CONTRIBUTING.md substrate-extension checklist | — (docs) |
| **v1.0.2** | docs/CITATIONS.md bibliographic index | — (docs) |
| **v1.0.1** | Sync CHANGELOG + README to v1.0 | — (docs) |
| **v1.0.0** | Wire `AffectLog.decay()` between turns in all four scenarios — closes the last between-turn loop | Ebbinghaus |
| **v0.99** | substrate-stats: TRUST-AXIS POLARITY block (optimist / balanced / pessimist / no-DNA) | — (debug tool) |
| **v0.98** | inspector: name the Russell circumplex quadrant for the mood | — (debug tool) |
| **v0.97** | inspector: label trust axis as OPTIMIST / PESSIMIST | — (debug tool) |
| **v0.96** | timescales.js: add v0.93 optimism constants | — (refactor) |
| **v0.95** | Composition test extended to verify 6th factor (optimism) | — (test) |
| **v0.94** | Sync COGNITIVE_SUBSTRATE.md + CHANGELOG for v0.87–v0.93 | — (docs) |
| **v0.93** | Optimism / pessimism bias on belief deltas — 6th per-event factor | Sharot 2011 |
| **v0.92** | docs/SCRIPTS.md adds substrate-stats | — (docs) |
| **v0.91** | `npm run substrate-stats` — cohort aggregate analytics | — (debug tool) |
| **v0.90** | `docs/SCRIPTS.md` catalogues all 27 npm scripts | — (docs) |
| **v0.89** | `npm run timescales` — print substrate tuning constants | — (debug tool) |
| **v0.88** | Full multiplicative pipeline composition test | — (test) |
| **v0.87** | Sync CHANGELOG + README to v0.86 | — (docs) |
| **v0.86** | `core/cognition/timescales.js` — central re-export index of every substrate constant + `asReport()` | — (refactor) |
| **v0.85** | `npm run substrate-all` — cohort-wide inspector across every agent in `bots/` | — (debug tool) |
| **v0.84** | README Quickstart leads with the free `substrate-demo` / inspect / diff tools | — (docs) |
| **v0.83** | inspector: per-event-type habituation / sensitization arrows | — (debug tool) |
| **v0.82** | `substrate-demo` includes `substrate-diff` at the end — both tools, one command | — (showcase) |
| **v0.81** | substrate-wide smoke test: every event type + 6 edge cases | — (test) |
| **v0.80** | inspector: surface active persona mask | — (debug tool) |
| **v0.79** | Persona masks slip under acute load: composes v0.26 + v0.56 | Goffman 1959 |
| **v0.78** | Refactor: `core/cognition/dissonance.js` — shared Festinger detector for DMN + evolution | — (refactor) |
| **v0.77** | Festinger rationalization in soul evolution: `$DISSONANCE` placeholder | Festinger 1957 |
| **v0.76** | Flashbulb-memory override on mood-congruent retrieval | Brown & Kulik 1977 |
| **v0.75** | Sync COGNITIVE_SUBSTRATE.md / CHANGELOG with v0.71/v0.73/v0.74 | — (docs) |
| **v0.74** | DMN cognitive dissonance line: scans recent role='actor' negative-valence entries | Festinger 1957 |
| **v0.73** | Stress-induced narrowing: under allostatic load, $BELIEFS cap shrinks 9 → 3 | Easterbrook 1959 / Kahneman 1973 |
| **v0.72** | `scripts/substrate_diff.js` + `npm run substrate-diff -- A B` — side-by-side cognitive comparison | — (debug tool) |
| **v0.71** | Dishabituation: novel events reset habituation streams for other types | Kandel 1968 / Groves & Thompson 1970 |
| **v0.70** | DMN verb perspective: `'self'` vs `'other'` so vicarious phrasing doesn't say "against me" | — (synthesis) |
| **v0.69** | `npm run substrate-demo` — three synthetic agents, five events, twelve layers | — (showcase tool) |
| **v0.68** | Sync README, COGNITIVE_SUBSTRATE.md, CHANGELOG to reflect v0.66/v0.67 | — (docs) |
| **v0.67** | Working memory cap on `$BELIEFS`: top-9 by `\|trust\|` visible, rest backgrounded | Miller 1956 |
| **v0.66** | `CHANGELOG.md` — version cadence at a glance | — (docs) |
| **v0.65** | `run_tests.js` sweeps stray bot dirs after the suite | — (test hygiene) |
| **v0.64** | Renamed Brutus / Iago / Saul / Octavia in tests to `_Test`-prefixed names | — (test hygiene) |
| **v0.63** | `scripts/inspect_substrate.js` + `npm run substrate` — one-shot read-only report covering all 11 substrate layers | — (debug tool) |
| **v0.62** | Refactor: extracted `_scaleByWitness` helper to deduplicate the byActor / byTarget paths | — (refactor) |
| **v0.61** | README: cognitive-substrate section + COGNITIVE_SUBSTRATE.md link | — (docs) |
| **v0.60** | Soul evolution prompt surfaces `$STRESS` and role-tagged affect | — (LLM-visible signal) |
| **v0.59** | `$MOOD` placeholder prefixes role: `(to me)` / `(my hand)` / `(felt with)` / `(felt against)` | — (LLM-visible signal) |
| **v0.58** | Refresh COGNITIVE_SUBSTRATE.md to cover v0.52 – v0.57 | — (docs) |
| **v0.57** | `tickRecovery(roster)` between turns + `$STRESS` placeholder in all four text scenarios | — (wiring) |
| **v0.56** | Allostatic load: per-agent stress reservoir; DMN voice changes when overloaded | McEwen 1998 |
| **v0.55** | Somatic markers: value-aligned arousal amplification (mercy/justice/etc.) | Damasio 1994 |
| **v0.54** | DMN role-aware phrasing — vicarious entries get distinct narrative voicing | — (synthesis) |
| **v0.53** | Vicarious affect / empathy: prior-trust > 0.4 in target → empathic registration replaces bystander | Preston & de Waal 2002 |
| **v0.52** | Mood-congruent memory retrieval: sad mood surfaces sad memories first | Bower 1981 / Eich 1995 |
| **v0.51** | First COGNITIVE_SUBSTRATE.md doc (covered v0.45 – v0.50 only) | — (docs) |
| **v0.50** | Habituation / sensitization: Kandel-style response curves per witness × event type | Kandel 2001 |
| **v0.49** | Default Mode Network: deterministic between-turn rumination → `$MUSINGS` | Raichle 2001 |
| **v0.48** | In-group bias: Tajfel-style asymmetric belief deltas by faction | Tajfel 1971 |
| **v0.47** | Predictive coding: trust × valence sign-disagreement amplifies updates 1.0–2.5× | Friston 2010 |
| **v0.46** | Sleep-style memory consolidation: hippocampus → cortex transfer between games | Born & Wilhelm 2012 |
| **v0.45** | Affect tagging: per-event valence/arousal, AffectLog, mood circumplex labels | Cahill & McGaugh 1998 |

The full per-event multiplicative pipeline after v0.55: `nominal × affect × surprise × ingroup × habit × somatic`.

---

## v0.32 – v0.44 — Audit / quality phase

Quality-over-quantity audit cycle that fixed real bugs and wiring gaps in the substrate shipped during v0.6 – v0.32.

| Version | What shipped |
|---|---|
| **v0.44** | Burden confession wired into Cloister as `confess_burden` action |
| **v0.43** | Forum init_message expands `$GAME_DURATION` |
| **v0.42** | Tests no longer pollute `pantheon.md` (introduced `ANIMA_NO_PANTHEON=1`) |
| **v0.41** | (skipped) |
| **v0.40** | Director opt-in wiring for Cloister + Outpost |
| **v0.39** | Commitments wired into Crew with auto-deadline-sweep |
| **v0.38** | Persona masks wired into Cell scenario |
| **v0.37** | publish_game roster auto-discovery + Stub robustness |
| **v0.36** | Pantheon append is now race-safe (atomic appendFileSync) |
| **v0.35** | Soul DNA handles negation correctly ("never leave my comrades") |
| **v0.34** | Cell + Cloister missing event weights filled in |
| **v0.33** | Cloister + Outpost surface all primitives in prompts |

---

## v0.6 – v0.32 — Substrate primitives (Anima as a substrate, not just a scenario)

The keystone-and-primitives phase. Soul mechanic + 13 supporting primitives + 5 reference scenarios + tests + CI.

| Version | What shipped |
|---|---|
| **v0.32** | Reincarnation: locked souls return as new agents |
| **v0.31** | Soul DNA: value-vector extraction from souls |
| **v0.30** | 55 tests passing |
| **v0.29** | Cell scenario (5th reference, wartime resistance) |
| **v0.28** | The Library: searchable corpus of accumulated narrative |
| **v0.27** | Stub LLM: deterministic, zero-cost LLM substitute for testing |
| **v0.26** | Persona masks: active impersonation primitive |
| **v0.25** | The Director: separate LLM injecting dramatic events |
| **v0.24** | GitHub Actions CI: syntax check + tests on every PR |
| **v0.23** | First test pass — 25 tests for `core/` primitives |
| **v0.22** | Burden confession mechanic: hidden → public |
| **v0.21** | auto_update parity for Cloister + Outpost |
| **v0.20** | OSS launch files: LICENSE, CONTRIBUTING, SECURITY, COC |
| **v0.19** | Demo cohort: pre-baked artifacts + example issue |
| **v0.18** | Feud tracker: cross-game antagonism graph |
| **v0.17** | README rewritten |
| **v0.16** | publish: turn one game's outputs into a single shareable issue |
| **v0.15** | Synthesis layer: soul evolution reads ALL primitives |
| **v0.14** | Burden: hidden per-agent state |
| **v0.13** | The Pantheon: cross-scenario shared mythology |
| **v0.12** | Temporal depth: versioned soul history |
| **v0.11** | auto_update: events mechanically update beliefs |
| **v0.10** | Crew scenario (4th reference, pirate ship) |
| **v0.9**  | Lineage: successors who inherit from the dead |
| **v0.8**  | RecursiveBeliefTable: depth-2 theory of mind |
| **v0.7**  | CommitmentLedger: bilateral promise tracking |
| **v0.6**  | Theory of Mind: BeliefTable primitive |

---

## v0.2 – v0.5 — Foundations

| Version | What shipped |
|---|---|
| **v0.5** | Outpost scenario (3rd reference, sci-fi survival) |
| **v0.4** | Internal documentation |
| **v0.3** | Cloister scenario (2nd reference, monastery) |
| **v0.2** | Soul mechanic — the keystone (persistent, evolves at game-end, locks at death) |

---

## Format note

Entries are reverse-chronological per phase. The Cognitive Substrate phase is broken out separately because it represents a distinct architectural axis (deterministic per-event/between-event mechanics layered under the LLM-visible primitives), and because each layer is independently citeable.

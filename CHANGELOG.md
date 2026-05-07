# Changelog

> Anima version history. Each entry summarizes what shipped and the primary reason it shipped. Dates trail commits; check `git log` for the precise timestamps.

---

## v0.45 – v0.86 — The cognitive substrate (twelve layers + tooling)

A dense run of neuroscience-grounded primitives that turn a uniform belief table into a textured set of minds, plus the inspector / demo / diff tooling that makes the substrate legible. Every layer is documented with citations in [`docs/COGNITIVE_SUBSTRATE.md`](docs/COGNITIVE_SUBSTRATE.md).

| Version | What shipped | Brain analog |
|---|---|---|
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

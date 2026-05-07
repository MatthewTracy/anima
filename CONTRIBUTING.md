# Contributing to Anima

Welcome — and thank you for considering a contribution.

Anima is a multi-agent LLM simulation framework with persistent souls. The substrate is small but opinionated. Most contributions fall into one of three buckets: **scenarios**, **primitives**, or **tooling**.

## Quick map of where things live

```
core/                          — the framework (scenario-agnostic)
  souls/      souls + lineage + pantheon + evolution
  beliefs/    BeliefTable + RecursiveBeliefTable + auto_update
  burdens/    hidden per-agent state + scenario burden banks
  feuds/      cross-game antagonism graph
  commitments/ binding IF/THEN promises
  memoirs/    endgame autobiographies
scenarios/                     — playable worlds
  forum/      Minecraft governance simulation
  cloister/   text-only monastery
  outpost/    text-only sci-fi station
  crew/       text-only pirate ship
adapters/                      — embodiment + LLM provider abstractions
scripts/                       — utilities (souls, feuds, publish, demo)
docs/                          — architecture, scenario authoring, soul mechanic
examples/                      — pre-baked artifact (demo issue)
```

Read `docs/SOUL_MECHANIC.md` first. It's the conceptual core.

## Adding a new scenario

The smallest viable scenario is ~500 lines. Cloister and Outpost are good references.

You'll need:
- `scenarios/<name>/scenario.json` — manifest (name, roster, model, durations, paths)
- `scenarios/<name>/<state>.js` — pure-JS state model (no LLM, no I/O outside scripture-style persistent files)
- `scenarios/<name>/runner.js` — LLM-loop orchestrator
- `scenarios/<name>/characters/*.json` — one per character with system_prompt_prefix + voice + access

The two non-negotiables in the runner:
1. **Seed souls at first run** — call `Soul.seed()` for every roster member who doesn't yet have one
2. **Evolve souls at game end** — call `evolveAllSouls(gameLoggerShim, roster)` after manuscript + memoirs

See `docs/SCENARIO_AUTHORING.md` for the full guide.

## Adding a new primitive to `core/`

Primitives are first-class state layers — like souls, beliefs, commitments, burdens. Each lives in its own subdirectory of `core/`.

If you're adding a primitive that produces a `$PLACEHOLDER` for prompts:
1. Implement the class with `read`, `save`, and `asPromptText(agentName)` methods
2. Add the placeholder substitution to `src/models/prompter.js` (Forum) and to each scenario's `buildPrompt()`
3. Update `docs/SOUL_MECHANIC.md` table with the new layer
4. If the primitive has runtime updates from witness events, hook into `core/beliefs/auto_update.js`
5. If the primitive should be visible in `npm run souls` or similar inspector scripts, extend the inspector

If your primitive holds **hidden** state (only visible to one agent), follow the `Burden` pattern for privacy by construction.

## Adding a new cognitive substrate layer (v0.45+ pattern)

The cognitive substrate (see [`docs/COGNITIVE_SUBSTRATE.md`](docs/COGNITIVE_SUBSTRATE.md)) sits under the visible primitives — neuroscience-grounded mechanisms that shape *how* belief deltas land, *what* gets remembered, *how* the body wears, and *what voice* the agent carries forward. Adding a new layer requires updating SIX surfaces in lockstep, otherwise some part of the substrate will silently lag the new mechanic:

1. **Implementation** — your module lives under `core/affect/`, `core/cognition/`, or `core/identity/` depending on its primary responsibility. Export `_CONSTANTS` for any tunable thresholds so future tuning passes can find them.
2. **Wiring** — if your layer is a per-event factor in the multiplicative chain, hook into `_scaleByWitness` in `core/beliefs/auto_update.js` and add an evidence tag (`name ×N.NN`) when the factor is non-trivial.
3. **Tests** — `tests/core_<name>.test.js` for the primitive itself; if it composes with the per-event chain, also extend `tests/substrate_composition.test.js` to include your factor.
4. **Timescales** — add re-exports in `core/cognition/timescales.js` and update `asReport()` so `npm run timescales` shows your constants alongside the others.
5. **Inspector** — `scripts/inspect_substrate.js` should surface your layer's state. If your layer aggregates well across a roster, also extend `scripts/substrate_stats.js`.
6. **Docs** — update `docs/COGNITIVE_SUBSTRATE.md` (pipeline diagram + new section), `docs/CITATIONS.md` (your paper), `README.md`'s substrate-layer table, and `CHANGELOG.md`.

The `v0.93 → v0.94 → v0.95 → v0.96 → v0.97 → v0.98 → v0.99` retrofit chain (optimism bias) demonstrates this workflow end-to-end.

## Style

- **JS, ESM**, 4-space indent, single quotes
- Comments only for *why*, not *what* — the code says what
- Each module starts with a short header comment explaining its purpose and how it composes with the rest
- Tests in `tests/` (when they exist) using `node --test`
- `node --check <file>` should pass on every commit

## Pull request process

1. Fork, branch, make your change
2. Run `node --check` on every modified file
3. If you added a primitive, add a brief functional test in `tests/`
4. Commit with a `vX.Y.Z` version-prefixed subject + 2-3 line body explaining the why
5. Push, open a PR, link the relevant issue if one exists
6. CI will run `node --check` on all `.js` files; tests will run if you added any

## What we'll happily accept

- New scenarios with distinct mechanics + character archetypes
- New primitives that fill a gap in the substrate
- Documentation improvements, especially for `SCENARIO_AUTHORING.md`
- New LLM provider adapters in `adapters/llm/`
- Tests for existing modules
- Better default burden banks for any scenario

## What we'll likely push back on

- Changes to the soul mechanic itself (`core/souls/soul.js` save/lock/seed) without a written justification — these affect everything downstream
- New dependencies without a clear value-vs-weight argument
- Features that bypass the visibility regime of an existing primitive (e.g. a way to read another agent's burden externally)
- Anything that hard-couples a scenario to another scenario

## Reporting bugs

Open a GitHub issue with:
- What scenario you ran
- What you expected
- What happened
- The relevant snippet from the manuscript or soul (please redact API keys)

## Reporting security issues

Don't open a public issue. See `SECURITY.md`.

## Code of conduct

See `CODE_OF_CONDUCT.md`. Short version: be kind, be specific, assume good faith.

---

Thanks for being here. The most distinctive thing this project produces is character drift in souls — if you've got an idea that would push that further, we want it.

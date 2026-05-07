# Anima Architecture

> The shape of the codebase, what each layer does, and how scenarios plug in.

## Three-layer model

```
┌─────────────────────────────────────────────────────────┐
│  scenarios/   — what the agents are doing right now    │
│  forum/         (Minecraft governance)                  │
│  cloister/      (text-only monastery)                   │
│  ...            (your scenario goes here)               │
├─────────────────────────────────────────────────────────┤
│  core/        — the framework. Scenario-agnostic.      │
│  souls/         soul.md, lock-on-death, evolution      │
│  witness/       cross-agent action broadcast            │
│  memoirs/       endgame first-person reflection         │
│  runtime/       budget, event bus, scenario API        │
├─────────────────────────────────────────────────────────┤
│  adapters/    — how souls reach the world              │
│  embodiment/    minecraft (mineflayer), text (LLM-only) │
│  llm/           openrouter, anthropic, openai           │
└─────────────────────────────────────────────────────────┘
```

The promise: **a scenario depends only on `core/` and `adapters/`, never on another scenario.**

## What lives where

### `core/souls/`
The keystone. See `docs/SOUL_MECHANIC.md` for the full theory.

- `soul.js` — Soul class (seed, read, save, lock, format, list, roster)
- `evolution.js` — end-of-game soul rewriter (one LLM call per survivor)
- `templates/default_soul.md` — initial soul template
- `templates/evolution_prompt.md` — the prompt that drives soul evolution

### `core/witness/`
Inherited from `governance-game` v12. Agents broadcast physical actions; receivers within proximity see `[SAW]` events. Foundational for credible accusations across all scenarios.

(Currently `src/agent/witness.js` and `src/agent/mindserver_proxy.js` — will move under `core/witness/` when the Forum refactor lands.)

### `core/memoirs/`
Endgame first-person reflection. Lighter touch than soul evolution; produces shareable artifacts per game.

(Currently `src/governance/autobiographies.js` — will move under `core/memoirs/`.)

### `core/runtime/`
Scenario-agnostic infrastructure: budget guard, scenario API, event bus.

### `core/affect/`, `core/identity/`, `core/cognition/`
The cognitive substrate. Six neuroscience-grounded layers (amygdala, consolidation, predictive coding, in-group bias, DMN, habituation) that turn a uniform belief table into a textured set of minds. See [COGNITIVE_SUBSTRATE.md](COGNITIVE_SUBSTRATE.md) for citations and the composition order.

### `scenarios/forum/`
The Minecraft governance simulation. Inherits the v11+v12 work from `governance-game`.

(Currently still living in `src/governance/`, `src/agent/commands/`, etc. Refactor pending.)

### `scenarios/cloister/`
Pure-text monastery. Self-contained: state manager + LLM-loop runner + 6 character profiles + persistent scripture. Demonstrates Anima can run without Minecraft.

### `adapters/embodiment/`
- `minecraft/` — mineflayer wrapper (currently in `src/mindcraft/`)
- `text/` — pure-text "embodiment" — agents only speak, no physical world

### `adapters/llm/`
- OpenRouter, Anthropic, OpenAI — LLM provider abstractions

## The scenario API (target)

Each scenario exports a manifest:

```json
{
    "name": "cloister",
    "embodiment": "text",
    "duration_turns": 24,
    "roster": ["Gregory", "Anselm", ...],
    "model": "deepseek/deepseek-chat"
}
```

And implements a runner. The runner's responsibilities:
- Seed souls if needed (call `Soul.seed()` for first-time agents)
- Build prompts that include `$SOUL` and `$LEGENDS`
- Drive the turn loop
- Apply actions to scenario state
- At end: write outputs (manuscript / autobiographies / etc), lock dead souls, evolve survivor souls via `evolveAllSouls()`

This contract is informal right now. As of v0.3, scenarios talk to the framework only via the `Soul` class. As more scenarios land, the contract will formalize.

## Migration plan (in progress)

The current repo inherits the entire `governance-game` directory layout. Files under `src/` are mostly Forum-specific but a few are framework. The migration:

| File | Stays / Moves |
|---|---|
| `src/governance/governance_manager.js` | → `scenarios/forum/governance_manager.js` |
| `src/governance/law_parser.js` | → `scenarios/forum/law_parser.js` |
| `src/governance/narrative_logger.js` | → `scenarios/forum/narrative_logger.js` |
| `src/governance/post_game_summary.js` | → `scenarios/forum/post_game_summary.js` |
| `src/governance/session_journal.js` | → `scenarios/forum/session_journal.js` |
| `src/governance/game_clock.js` | → `core/runtime/game_clock.js` (after generification) |
| `src/governance/game_logger.js` | → `core/runtime/game_logger.js` |
| `src/governance/budget_guard.js` | → `core/runtime/budget_guard.js` |
| `src/governance/autobiographies.js` | → `core/memoirs/autobiographies.js` |
| `src/agent/witness.js` | → `core/witness/witness.js` |
| `src/agent/mindserver_proxy.js` | → `core/witness/proxy.js` (parts) + `adapters/embodiment/minecraft/proxy.js` |
| `src/agent/commands/governance.js` | → `scenarios/forum/commands/governance.js` |
| `src/agent/commands/anarchy.js` | → `scenarios/forum/commands/anarchy.js` |
| `src/agent/commands/index.js` | → `core/commands/dispatcher.js` (after generification) |
| `src/mindcraft/` | → `adapters/embodiment/minecraft/` |
| `profiles/constitutional/*` | → `scenarios/forum/factions/settlers/*` |
| `profiles/anarchy/*` | → `scenarios/forum/factions/predators/*` |

This will happen incrementally. The Cloister scenario already lives in the right place. The Forum migration is deferred until: (a) souls prove themselves in validation runs, (b) we add a third scenario that forces final cleanup.

## Why the migration is deferred

Refactoring 30+ files at once while souls are unproven is high-risk, low-reward. The current setup is messy but working. Once we observe 5+ Forum games where souls evolve interestingly, we know the mechanic is real and worth investing the refactor effort in. Until then: ship, validate, iterate.

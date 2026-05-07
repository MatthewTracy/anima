# Authoring an Anima Scenario

> How to build a new scenario on Anima's soul mechanic.

## What a scenario is

A self-contained world that 4-8 agents inhabit, with:
- A roster of characters (each with a profile)
- A state model (what's happening, what can happen)
- A turn loop or real-time loop
- End conditions
- Output artifacts (manuscripts, memoirs, scripture, etc)

A scenario is **not** a script. The agents decide what they do; the scenario provides the constraints, mechanics, and consequences.

## Two reference scenarios

- **Forum** — Minecraft, real-time, embodied, political. Demonstrates Anima with rich physical world.
- **Cloister** — Text-only, turn-based, narrative, monastic. Demonstrates Anima without any embodiment. Reference for any text scenario.

Read `scenarios/cloister/runner.js` first. It's the smallest end-to-end scenario.

## The minimum viable scenario

Three files:

```
scenarios/<your_scenario>/
    scenario.json    — manifest (name, roster, model, durations, paths)
    state.js         — your scenario's state model (vanilla JS class)
    runner.js        — the orchestrator (LLM loop + state mutation + outputs)
    characters/
        <name>.json  — one per character (system_prompt_prefix, voice, etc)
```

Optional:
- `scripture.md` (or any persistent file) — content that survives across games
- `commands.js` — if you want a cleaner separation between actions and state

## The two non-negotiables

**1. Seed souls at first run.** Before the loop starts, for every character in the roster:
```js
import { Soul } from '../../core/souls/soul.js';
const soul = new Soul(name);
if (!soul.exists() && !soul.isLocked()) {
    soul.seed({ personality_seed, starting_motto, faction });
}
```

**2. Evolve souls at game end.** After the loop ends:
```js
import { evolveAllSouls } from '../../core/souls/evolution.js';
await evolveAllSouls(gameLoggerShim, roster);
```

`gameLoggerShim` is any object with an `events` array of `{ type, elapsed_ms, ...details }`. The Cloister runner shows the smallest possible shim:
```js
function asGameLoggerShim(monastery) {
    return { events: monastery.events };
}
```

That's it. Souls take care of themselves: read at every prompt, evolved at end, locked at death. You just have to call the seed and the evolve at the right moments.

## How to build a prompt

For each agent's turn, build a prompt that includes:
1. **`Soul.asPromptText()`** — who they are, frozen or evolving
2. **`rosterAsLegends(thisAgentName)`** — who else exists, alive or locked
3. **The character's profile flavor** — voice, role, secret if any
4. **The scenario state** — what's happening right now
5. **Any persistent canon** — scripture, constitution, whatever
6. **The turn prompt** — a JSON-shaped action request

See `scenarios/cloister/runner.js#buildPrompt()` for the canonical example.

## Action format

Anima doesn't prescribe the action format. The Cloister runner uses JSON-shaped actions:
```json
{"type":"preach","topic":"doubt","text":"..."}
```
Forum uses string commands:
```
!callElection("president")
```
Pick whatever's natural for your scenario. Just be consistent.

## End conditions

Always have at least one terminator. Cloister uses three:
- Timeout (`turn >= duration_turns`)
- Schism (doctrinal split exceeds threshold)
- Collapse (active roster too small)

If your scenario has no natural end, default to a turn-count timeout.

## Output artifacts

Three things every scenario should produce:

1. **A manuscript / chronicle** — markdown file describing what happened. Saved to `logs/<scenario>/<timestamp>.md`. Forum calls this the post-game summary; Cloister calls it the manuscript.
2. **Per-agent memoirs** — first-person 200-word reflections. Saved to `logs/<scenario>/memoirs/<name>.md`.
3. **Soul evolution** — handled automatically by `evolveAllSouls()`. You just call it.

## What NOT to do

- **Don't author the souls.** Seed them once with a personality_seed (drawn from the character's profile) and let the LLM evolve them. If you over-author, you suppress emergence.
- **Don't reset souls between games.** Souls persist on disk by design. To start fresh, manually delete `bots/<name>/`.
- **Don't write to a locked soul.** The Soul class will throw. Locked is locked.
- **Don't skip the evolution step.** If you don't call `evolveAllSouls()`, agents won't change between games — and the whole point of Anima is that they do.

## Rough effort estimate for a new scenario

| Scope | Effort |
|---|---|
| Tiny text scenario (4 characters, ~20 turns) | 4-6 hours |
| Medium scenario (6 characters, custom mechanics, persistent canon) | 1-2 days |
| Embodied scenario (uses an adapter, e.g. Minecraft, web, terminal RPG) | 3-5 days |

The Cloister scenario was ~500 lines of code. Use it as your reference for size.

## Ideas for future scenarios

- **Bazaar** — trading post. Markets, debt, hoarding, crashes.
- **Crew** — pirate ship. Captain elections, mutiny, divided plunder.
- **Cohort** — research lab. Credit games, paper feuds, replication crises.
- **Hearth** — small village. Marriage, kinship, feuds across generations.
- **Cell** — wartime resistance. Informants, captured comrades.
- **Court** — royal court. Intrigue, succession, dynasty.

Each of these has a distinct flavor that would produce different soul evolution patterns. Across many scenarios you'd see how an agent's identity drifts based on what kinds of stakes it faces — which is itself a research question worth answering.

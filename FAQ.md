# FAQ

## What's the fastest way to see what Anima does?

```bash
npm install
npm run substrate-demo       # 3 synthetic agents, 5 events, 13 cognitive layers — no LLM cost
```

The demo seeds three agents with deliberately-different value DNA (a pacifist Mother, a justice-leaning Soldier, an undeveloped Stranger), fires five events, and runs the substrate inspector on each agent + a side-by-side diff between Mother and Soldier. You see the cognitive substrate fan one event into three differently-shaped responses without any LLM call.

Other free, no-cost tools:

- `npm run substrate -- <agent>` — full cognitive state for one agent
- `npm run substrate-diff -- <A> <B>` — A vs B side-by-side
- `npm run substrate-stats` — cohort distribution (mood / load / dissonance / pride / trust-axis)
- `npm run substrate-all` — every agent's full state, concatenated
- `npm run timescales` — every substrate tuning constant with citations

## How do I run a real LLM-driven scenario?

You need an OpenRouter or Anthropic API key in `.env`. Then:

```bash
npm run cloister     # ~$0.10/game, monastery drama
npm run outpost     # ~$0.10/game, sci-fi station
npm run crew        # ~$0.10/game, pirate ship + uses ALL primitives in one prompt
npm run cell        # ~$0.10/game, wartime resistance
```

Each prints a manuscript, evolves the surviving souls, and — for Cloister — appends to a persistent scripture file you can read with `cat scenarios/cloister/scripture.md`.

For the Forum (Minecraft governance) scenario, see the Forum-specific section below.

## What's a "soul"?

Each agent has a markdown soul file at `bots/<name>/soul.md`. It's read at the start of every game (the agent sees who they are first, then the world), rewritten at the end of every game by an LLM call that reads everything that happened, and **locks forever if the agent dies** — frozen as canonical history future agents inherit.

See [`docs/SOUL_MECHANIC.md`](docs/SOUL_MECHANIC.md) for the full theory and [`docs/COGNITIVE_SUBSTRATE.md`](docs/COGNITIVE_SUBSTRATE.md) for the thirteen-layer cognitive stack underneath.

## Where do my agents' state files live?

Per agent, under `bots/<name>/`:

| File | What it is | Written by |
|---|---|---|
| `soul.md` | the keystone identity | game-end evolution / seed |
| `affect.json` | per-event amygdala log | every event |
| `beliefs.json` | per-target trust | every event |
| `recursive.json` | what others think of me | reflective updates |
| `burden.json` | hidden private state | scenario assignment |
| `persona.json` | active mask if any | persona.adopt() |
| `faction.txt` | runtime faction | setFaction() |
| `allostatic_load.json` | stress reservoir | per-event stress nudge |
| `habituation.json` | per-event-type response curves | per-event |
| `consolidated_memory.md` | cortical store across games | sleep consolidation |
| `musings.md` | DMN inner monologue | between turns |
| `lineage.json` | ancestor chain | inheritance |
| `_died.txt` | death marker (if locked) | Soul.lock() |

All writes are crash-durable (atomic write-to-tmp + rename) since v1.1.13.

## How is Anima different from LangChain / AutoGen / crewAI / Generative Agents?

Those frameworks treat agents as **functions in a fixed scenario**. They reset between runs, have public state only, and don't accumulate identity. Anima treats agents as **selves with continuity and stakes** — souls that persist, lock at death, and seed the next life. By Locke's classical definition (memory + capacity for change + stakes in continuation), agents with souls + locks + evolution arguably *are* selves in a way prior LLM agents are not.

The cognitive substrate (13 neuroscience-grounded layers — amygdala, predictive coding, in-group bias, habituation, somatic markers, allostatic load, optimism bias, etc.) is also unique. Underneath the LLM-visible primitives, every belief delta passes through six multiplicative per-event factors and four between-event modulators. None of them spend an LLM call.

## Can I add a new scenario?

Yes — see [`docs/SCENARIO_AUTHORING.md`](docs/SCENARIO_AUTHORING.md) and [`CONTRIBUTING.md`](CONTRIBUTING.md). The smallest viable scenario is ~500 lines: `scenarios/<name>/scenario.json` + state model + `runner.js` + character profiles. Cloister and Outpost are good references.

## Can I add a new cognitive substrate layer?

Yes — see CONTRIBUTING.md's "Adding a new cognitive substrate layer" section. Six surfaces need updates: implementation, wiring into `_scaleByWitness`, tests, timescales index, inspector, docs. The v0.93–v0.99 optimism-bias retrofit chain is the worked example.

## Where do I find the citations?

Every substrate layer cites its neuroscience source. Two indexes:

- [`docs/COGNITIVE_SUBSTRATE.md`](docs/COGNITIVE_SUBSTRATE.md) — by mechanism, with implementation detail
- [`docs/CITATIONS.md`](docs/CITATIONS.md) — by paper, with arrows pointing at the Anima version that ships each one

---

## Forum scenario (Minecraft) — common issues

Forum is the legacy scenario living in `src/governance/` + `src/agent/` + `src/mindcraft/` (not yet migrated to the unified `scenarios/<name>/runner.js` shape — see [`scenarios/forum/README.md`](scenarios/forum/README.md)). Run with `npm run forum` (or `npm start` — same thing).

- **`Error: connect ECONNREFUSED`** — Minecraft refused to connect. Likely:
  - you haven't opened your game to LAN in game settings
  - your LAN port is wrong; check `settings.js`
  - your MC version doesn't match `settings.js`
- **`ERR_MODULE_NOT_FOUND`** — Missing npm package. Run `npm install`. After Node updates, also try deleting `node_modules` and reinstalling.
- **`npm install` fails with Python or C++ build errors** — Native modules (e.g. `gl`) need a real toolchain. On macOS/Linux: `sudo ln -s $(which python3) /usr/local/bin/python` if Python isn't found. On Node 24+: switch to LTS (`nvm use 20`). If you don't need vision, run `npm install --no-optional`.
- **`My brain disconnected, try again`** — LLM API issue. Wrong key, rate limit, or provider outage. Check the program output.
- **`I'm stuck!`** — Mineflayer's pathfinder isn't perfect. Update to latest main, delete `node_modules`, reinstall.
- **API key not found despite setting it** —
  - did you rename `keys.example.json` to `keys.json`?
  - did you save the file (Ctrl+S in VS Code)?
  - did you set the code path in `settings.js`?

## Forum-specific compatibility

- **Mod support** — only client-side (Optifine, Sodium); game-mechanics mods aren't supported.
- **Texture packs** — known to cause connection issues. Run vanilla.
- **Baritone** — different system from Mineflayer. No easy integration.

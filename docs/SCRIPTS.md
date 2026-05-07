# npm scripts

> Every invocable script in Anima, grouped by purpose. Run with `npm run <name>`. Pass arguments after `--`, e.g. `npm run substrate -- _DemoMother`.

---

## Free, no-LLM-cost (great place to start)

| Script | What it does |
|---|---|
| **`substrate-demo`** | Run three synthetic agents through five events to showcase the full twelve-layer cognitive substrate. Ends with a `substrate-diff` between the two most divergent agents. |
| **`substrate <agent>`** | Print every layer of one agent's cognitive state — identity, soul DNA, mood, allostatic load, beliefs, recursive beliefs, burden, persona mask, habituation curves, DMN rumination. |
| **`substrate-diff <A> <B>`** | Side-by-side comparison of two agents' state. Identity / mood + load / top beliefs / felt moments / DMN voice. |
| **`substrate-all [--living] [--names X,Y,Z]`** | Cohort-wide inspection — runs `substrate` for every agent in `bots/`. |
| **`timescales`** | Print every substrate tuning constant (load rates, half-lives, thresholds, capacities) grouped by layer with citations. |
| **`souls [name] [--full] [--history] [--last N]`** | Soul census: who's alive, who's locked, motto drift over time. |
| **`feuds`** | Cross-game antagonism graph. |
| **`library`** | Searchable corpus of accumulated narrative. |
| **`test`** | Run the full test suite. |
| **`clean-logs`** | Wipe `logs/` between runs. |

---

## LLM-driven scenarios (cost ~$0.10–$0.30/game)

| Script | What it does |
|---|---|
| **`cloister`** | Six monks + abbot. Doctrinal drift, schism, evolving canonical scripture. ~60-90 sec. |
| **`outpost`** | Six crew on a deep-space station. Oxygen ticks down, an anomaly is happening, comms control what Earth hears. |
| **`crew`** | Six pirates pursued by the Royal Navy. Plunder pile, mutiny by majority, captain's log persists across voyages. Uses ALL 5 primitives in one prompt. |
| **`cell`** | Wartime resistance — five operatives, hidden burdens, possible defection. |
| **`forum`** | Minecraft governance simulation (requires Docker minecraft running). ~10 min, ~$0.30. |

---

## Post-game artifacts

| Script | What it does |
|---|---|
| **`publish [--scenario X] [--roster A,B,C]`** | Turn one game's outputs into a single shareable markdown issue. |
| **`demo`** | Seed a fake cloister cohort + publish — produces `examples/cloister-demo-issue.md` without spending anything. |
| **`highlights`** | Surface the most-publishable lines from a game — motto drift, soul scars, epitaphs. |
| **`score`** | Score a game on a fixed rubric. |
| **`analyze`** | Cross-run stats and trends. |
| **`replay <gameId>`** | Replay a game's recorded output frame-by-frame. |
| **`record`** | Record a live game's output for later replay. |
| **`convert-video`** | Frames → video for the recorded games. |

---

## Tournament / sweep

| Script | What it does |
|---|---|
| **`tournament`** | Run multiple scenario instances and rank performance. |
| **`sweep`** | Parameter sweep across configurations. |

---

## Implementation paths

All scripts live under [`scripts/`](../scripts/) except the four scenario runners which live under [`scenarios/<name>/runner.js`](../scenarios/). The full mapping is in [`package.json`](../package.json) under `"scripts"`.

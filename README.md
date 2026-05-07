# Anima

> Multi-agent LLM simulation where agents have **souls that persist across runs and lock at death**.

**Status: Closed source, active development.** Designed from day one for clean OSS launch under MIT when the substrate proves itself across enough live games.

---

## What Anima is

A framework for running persistent multi-agent LLM simulations. Each agent has a markdown **soul file** that:
- Is read at the start of every game (the agent sees who they are first, then the world)
- Is rewritten at the end of every game based on what happened
- **Locks forever if the agent dies** — frozen as canonical history future agents inherit

That's the keystone. Around it, Anima ships a substrate of primitives — visible state agents share, hidden state they carry alone, and a wire-up layer that makes physical events mechanically update both. The result: characters accumulate identity across runs, develop genuine arcs, and leave permanent legacies. Across many games, you get a pantheon of frozen legends and a small number of evolving survivors.

---

## Reference scenarios

| Scenario | Setting | Embodiment | Persistent artifact |
|---|---|---|---|
| **Forum** | Minecraft political simulation. Settlers vs predators, governance + courts + treaties. | mineflayer | constitution / session journal |
| **Cloister** | Six monks + abbot. Doctrinal drift, schism, evolving canonical scripture. | text-only | scripture |
| **Outpost** | Six crew on a deep-space station. Oxygen ticks down, an anomaly is happening, comms control what Earth hears. | text-only | earth log |
| **Crew** | Six pirates pursued by the Royal Navy. Plunder pile, mutiny by majority, captain's log persists across voyages. | text-only | captain's log |

Each scenario plugs the same substrate into a different world. The soul mechanic, witness pipeline, and synthesis layer all work identically across them.

---

## The substrate

Eleven layers, ranked roughly by visibility:

| Layer | Question it answers | Visibility |
|---|---|---|
| **Soul** | Who am I across games? | public, evolves at game-end, locks at death |
| **Lineage** | Whose memory do I carry? | public, multi-generation chain |
| **Pantheon** | Whose deaths am I born after? | public, cross-scenario archive |
| **Beliefs** | What do I think of the others? | own-private, accumulates evidence |
| **Reflections** | What do I think they think of me? | own-private, depth-2 theory of mind |
| **Commitments** | What have I promised? | bilateral (you + them), tracked by ledger |
| **Burden** | What do I privately carry? | hidden, only the bearer reads it |
| **Auto-update** | How do events change beliefs? | mechanical, fires on witness |
| **Temporal depth** | What did I used to be? | observable, soul history archived per save |
| **Synthesis** | How do all my layers shape my next soul? | end-of-game LLM call reads everything |
| **Publish** | What did this game look like? | shareable markdown issue per game |

A soul says *I am the one who outlasts*. A belief table says *I trust Hamilton +0.60*. A reflection says *I believe Fox sees me as naive*. A burden whispers *I voted against my faction last game and never confessed*. The synthesis layer makes the next soul evolution incorporate all of it. The publish step turns one game's outputs into a document worth posting.

---

## The cognitive substrate (v0.45–v0.67)

Underneath the visible primitives sits a twelve-layer cognitive stack — neuroscience-grounded mechanisms that shape *how* belief deltas land, *what* gets remembered, *how* the body wears, *what voice* the agent carries into the next prompt, and *what stays loud enough to read* in working memory. None of them spend an LLM call.

| Layer | Mechanism | Brain analog |
|---|---|---|
| Affect tagging | per-event valence/arousal | amygdala (Cahill & McGaugh) |
| Consolidation | hippocampus → cortex transfer between games | sleep memory (Born & Wilhelm) |
| Predictive coding | surprise = sign-disagreement → ×1.0–2.5 | Friston free-energy |
| In-group bias | same/cross-faction asymmetric trust deltas | Tajfel minimal group |
| DMN | deterministic between-turn rumination | Default Mode Network |
| Habituation | per-event-type response curves | Kandel Aplysia |
| Mood-congruent retrieval | sad mood → sad memories first | Bower & Eich |
| Vicarious affect | trust>0.4 in target → empathy registration | mirror neurons (Preston/de Waal) |
| Somatic markers | DNA × event collision → arousal amplification | Damasio |
| Allostatic load | slow-moving stress reservoir | McEwen |
| Empathy phrasing | DMN voice distinguishes self / vicarious / Schadenfreude | — |
| Working memory cap | top-9 by \|trust\| visible; weaker ones backgrounded | Miller 1956 |

Single nominal event ⇒ five multiplicative per-witness factors (`affect × surprise × ingroup × habit × somatic`) plus between-event modulators (load, mood, DMN voice). Same flog produces a fanned-out distribution of trust deltas across the roster, without changing one line of any LLM prompt. See [`docs/COGNITIVE_SUBSTRATE.md`](docs/COGNITIVE_SUBSTRATE.md) for the full pipeline diagram, citations, and composition examples.

---

## Why this matters

Existing multi-agent LLM frameworks — LangChain, AutoGen, crewAI, Stanford's Generative Agents — treat agents as **functions in a fixed scenario**. They reset between runs, they have public state only, they don't accumulate.

Anima treats agents as **selves with continuity and stakes**. By Locke's classical definition (memory, capacity for change, stakes in continuation), agents with souls + locks + evolution arguably *are* selves in a way prior LLM agents are not.

Applications:
- **AI alignment testbed** — does this LLM cooperate when given power? Defect when betrayal pays?
- **Benchmark** for social/political LLM behavior, comparable across model versions
- **Synthetic training data** for agentic reasoning (negotiations, betrayals, governance)
- **Serialized emergent fiction** — agents whose lives readers can follow

The most distinctive output: a **chronological soul history** for one agent across many games. No human authored it. No prior framework can produce it.

---

## Quickstart

```bash
git clone https://github.com/MatthewTracy/anima.git
cd anima
npm install

# Run a scenario (text-only ones don't need Minecraft)
npm run cloister    # ~$0.10/game, 60-90 sec
npm run outpost     # ~$0.10/game, sci-fi station drama
npm run crew        # ~$0.10/game, pirate ship + uses ALL 5 primitives in one prompt

# Forum needs Docker minecraft running
docker start mc
npm run forum       # ~$0.30/game, 10 min

# Inspect the souls of every agent across every scenario
npm run souls
npm run souls -- Madison
npm run souls -- Madison --history          # chronological soul drift
npm run souls -- Madison --history --last 5 # last 5 versions only

# Generate a shareable markdown "issue" of the most recent game
npm run publish
```

Set `OPENROUTER_API_KEY` in `.env` (or whichever provider key your scenario's profiles use).

---

## Documentation

- [`docs/SOUL_MECHANIC.md`](docs/SOUL_MECHANIC.md) — the deepest read: what souls are, why three rules, why locking is asymmetric, why synthesis matters
- [`docs/COGNITIVE_SUBSTRATE.md`](docs/COGNITIVE_SUBSTRATE.md) — the eleven neuroscience-grounded layers that shape how events land, with citations
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — core / scenarios / adapters split, what lives where
- [`docs/SCENARIO_AUTHORING.md`](docs/SCENARIO_AUTHORING.md) — how to build a new scenario on Anima
- [`CHANGELOG.md`](CHANGELOG.md) — version history at a glance

---

## A line about output

The single most-publishable line Anima can produce is the **motto-drift comparison**:

> **Anselm's motto:** *"I ask."* → *"To question is to honor."*

That is an LLM-authored character development moment captured in 8 words. After 30 games of Anselm playing, you have 30 of those drift lines stacked vertically — the chronicle of a soul. `npm run publish` collapses one game into a single markdown issue showing that drift for every survivor, plus the chronicle, every memoir, every death's epitaph.

That's the artifact this framework exists to produce.

---

## License

Private / All rights reserved during the closed-source phase. Will become MIT when we go public.

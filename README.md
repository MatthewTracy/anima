# Anima

> Multi-agent LLM simulation where agents have **souls that persist across runs and lock at death**.

**Status: Closed source, in active development.** This README will become the public-facing pitch when we open-source.

## What Anima is

A framework for running persistent multi-agent LLM simulations. Each agent has a **soul file** — a markdown document representing who they are. The soul is read at the start of every game and rewritten at the end based on what happened. If the agent dies, the soul is **locked forever** — frozen at whatever stage it reached. Future agents read the dead soul as canonical history.

The result: characters accumulate identity across runs, develop genuine arcs, and leave permanent legacies. Across many games, you get a pantheon of frozen legends and a small number of evolving survivors.

## Reference scenarios

- **Forum** — Minecraft-based political simulation. Settlers vs predators. Governance, witnesses, constitution-as-code, autobiographies. (Inherited from `governance-game` v12.)
- **Cloister** — Pure-text monastery. 6 monks + abbot, doctrinal drift, schism, evolving canonical scripture. Proves Anima is scenario-agnostic.

## Why this matters

Multi-agent LLM frameworks (LangChain, AutoGen, crewAI, Generative Agents) treat agents as **functions in a fixed scenario**. Anima treats them as **selves with continuity and stakes**. The soul-lock-at-death mechanic is the missing primitive that turns LLMs from disposable workers into characters with weight.

Applications:
- AI alignment testbed — does this LLM cooperate when given power?
- Benchmark for social/political LLM behavior
- Synthetic training data for agentic reasoning
- Serialized emergent fiction with persistent characters

## Quickstart (internal)

```bash
git clone https://github.com/MatthewTracy/anima.git
cd anima
npm install
npm run forum       # run the Minecraft governance scenario
npm run cloister    # run the text-only monastery scenario
npm run souls       # inspect the current soul census (alive/locked)
```

## Documentation

- `docs/ARCHITECTURE.md` — core / scenarios / adapters split
- `docs/SOUL_MECHANIC.md` — what souls are and why they matter
- `docs/SCENARIO_AUTHORING.md` — how to write your own scenario

## License

Private / All rights reserved during the closed-source phase. Will become MIT when we go public.

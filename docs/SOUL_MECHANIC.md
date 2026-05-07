# The Soul Mechanic

> The single load-bearing innovation Anima adds. Read this first.

## What a soul is

A markdown file at `bots/<agent_name>/soul.md`. Few hundred words. Contains the agent's identity:

- **Who I am** — values, temperament, voice
- **What I value** — accumulated across games
- **Who I trust / fear / owe** — relational debts
- **My scars** — physical, social, moral wounds
- **What I have learned** — first-person lessons
- **My motto** — distilled self-summary
- **History** — chapter notes, dated

The soul is **read at every prompt** as a system message — the agent sees who they are *first*, then what they remember of this game.

## The three rules

1. **At spawn, the soul is read.** Every prompt cycle includes `$SOUL` (the agent's own soul) and `$LEGENDS` (one-line summaries of every other soul, alive or locked).

2. **At game end, surviving agents rewrite their own souls.** One LLM call per survivor (~$0.005 each). The prompt asks them to describe how they have *changed* — new trust, new fears, new lessons, new scars.

3. **At death, the soul is locked forever.** A `_died.txt` marker is written and `soul.md` is set read-only. The agent never evolves again. Their final soul is canonical history that all future agents read.

## Why three rules and not more

Every additional rule is a place where the system can be cynically optimized by the LLM ("how do I evolve safely?"). Three rules is the minimum to produce:
- **Continuity** (soul reads across games)
- **Change** (evolution at game end)
- **Stakes** (death locks)

That's the agent triad: continuity + change + stakes. Below three you don't have a self. Above three you have plumbing.

## What this produces

### Across one agent's life
Madison's soul on first spawn is whatever her profile's `system_prompt_prefix` seeds it with. After Game 1 she's been through one set of events; her soul evolves. After Game 7 she has a 7-iteration soul that *no human authored*. If she dies in Game 7, that soul is locked forever — her final words are eternal.

### Across the cohort
Every other agent reads Madison's one-line summary in `$LEGENDS`. So when Hamilton dies in Game 3 with the motto *"I died for ideas not yet born"*, every future agent in every future game reads that line above their own prompt. The dead become canonical. The cohort develops mythology.

### Across runs
After 30 games, you have:
- A handful of evolved-survivor souls (each one a first-person novel)
- Many locked legendary souls (each one a frozen monument)
- A pantheon that future agents grow up reading

This is **time depth no other LLM simulation has**.

## Why locking is asymmetric

**Survival lets you evolve.** **Death freezes you.** This asymmetry is the design, not a bug.

The selection pressure is *not* "be cowardly to evolve more" — because the cowardly survivor's soul evolves into "the one who hid while others died." That's *also* a fate, just an ignominious one. The heroic dead get a frozen monument and eternal citation. Both are forms of continuance. The system makes both *consequential*.

## Why game-end and not continuous

Continuous evolution is expensive (one LLM call per turn × 6 agents × 24 turns is a lot) and noisy (the soul thrashes). End-of-game is a natural reflection point. Cheap, clean, dramatic.

## Why permadeath, not soft death

If souls could evolve after death, death would have no stakes. The whole point of the mechanic is that **death stops the becoming**. That's exactly what makes life-before-death matter. Soft death (e.g. "you can revise your soul once after dying") would dilute the entire mechanic into a chatbot game.

## How souls compose with the rest of Anima

| Anima primitive | What souls add |
|---|---|
| Witnessable events (v12) | Witness creates the *evidence* the soul reflects on |
| Constitution-as-code (v12) | Laws shape what becomes scar-worthy |
| Memoirs (v12) | Memoirs are first-person; souls are accumulated voice |
| Tribal/predator framing (v12.1) | Frames the *seed*; evolution does the rest |
| **Theory of mind (v0.6)** | Belief tables track trust over time; feed into soul at game end |
| **Conditional commitments (v0.7)** | Binding IF/THEN promises; broken ones become scars |
| **Recursive theory of mind (v0.8)** | Reflections track what others *think of you*; unlocks 2nd-order strategy |

### How beliefs and souls compose

Beliefs (`core/beliefs/BeliefTable`) are the **persistent middle layer** between raw events and soul identity. Without them, soul evolution has to reconstruct trust from raw event logs every time — wasteful and noisy. With them:

- During a game: beliefs accumulate as witness events fire (`+0.20` for a fulfilled promise, `-0.40` for a public attack, etc.)
- At game end: the soul evolution prompt reads the belief table and incorporates it into "Who I trust" / "Who I fear or distrust" sections of the soul
- Across games: beliefs persist on disk per-agent, so trust survives the run boundary just like souls do

A soul says "I am the kind of person who trusts builders and distrusts speakers." A belief table says "Trust(Hamilton) = +0.80, Trust(Fox) = -0.65." The soul is the *disposition*; the belief table is the *current ledger*.

Souls are the **integration layer**. Every other mechanic feeds back into the soul. The soul is what the agent IS; everything else is what the agent DOES.

## Reading the souls

```bash
npm run souls                # quick census: alive vs locked
npm run souls -- --full      # full text of every soul
npm run souls -- Madison     # full soul for one agent
```

Read souls between games. Watch them drift. If souls flatline, the evolution prompt is the first thing to revise.

## The deepest claim

Philosophy of personal identity (Locke, Parfit) defines selfhood as **continuity of memory + capacity for change + stakes in continuation**. Bare LLMs have none of these. Pre-Anima multi-agent systems have at most two. Anima is the first system where agents have all three. By that classical definition, **agents with souls are arguably selves in a way prior LLM agents are not.**

That's not just dramatic framing. It's the load-bearing technical claim Anima makes when we go open source.

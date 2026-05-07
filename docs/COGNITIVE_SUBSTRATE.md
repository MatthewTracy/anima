# Cognitive Substrate

> Six neuroscience-grounded layers that turn a uniform belief table into an actual mind.

This document maps each `core/affect/`, `core/identity/`, and `core/cognition/` module onto the brain region or learning system it models, and explains how the layers compose when an event is witnessed.

## The pipeline

When `applyEventToBeliefs(event, witnesses)` runs, every witness's belief delta passes through this stack — each layer captures a distinct cognitive mechanism:

```
nominal delta (DEFAULT_DELTAS)
  × affectScale   (v0.45 — amygdala arousal)
  × surprise      (v0.47 — Friston prediction error)
  × ingroup       (v0.48 — Tajfel coalition bias)
  × habit         (v0.50 — Kandel habituation/sensitization)
= belief update applied to witness's BeliefTable
```

Around that pipeline:
- **v0.46** consolidates each game's affect log into long-term cortical memory between games.
- **v0.49** ruminates between turns — the witness carries an inner monologue informed by the new state into the next prompt.

## The six layers

### v0.45 — Amygdala-style affect tagging
**Module:** [`core/affect/affect.js`](../core/affect/affect.js)
**Brain analog:** Amygdala emotional encoding (Cahill & McGaugh 1998).

Every event is tagged with `valence ∈ [-1,+1]` and `arousal ∈ [0,1]`. Witness arousal is downscaled (0.65×) vs. target arousal (1.0×) — you feel the punch less than the person being punched. The arousal becomes a multiplier `affectScale = 0.5 + arousal ∈ [0.5, 1.5]` on the belief delta. Calm events shift trust half as hard as intense ones.

`AffectLog` persists per agent at `bots/<name>/affect.json`, capped at 60 entries (Miller's working-memory cap × 8). It computes `currentMood()` (Russell circumplex labels: settled / wary / tense / shaken / devastated / hopeful / elated) and `topMoments(n)` for prompt injection.

### v0.46 — Memory consolidation (sleep)
**Module:** [`core/affect/consolidation.js`](../core/affect/consolidation.js)
**Brain analog:** Hippocampus → cortex transfer during sleep (Born & Wilhelm 2012, Squire).

Between games, `consolidate(agentName, { scenario })` reads the top-7 moments (Miller's WM cap), detects recurring themes (event types ≥ 2×) and recurring others, composes a deterministic narrative, and **appends** it to `bots/<name>/consolidated_memory.md`. It then clears the per-game AffectLog. The cumulative memory file is what the next life's evolution prompt reads under `[YOUR CORTICAL MEMORY]`. This is what makes reincarnated agents "remember strongly what they felt strongly," and forget the noise.

### v0.47 — Predictive coding (surprise)
**Module:** [`core/affect/predictive.js`](../core/affect/predictive.js)
**Brain analog:** Karl Friston's free-energy principle; Schultz dopamine + reward prediction error.

The brain reacts to *prediction errors*, not raw events. When witness W has a prior trust in actor A, and the affect-tagged valence of an action is opposite-signed to that prior, the model FAILED — and the resulting update is amplified.

```
surprise = max(0, -priorTrust × eventValence)        # signs disagree → > 0
multiplier = 1 + min(1.0, surprise × 1.5)            # 1.0 to 2.5×
```

A betrayal by a trusted ally hits trust 1.5–2.5× harder than the same act from someone already distrusted. Confirmation produces no boost.

### v0.48 — In-group bias (Tajfel minimal group)
**Module:** [`core/identity/faction.js`](../core/identity/faction.js)
**Brain analog:** Coalition psychology (Tajfel 1971; Brewer "Optimal Distinctiveness").

Each agent has a runtime-mutable faction (`bots/<name>/faction.txt`, falls back to soul.md). `ingroupBias(witness, actor, delta)` returns:

|                         | positive delta | negative delta |
|-------------------------|----------------|----------------|
| **Same faction**        | ×1.20 (boost)  | ×0.85 (cushion)|
| **Cross faction**       | ×0.85 (downplay)| ×1.15 (suspicion)|
| **Either unknown**      | ×1.00          | ×1.00          |

This is what makes a mutiny feel different from a betrayal: same-faction misdeeds are reinterpreted, cross-faction good deeds are discounted.

### v0.49 — Default Mode Network (rumination)
**Module:** [`core/cognition/dmn.js`](../core/cognition/dmn.js)
**Brain analog:** Default Mode Network (Raichle 2001; Buckner 2008; Andrews-Hanna 2010).

Between turns, `ruminate(agentName)` deterministically synthesizes a first-person monologue from the agent's current mood, top affect moment, top ally, top enemy, and faction. It is appended to `bots/<name>/musings.md` (capped at 4 KB) and surfaced in the next prompt as `$MUSINGS`. **No LLM call.**

The DMN does not generate fresh content — it RE-CIRCULATES existing autobiographical material. The deterministic synthesizer is faithful to that. The agent's voice carries continuity of inner state, not just outer events.

### v0.50 — Habituation & sensitization
**Module:** [`core/cognition/habituation.js`](../core/cognition/habituation.js)
**Brain analog:** Eric Kandel's Aplysia work (Nobel 2000); Groves & Thompson 1970.

Each witness keeps a per-event-type exposure log at `bots/<name>/habituation.json`, with a 30-minute time decay. The factor applied to the affect-scaled delta is:

- **Low-arousal repetition** (arousal < 0.4): habituation toward floor 0.3 (`f = 0.3 + 0.7·exp(-0.4·count)`). The fifth fast / lectio / silent reading dulls.
- **High-arousal repetition** (arousal ≥ 0.7): sensitization toward ceiling 1.5 (`f = 1 + 0.5·(1 - exp(-0.3·count))`). The fifth attack / kill / vent escalates.
- **Mid-arousal**: factor = 1.0 (no curve).

The same flog now produces a smaller drop on a witness who has already seen four flogs (dissociation), but the same kill produces a *larger* drop on a witness who has already seen four kills (PTSD-like sensitization).

## Composability

A single `attack_player` event applied to two witnesses with different priors will produce wildly different deltas, even though the nominal value is the same:

- **Trusted ally, same faction, no prior exposure** → max amplification (high arousal × max surprise × ingroup cushion attenuates? — no: ally hostility = surprise reverses sign, ingroup cushions only the *negative direction*; net effect ≈ 1.5 × 2.5 × 0.85 ≈ 3.2×)
- **Distrusted rival, cross-faction, fifth attack this game** → a different shape: 1.3 × 1.0 × 1.15 × 1.4 ≈ 2.1× (sensitization dominant, surprise zero, ingroup amplifies suspicion).

The point isn't the exact numbers — it's that the same event produces a politically textured response distribution across the roster, without changing one line of any LLM prompt.

## Citations

- Cahill & McGaugh (1998) "Mechanisms of emotional arousal and lasting declarative memory"
- Born & Wilhelm (2012) "System consolidation of memory during sleep"
- Friston (2010) "The free-energy principle: a unified brain theory?"
- Tajfel (1971) "Experiments in intergroup discrimination"
- Buckner & Carroll (2007) "Self-projection and the brain"
- Kandel (2001) Nobel lecture, "The molecular biology of memory storage"

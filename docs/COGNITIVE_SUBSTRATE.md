# Cognitive Substrate

> Twelve neuroscience-grounded layers that turn a uniform belief table into a textured set of minds.

This document maps each module under `core/affect/`, `core/identity/`, and `core/cognition/` onto the brain region or learning system it models, and explains how the layers compose when an event is witnessed.

## The pipeline

Every belief delta from `applyEventToBeliefs(event, witnesses)` passes through this per-witness multiplicative stack — each factor captures a distinct cognitive mechanism:

```
nominal delta (DEFAULT_DELTAS)
  × affectScale     (v0.45 — amygdala arousal)
  × surprise        (v0.47 — Friston prediction error)
  × ingroup         (v0.48 — Tajfel coalition bias)
  × habit           (v0.50 — Kandel habituation/sensitization)
  × somatic         (v0.55 — Damasio value-aligned amplification)
= belief update applied to witness's BeliefTable
```

Around that per-event pipeline, several layers run *between* events or *between* games, modulating the felt experience the next prompt cycle reads:

- **v0.46** — sleep-style consolidation runs between games (hippocampus → cortex transfer).
- **v0.49** — Default Mode Network synthesizes inner monologue between turns.
- **v0.52** — mood-congruent retrieval colors what the DMN replays.
- **v0.53** — vicarious affect: harm to a beloved registers as your own pain (mirror neurons).
- **v0.54** — DMN narrative integration of empathy: vicarious entries get distinct phrasing.
- **v0.56** — allostatic load: a slow-moving stress reservoir; overloads change DMN voice.
- **v0.67** — working-memory cap on $BELIEFS: top-9 active, the rest backgrounded.
- **v0.71** — dishabituation: novel events spontaneously restore response to other types (Kandel 1968).
- **v0.73** — stress-induced narrowing: under high allostatic load, the working-memory cap shrinks 9 → 3.
- **v0.74** — DMN cognitive dissonance line: recent self-actions with negative valence surface as Festinger-style self-confrontation.

Twelve distinct mechanisms plus three internal compositions/exceptions. None touch any LLM prompt directly. The LLM still reads a soul.md, a mood line, a beliefs table — but what those READ LIKE has been shaped by all of them.

## Per-event layers

### v0.45 — Amygdala-style affect tagging
**Module:** [`core/affect/affect.js`](../core/affect/affect.js)
**Brain analog:** Amygdala emotional encoding (Cahill & McGaugh 1998).

Every event is tagged with `valence ∈ [-1,+1]` and `arousal ∈ [0,1]`. Witness arousal is downscaled (0.65×) vs. target arousal (1.0×) — you feel the punch less than the person being punched. Arousal becomes a multiplier `affectScale = 0.5 + arousal ∈ [0.5, 1.5]` on the belief delta. Calm events shift trust half as hard as intense ones.

`AffectLog` persists per agent at `bots/<name>/affect.json`, capped at 60 entries. It exposes `currentMood()` (Russell circumplex labels: settled / wary / tense / shaken / devastated / hopeful / elated), `topMoments(n)` (raw magnitude order), and `congruentMoments(n)` (mood-weighted; see v0.52).

### v0.47 — Predictive coding (surprise)
**Module:** [`core/affect/predictive.js`](../core/affect/predictive.js)
**Brain analog:** Karl Friston's free-energy principle (Friston 2010); Schultz dopamine RPE.

The brain reacts to prediction errors, not raw events. When witness W has prior trust `pT` in actor A and the event valence `vE` is opposite-signed to `pT`, the model FAILED.

```
surprise   = max(0, -pT × vE)            # signs disagree → > 0
multiplier = 1 + min(1.0, surprise × 1.5) # ∈ [1.0, 2.5]
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

This is what makes a mutiny feel different from a betrayal — same-faction misdeeds are reinterpreted, cross-faction good deeds are discounted.

### v0.50 — Habituation & sensitization
**Module:** [`core/cognition/habituation.js`](../core/cognition/habituation.js)
**Brain analog:** Eric Kandel's Aplysia work (Nobel 2000); Groves & Thompson 1970.

Each witness keeps a per-event-type exposure log at `bots/<name>/habituation.json` with 30-minute time decay. The factor applied to the affect-scaled delta is:

- **Low-arousal repetition** (arousal < 0.4): habituation toward floor 0.3.
  `f = 0.3 + 0.7·exp(-0.4·count)`. The fifth fast / lectio dulls.
- **High-arousal repetition** (arousal ≥ 0.7): sensitization toward ceiling 1.5.
  `f = 1 + 0.5·(1 − exp(-0.3·count))`. The fifth attack / kill / vent escalates.
- **Mid-arousal** (0.4 ≤ a < 0.7): factor = 1.0.

**v0.71 — Dishabituation (Kandel 1968 / Groves & Thompson 1970).** When a NOVEL event-type interrupts a habituated stream, the agent's response to OTHER habituated types spontaneously partially recovers. Implemented in `recordExposure`: if the firing type is novel for the witness, every other type's exposure list is truncated to its most recent entry. The next time those types fire, they read near-first-exposure rather than fully-habituated. Aplysia gill-withdrawal is the canonical demonstration.

### v0.55 — Somatic markers
**Module:** [`core/affect/somatic.js`](../core/affect/somatic.js)
**Brain analog:** Antonio Damasio's somatic-marker hypothesis (Damasio 1994; Bechara & Damasio 2005).

Each event-type maps to one or more value AXES (mercy/justice, action/contemplation, loyalty/autonomy, etc.) with signed poles. The agent's soul DNA is read; the boost is `Σ |opposing dna components| × COLLISION_WEIGHT`, capped at +60%. Misalignment, not alignment, drives the boost — violations register harder than confirmations.

A pacifist (mercy ≈ +1) witnessing a flog gets a sharp arousal amplification; a warrior (mercy ≈ -1) on the same flog gets none. The same nominal event lands on different nervous systems with different intensities, because each nervous system has been wired by a different lifetime of value alignment.

## Between-event layers

### v0.46 — Memory consolidation (sleep)
**Module:** [`core/affect/consolidation.js`](../core/affect/consolidation.js)
**Brain analog:** Hippocampus → cortex transfer during sleep (Born & Wilhelm 2012, Squire).

Between games, `consolidate(agentName, { scenario })` reads the top-7 moments (Miller's WM cap), detects recurring themes (event types ≥ 2×) and recurring others, composes a deterministic narrative, and **appends** it to `bots/<name>/consolidated_memory.md`. It then clears the per-game AffectLog. The cumulative file is what the next life's evolution prompt reads under `[YOUR CORTICAL MEMORY]`.

### v0.49 + v0.54 — Default Mode Network (rumination + empathy phrasing)
**Module:** [`core/cognition/dmn.js`](../core/cognition/dmn.js)
**Brain analog:** Default Mode Network (Raichle 2001; Buckner 2008; Andrews-Hanna 2010).

Between turns, `ruminate(agentName)` deterministically synthesizes a first-person monologue from the agent's current mood, top affect moment, top ally, top enemy, and faction. Appended to `bots/<name>/musings.md` (capped at 4 KB) and surfaced as `$MUSINGS` in the next prompt cycle.

v0.54 adds role-aware phrasing — vicarious affect entries (v0.53) yield "what `<beloved>` had to live through when X did Y" rather than the bystander default. Schadenfreude (vicarious positive valence from a hated target's harm) yields the "strange small relief" variant. v0.70 finishes the verb perspective system: verbs phrased as "raised a hand against me" only when the speaker IS the target; everyone else gets "raised a hand" with the actual target named separately.

**v0.74 — Cognitive dissonance line (Festinger 1957).** DMN scans the agent's recent affect log for `role='actor'` entries with negative valence — actions YOU took that felt bad to take. Two thresholds:

- ≥ 2 such entries → loud variant: "I have lately done things I cannot reconcile with who I thought I was."
- 1 strong entry (mag > 0.55) → soft variant: "One thing I did sits in me wrong."
- otherwise → silent.

Inserted between the mood/load opener and the belief line, so the self-confrontation lands before the agent starts thinking about others. No new state, no persistent file — Festinger's distress is just role='actor' with negative valence, recurring.

### v0.52 — Mood-congruent memory retrieval
**Module:** [`core/affect/affect.js`](../core/affect/affect.js) (`congruentMoments()`)
**Brain analog:** State-dependent memory bias (Bower 1981; Eich 1995).

In a sad mood, sad memories surface faster than happy ones — even when the happy ones have higher raw magnitude. The reverse holds when mood is positive. `congruentMoments(n)` ranks by `magnitude × congruence` where congruence is 1.0 when valences share sign, 0.4 when dissonant. Dissonant memories stay accessible (never zero) — what changes is priority.

DMN's `_replayLine` calls `congruentMoments(2)`. The same event log produces a hopeful inner monologue or a brooding one depending on which way the recent arc has bent. This is the engine of depression's self-reinforcing loop.

### v0.53 — Vicarious affect (empathy)
**Module:** [`core/beliefs/auto_update.js`](../core/beliefs/auto_update.js); `AffectLog.recordVicarious()`
**Brain analog:** Mirror neurons (Rizzolatti & Craighero 2004); empathy circuitry (Preston & de Waal 2002; Decety & Ickes 2009).

After the main belief-update pass, each witness with `|trust|` > 0.4 in target/actor gets a vicarious affect entry derived from their **prior** trust:

- `trust(target) > +0.4` → share target's affect, scaled by `trust × 0.5`.
- `trust(target) < −0.4` → SAME formula → trust sign flips valence → Schadenfreude.
- else `trust(actor) > 0.4` → share actor's affect, scaled by `trust × 0.4`.
- else nothing — strangers don't activate empathy.

Crucial detail: prior trust is snapshotted **before** step 1 mutates beliefs, so empathy reflects the relationship the witness had coming INTO the moment. The vicarious entry **replaces** the bystander entry for that witness — neuroscientifically, an empathic registration is one registration, not two.

### v0.67 — Working memory cap on visible beliefs
**Module:** [`core/beliefs/belief_table.js`](../core/beliefs/belief_table.js) (`asPromptText()`)
**Brain analog:** Miller's "magical number 7±2" (Miller 1956); Cowan (2001) on capacity-limited focus of attention.

`BeliefTable.asPromptText()` now sorts by `|trust|` descending and shows only the top **9** as full lines (the upper end of 7±2). If more relationships exist, a footer line lists the weaker ones by name without trust values:

```
- LoudPos1: TRUSTED ally (trust +0.95) — recent: "..."
- LoudNeg1: ENEMY        (trust -0.95) — recent: "..."
... (up to 9 active lines)
(also in your awareness, but not loud right now: Quiet1, Quiet2, Quiet3)
```

Charge-ranking is on absolute trust, so a strong enemy (-0.9) outranks a faintly cordial acquaintance (+0.1). For most reference scenarios (6-character casts) this is a no-op; for longer-running games and Forum scenarios with growing rosters, it collapses prompt bloat AND matches the cognitive constraint the LLM is implicitly trying to model.

**v0.73 — Stress-induced narrowing (Easterbrook 1959; Kahneman 1973).** The cap shrinks under allostatic load:

| load level | cap |
|---|---|
| baseline | 9 |
| elevated | 7 |
| allostatic | 5 |
| overloaded | 3 |

When at allostatic or overloaded, the prompt also gets a header note explaining the contraction so the LLM understands it's real, not an oversight. Composes v0.56 (stress reservoir) with v0.67 (Miller cap) into an emergent narrowing-under-acute-stress behaviour without inventing a new primitive.

### v0.56 — Allostatic load
**Module:** [`core/cognition/allostatic_load.js`](../core/cognition/allostatic_load.js)
**Brain analog:** Bruce McEwen's allostatic-load framework (McEwen 1998; McEwen & Gianaros 2010); Sapolsky 2004.

A slow-moving stress reservoir per agent at `bots/<name>/allostatic_load.json` ∈ [0, 1]. Each event nudges load by `arousal × somatic × LOAD_RATE` (~7%). `tickRecovery(roster)` decays each agent (~3% multiplicative) at every turn boundary in scenario runners. Thresholds:

| Load          | Level         | DMN response                                      |
|---------------|---------------|---------------------------------------------------|
| < 0.35        | baseline      | mood opener as written                            |
| 0.35 – 0.55   | elevated      | mood opener (no change yet)                       |
| 0.55 – 0.70   | allostatic    | mood opener + "I have not had a clean breath in a while." |
| ≥ 0.70        | overloaded    | exhaustion line **replaces** mood opener entirely |

The `$STRESS` placeholder surfaces the level for the LLM. The reservoir gives the substrate a timescale (minutes-to-hours of game-load) that the per-event layers don't.

## Composability

A single `attack_player` event applied to four witnesses with different priors and personalities produces wildly different deltas, though the nominal value is the same:

- **Trusted ally, same faction, low prior exposure, mercy-leaning DNA, fresh body**:
  amplified through nearly every layer — surprise (sign-flip), in-group cushion (smaller magnitude on negative for kin), somatic (mercy collision), allostatic (arousal pushes load).
- **Distrusted rival, cross-faction, fifth attack this game, justice-leaning DNA, allostatic**:
  surprise = 1, sensitization = 1.4×, in-group ×1.15, somatic ≈ 1, allostatic = "elevated" (DMN tints inner voice). Trust drop is sharp but not amplified by personality — the agent has been desensitized AND re-equilibrated.

Plus, after the per-event pipeline, the witness's allostatic load shifts; if mood drifts from cumulative drift, *future* DMN cycles will mood-congruently retrieve different memories than they would have an hour ago. And if the witness loved the target, they get a vicarious entry that REPLACES the bystander entry, with empathy-phrased rumination flowing into the next prompt.

The point isn't the exact numbers — it's that the same nominal event produces a fanned-out, politically and emotionally textured response distribution across the roster, without changing one line of any LLM prompt and without spending one extra LLM call.

## Citations

- Cahill & McGaugh (1998) "Mechanisms of emotional arousal and lasting declarative memory"
- Born & Wilhelm (2012) "System consolidation of memory during sleep"
- Friston (2010) "The free-energy principle: a unified brain theory?"
- Tajfel (1971) "Experiments in intergroup discrimination"
- Buckner & Carroll (2007) "Self-projection and the brain"
- Andrews-Hanna et al. (2010) on DMN architecture
- Kandel (2001) Nobel lecture, "The molecular biology of memory storage"
- Bower (1981) "Mood and memory"; Eich (1995) "Searching for mood-dependent memory"
- Preston & de Waal (2002) "Empathy: its ultimate and proximate bases"
- Decety & Ickes (2009) *The Social Neuroscience of Empathy*
- Rizzolatti & Craighero (2004) on mirror neurons
- Damasio (1994) *Descartes' Error*; Bechara & Damasio (2005) "The somatic-marker hypothesis"
- McEwen (1998) "Stress, adaptation, and disease"; Sapolsky (2004) *Why Zebras Don't Get Ulcers*
- Juster, McEwen & Lupien (2010) on allostatic load + cognitive decline
- Miller (1956) "The magical number seven, plus or minus two"
- Cowan (2001) "The magical number 4 in short-term memory"
- Easterbrook (1959) "The effect of emotion on cue utilization"
- Kahneman (1973) *Attention and Effort*
- Festinger (1957) *A Theory of Cognitive Dissonance*
- Groves & Thompson (1970) "Habituation: a dual-process theory" (re: dishabituation)

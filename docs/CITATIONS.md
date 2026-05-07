# Citations

> Every neuroscience and psychology paper referenced in the cognitive substrate, with the Anima version that maps to it.

This is the bibliographic index. For implementation details and composition, see [`COGNITIVE_SUBSTRATE.md`](COGNITIVE_SUBSTRATE.md). Citations are grouped by the cognitive system they describe, ordered by the Anima version that first surfaced them.

---

## Affect & emotional encoding

- **Cahill & McGaugh (1998)** — "Mechanisms of emotional arousal and lasting declarative memory." *Trends in Neurosciences* 21(7).
  → **v0.45** — amygdala-style per-event valence + arousal tagging; high-arousal events shift trust harder.

- **Russell (1980)** — "A circumplex model of affect." *Journal of Personality and Social Psychology* 39(6).
  → **v0.45** — mood labels (settled / wary / tense / shaken / devastated / hopeful / elated) along the valence × arousal plane. v0.98 inspector names the quadrant explicitly.

- **Damasio (1994)** — *Descartes' Error: Emotion, Reason, and the Human Brain.*
- **Bechara & Damasio (2005)** — "The somatic-marker hypothesis: a neural theory of economic decision."
- **Reimann & Bechara (2010)** — "The somatic marker framework as a neurological theory of decision-making."
  → **v0.55** — per-witness arousal amplification when an event collides with that witness's value-DNA poles. Misalignment, not alignment, drives the boost.

---

## Memory & consolidation

- **Born & Wilhelm (2012)** — "System consolidation of memory during sleep." *Psychological Research* 76(2).
- **Squire et al.** on hippocampus → cortex transfer.
  → **v0.46** — between-game consolidation: top-7 affective moments + recurring themes survive into a cumulative cortical-store file; per-game AffectLog clears.

- **Bower (1981)** — "Mood and memory." *American Psychologist* 36(2).
- **Eich (1995)** — "Searching for mood-dependent memory."
  → **v0.52** — mood-congruent retrieval: dissonant memories get a 0.4 multiplier vs 1.0 for congruent ones.

- **Brown & Kulik (1977)** — "Flashbulb memories." *Cognition* 5.
  → **v0.76** — flashbulb override on mood-congruent retrieval: high-magnitude memories (≥ 0.7) progressively cancel the dissonance discount.

- **Ebbinghaus (1885)** — *Über das Gedächtnis* (forgetting curves).
  → **v1.0** — `AffectLog.decay(0.05)` wired into every scenario's between-turn loop.

---

## Predictive coding & belief updating

- **Friston (2010)** — "The free-energy principle: a unified brain theory?" *Nature Reviews Neuroscience* 11(2).
- **Schultz** on dopamine + reward prediction error.
  → **v0.47** — surprise multiplier (1.0–2.5×) when sign(prior trust) and sign(event valence) disagree.

- **Sharot (2011)** — "The optimism bias." *Current Biology* 21(23).
- **Sharot, Korn & Dolan (2011)** — "How unrealistic optimism is maintained in the face of reality."
  → **v0.93** — direction-specific asymmetric updating from soul DNA's trust axis. Optimists boost positive deltas; pessimists boost negative ones.

---

## Habituation & sensitization

- **Kandel (2001)** — "The molecular biology of memory storage: a dialogue between genes and synapses." Nobel lecture.
- **Groves & Thompson (1970)** — "Habituation: a dual-process theory."
- **Rankin et al. (2009)** — "Habituation revisited."
  → **v0.50** — per-witness, per-event-type response curves. Low-arousal repetition habituates toward floor 0.3; high-arousal sensitizes toward ceiling 1.5.
  → **v0.71** — dishabituation: novel events spontaneously restore response to other types.

---

## Stress & body load

- **McEwen (1998)** — "Stress, adaptation, and disease: allostasis and allostatic load." *Annals of the New York Academy of Sciences* 840(1).
- **McEwen & Gianaros (2010)** — "Central role of the brain in stress and adaptation."
- **Sapolsky (2004)** — *Why Zebras Don't Get Ulcers.*
- **Juster, McEwen & Lupien (2010)** — "Allostatic load biomarkers of chronic stress and impact on health and cognition."
  → **v0.56** — per-agent load reservoir; v0.57 adds tickRecovery wired into all scenarios.

- **Easterbrook (1959)** — "The effect of emotion on cue utilization and the organization of behavior." *Psychological Review* 66.
- **Kahneman (1973)** — *Attention and Effort.*
  → **v0.73** — stress-induced narrowing: working-memory cap on `$BELIEFS` shrinks under load (9 → 7 → 5 → 3).

---

## Empathy & social affect

- **Preston & de Waal (2002)** — "Empathy: its ultimate and proximate bases." *Behavioral and Brain Sciences* 25(1).
- **Decety & Ickes (2009)** — *The Social Neuroscience of Empathy.*
- **Rizzolatti & Craighero (2004)** — "The mirror-neuron system." *Annual Review of Neuroscience* 27.
- **Singer et al. (2004)** on shared pain representations.
  → **v0.53** — vicarious affect entries when |trust| > 0.4 in target/actor. Empathic registration *replaces* bystander registration. v0.54 + v0.70 propagate role-aware phrasing into the DMN voice.

- **Algoe & Haidt (2009)** — "Witnessing excellence in action: the 'other-praising' emotions of elevation, gratitude, and admiration." *The Journal of Positive Psychology* 4(2).
  → (informs framing of positive vicarious entries; not yet a separate role tag.)

---

## Default Mode Network & rumination

- **Raichle et al. (2001)** — "A default mode of brain function." *PNAS* 98(2).
- **Buckner, Andrews-Hanna & Schacter (2008)** — "The brain's default network: anatomy, function, and relevance to disease."
- **Buckner & Carroll (2007)** — "Self-projection and the brain."
- **Spreng & Grady (2010)** on DMN + autobiographical memory.
- **Andrews-Hanna et al. (2010)** on DMN architecture.
- **Mason et al. (2007)** — "Wandering minds: the default network and stimulus-independent thought."
  → **v0.49** — between-turn deterministic rumination synthesized from mood + top affect + top ally/enemy + faction.
  → **v0.54** — role-aware empathy phrasing in DMN voice.
  → **v0.74** — Festinger-style self-confrontation line when role='actor' negative-valence entries accumulate.

---

## Coalition & social identity

- **Tajfel (1971)** — "Experiments in intergroup discrimination." *Scientific American* 223(5).
- **Brewer** on Optimal Distinctiveness Theory.
- **Crystal & Smith** on coalition psychology.
  → **v0.48** — same/cross-faction asymmetric trust deltas. Same-faction misdeeds cushioned, cross-faction good deeds discounted.

- **Goffman (1959)** — *The Presentation of Self in Everyday Life.*
  → **v0.79** — persona masks slip under acute allostatic load. The "performance" requires attention the body can't spare when overloaded.

---

## Cognitive dissonance

- **Festinger (1957)** — *A Theory of Cognitive Dissonance.*
  → **v0.74** — DMN line: when role='actor' negative-valence entries accumulate, the inner voice acknowledges the contradiction.
  → **v0.77** — soul evolution prompt asks the LLM to choose Festinger's two paths: change behavior or rationalize.

---

## Working memory limits

- **Miller (1956)** — "The magical number seven, plus or minus two." *Psychological Review* 63(2).
- **Cowan (2001)** — "The magical number 4 in short-term memory."
  → **v0.67** — `BeliefTable.asPromptText()` shows top-9 (Miller's upper bound) by `|trust|`; weaker ties get a one-line "backgrounded" footer.
  → **v0.73** — cap shrinks under load (9 → 7 → 5 → 3).

---

## Format note

If a paper grounds multiple Anima versions, every version that depends on it appears under its citation. New citations land here when a new mechanism is shipped — see the source modules under `core/affect/`, `core/cognition/`, and `core/identity/` for inline references.

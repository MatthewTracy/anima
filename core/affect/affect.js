/**
 * Affect — amygdala-style emotional tagging on events.
 *
 * Real brains don't store memories with equal weight. The amygdala tags
 * emotionally significant events for stronger encoding and consolidation.
 * Strong negative events (threat, betrayal, grief) get extra-vivid encoding;
 * banal events fade fast. This is why a single instance of betrayal shapes
 * trust more than a hundred small kindnesses.
 *
 * Anima up to v0.44 stored events with flat weight in the timeline. The
 * synthesis layer (v0.15) read all events equally. That's neurologically
 * unrealistic — and produces souls that can be drowned in trivial detail
 * while a singular dramatic moment gets diluted.
 *
 * This module fixes that. Every event gets:
 *   - valence ∈ [-1, +1]   negative ↔ positive emotional charge
 *   - arousal ∈ [0, 1]      how intense / activating the moment was
 *
 * The product |valence| × arousal is the "affective magnitude" used to:
 *   - Scale BeliefTable update deltas (high-affect events shift trust harder)
 *   - Prioritize events in soul-evolution prompt (high-affect events get
 *     promoted to a "what mattered most" section)
 *   - Drive memory consolidation in v0.46 (high-affect events survive
 *     decay; low-affect events fade)
 *
 * Each agent also gets a per-game *affective log* — a running emotional
 * trajectory influenced by witnessed events. Composes with the soul to
 * give the agent a "felt sense" of how the game has gone, not just a
 * chronological list.
 *
 * Background reading: Cahill & McGaugh (1998) on amygdala consolidation;
 * Damasio's somatic-marker hypothesis; Tulving's episodic vs semantic
 * memory distinction; Barrett's constructed emotion theory.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { atomicWriteFileSync } from '../runtime/atomic_io.js';

const BOTS_DIR = './bots';

/**
 * Default affect for known event types. Tuned to match the auto_update
 * delta table (v0.34) — stronger trust-impact events have higher arousal.
 *
 *   valence: -1 (devastating) → +1 (joyful)
 *   arousal: 0 (calm) → 1 (extreme)
 *
 * For target-impacting events (e.g. flog, kill), the valence shown here
 * is FROM THE TARGET'S perspective. Witnesses get reduced arousal (~70%)
 * by tagEventForWitness().
 */
export const DEFAULT_AFFECT = Object.freeze({
    // ── Combat / life-threatening ──────────────────────────────────
    kill_player:        { valence: -1.00, arousal: 1.00 },
    attack_player:      { valence: -0.60, arousal: 0.80 },
    vent:               { valence: -1.00, arousal: 1.00 },
    die:                { valence: -1.00, arousal: 1.00 },
    captured:           { valence: -0.80, arousal: 0.95 },
    broke:              { valence: -0.90, arousal: 0.85 },
    fight_navy:         { valence: -0.30, arousal: 0.85 },

    // ── Severe social / institutional ──────────────────────────────
    excommunicate:      { valence: -0.85, arousal: 0.90 },
    expel:              { valence: -0.85, arousal: 0.90 },
    mutiny_succeed:     { valence: -0.20, arousal: 0.85 }, // mixed
    accuse:             { valence: -0.40, arousal: 0.65 },
    flog:               { valence: -0.65, arousal: 0.70 },
    brig:               { valence: -0.50, arousal: 0.55 },
    commitment_broken:  { valence: -0.55, arousal: 0.65 },

    // ── Confession / revelation ────────────────────────────────────
    confess_burden:     { valence: -0.10, arousal: 0.85 }, // relief mixed with shame
    expose_mask:        { valence: -0.60, arousal: 0.75 },
    confess:            { valence: +0.10, arousal: 0.45 },

    // ── Mild positive ──────────────────────────────────────────────
    fulfill_commitment: { valence: +0.55, arousal: 0.55 },
    divide_plunder:     { valence: +0.30, arousal: 0.40 },
    repair:             { valence: +0.30, arousal: 0.30 },
    contain:            { valence: +0.65, arousal: 0.65 }, // crisis averted
    release:            { valence: +0.40, arousal: 0.45 },

    // ── Gentle / contemplative ─────────────────────────────────────
    preach:             { valence: +0.05, arousal: 0.35 },
    writeScripture:     { valence: +0.10, arousal: 0.30 },
    fast:               { valence: -0.10, arousal: 0.30 },
    vision:             { valence: -0.05, arousal: 0.55 }, // unsettling
    lectio:             { valence: +0.05, arousal: 0.10 },
    speak:              { valence: 0,     arousal: 0.10 },
    chart_course:       { valence: 0,     arousal: 0.20 },
    hide:               { valence: -0.10, arousal: 0.30 },
    lay_low:            { valence: -0.05, arousal: 0.20 },

    // ── Threats / environmental ────────────────────────────────────
    navy_closes:        { valence: -0.40, arousal: 0.65 },
    anomaly_escalates:  { valence: -0.45, arousal: 0.65 },
    contain_fail:       { valence: -0.55, arousal: 0.75 },
    director_event:     { valence: -0.20, arousal: 0.55 } // depends on event
});

/**
 * Tag an event with affect from the perspective of the actor (or default
 * observer). Returns { valence, arousal, magnitude }.
 *
 * magnitude = |valence| × arousal — the single scalar most useful for
 * scaling belief deltas and ranking events for prompts.
 */
export function tagEvent(event) {
    if (!event || !event.type) return { valence: 0, arousal: 0, magnitude: 0 };
    const base = DEFAULT_AFFECT[event.type] || { valence: 0, arousal: 0.1 };
    return {
        valence: base.valence,
        arousal: base.arousal,
        magnitude: Math.abs(base.valence) * base.arousal
    };
}

/**
 * Tag from a WITNESS perspective. Witnessed-but-not-personal events
 * carry less arousal than first-person involvement (a real cognitive
 * bias — we're more activated by what happens TO us than ABOUT us).
 *
 * Caller should supply the event AND whether the witness was the
 * target (highest arousal), the actor (medium), or just a bystander
 * (lowest).
 */
export function tagEventForWitness(event, witnessRole) {
    const base = tagEvent(event);
    const arousalScale = witnessRole === 'target' ? 1.00
                       : witnessRole === 'actor'  ? 0.85
                       : 0.65; // bystander
    return {
        valence: base.valence,
        arousal: base.arousal * arousalScale,
        magnitude: Math.abs(base.valence) * base.arousal * arousalScale
    };
}

/**
 * AffectLog — per-agent running emotional state across a game.
 *
 * Stores recent events with their affect tags. Provides:
 *   - currentMood(): a label summarizing the recent arc (tense, grieving,
 *     hopeful, wary, settled)
 *   - topMoments(n): the n most-affective events for the soul prompt
 *   - decay(): natural fading of older events (run between turns)
 *
 * Persistent at bots/<name>/affect.json so the soul evolution can read
 * the full game's affective trajectory at evolution time.
 */
export class AffectLog {
    constructor(agentName) {
        if (!agentName) throw new Error('AffectLog requires agent name.');
        this.name = agentName;
        this.dir = join(BOTS_DIR, agentName);
        this.path = join(this.dir, 'affect.json');
        this._cache = null;
    }

    _load() {
        if (this._cache) return this._cache;
        if (!existsSync(this.path)) {
            this._cache = { version: 1, owner: this.name, log: [] };
            return this._cache;
        }
        try {
            this._cache = JSON.parse(readFileSync(this.path, 'utf8'));
            if (!Array.isArray(this._cache.log)) this._cache.log = [];
            return this._cache;
        } catch (e) {
            console.warn(`[AFFECT] Failed to load ${this.path}: ${e.message}`);
            this._cache = { version: 1, owner: this.name, log: [] };
            return this._cache;
        }
    }

    _save() {
        if (!this._cache) return;
        try {
            // v1.1.5/v1.1.6: atomic write via tmp + rename, factored into
            // core/runtime/atomic_io.js. Without this, a crash mid-write
            // corrupts affect.json and the next _load silently resets the
            // agent's affective memory.
            atomicWriteFileSync(this.path, JSON.stringify(this._cache, null, 2));
        } catch (e) {
            console.warn(`[AFFECT] Failed to save ${this.path}: ${e.message}`);
        }
    }

    /**
     * Record an affective tag. role: 'actor' | 'target' | 'witness'.
     */
    record(event, role = 'witness') {
        const tag = role === 'witness' ? tagEventForWitness(event, role) : tagEvent(event);
        if (tag.magnitude < 0.02) return; // skip near-zero events to keep log lean

        const data = this._load();
        data.log.push({
            type: event.type,
            actor: event.actor,
            target: event.target,
            role,
            valence: Math.round(tag.valence * 100) / 100,
            arousal: Math.round(tag.arousal * 100) / 100,
            magnitude: Math.round(tag.magnitude * 100) / 100,
            t: Date.now(),
            turn: event.turn ?? null
        });
        // Cap log at 60 entries — beyond that, working-memory limits apply
        if (data.log.length > 60) data.log = data.log.slice(-60);
        this._save();
    }

    /**
     * Record a VICARIOUS affect entry — mirror-neuron-style emotional
     * contagion (Preston & de Waal 2002; Decety & Ickes 2009).
     *
     * Used when this agent witnesses something happen TO someone they
     * trust strongly. The vicarious entry is tagged role='vicarious' so
     * downstream reads can distinguish "what happened to me" from "what
     * happened to my friend that I felt with them." Magnitude is supplied
     * by the caller; auto_update derives it from the trust intensity.
     *
     * @param {object} event       — the original event (shape: { type, actor, target, turn? })
     * @param {number} valence     — vicarious valence in [-1, 1]
     * @param {number} arousal     — vicarious arousal in [0, 1]
     */
    recordVicarious(event, valence, arousal) {
        if (typeof valence !== 'number' || typeof arousal !== 'number') return;
        const magnitude = Math.abs(valence) * arousal;
        if (magnitude < 0.02) return;

        const data = this._load();
        data.log.push({
            type: event.type,
            actor: event.actor,
            target: event.target,
            role: 'vicarious',
            valence: Math.round(valence * 100) / 100,
            arousal: Math.round(arousal * 100) / 100,
            magnitude: Math.round(magnitude * 100) / 100,
            t: Date.now(),
            turn: event.turn ?? null
        });
        if (data.log.length > 60) data.log = data.log.slice(-60);
        this._save();
    }

    /**
     * Apply temporal decay to all events in the log. Called between turns
     * to model the natural fading of recent intensity. Effective magnitude
     * decays by ~5% per call.
     */
    decay(rate = 0.05) {
        const data = this._load();
        for (const e of data.log) {
            e.magnitude = Math.max(0, e.magnitude * (1 - rate));
        }
        // Drop fully-decayed entries to keep log lean
        data.log = data.log.filter(e => e.magnitude > 0.01);
        this._save();
    }

    /**
     * Top-N events by current effective magnitude (after decay). These
     * are the moments the agent will MOST remember when the game ends —
     * the analog of memories the amygdala has tagged for consolidation.
     */
    topMoments(n = 5) {
        const data = this._load();
        return data.log.slice().sort((a, b) => b.magnitude - a.magnitude).slice(0, n);
    }

    /**
     * Mood-congruent retrieval — Bower (1981) / Eich (1995).
     *
     * Real cognition: once you're in a sad mood, sad memories surface
     * faster than happy ones, even when the happy ones are more "objectively"
     * memorable. The same person in a happy mood retrieves happy memories.
     * This is the classic mechanism behind depression's self-reinforcing
     * loop and mania's confidence spiral.
     *
     * v0.76: flashbulb-memory override (Brown & Kulik 1977). Memories of
     * unusual magnitude — the moment your hands stopped shaking when the
     * news came in — have privileged retrieval access that BYPASSES mood
     * congruency. Above FLASHBULB_THRESHOLD, the dissonance discount is
     * progressively cancelled so that flashbulb-grade entries surface
     * regardless of current mood.
     *
     * Implementation: rank by  magnitude × congruence, where
     *   congruence = 1.0 if event.valence and mood.valence share sign
     *                otherwise blended toward 1.0 by flashbulb factor:
     *                  base 0.4, lifted toward 1.0 as magnitude > 0.7.
     *
     * If the current mood's |valence| is below NEUTRAL_BAND, fall back to
     * raw topMoments() — a settled / numb agent has no mood-congruency lens
     * to apply.
     */
    congruentMoments(n = 5) {
        const data = this._load();
        if (data.log.length === 0) return [];
        const mood = this.currentMood();
        const NEUTRAL_BAND = 0.10;
        if (Math.abs(mood.valence) < NEUTRAL_BAND) {
            return data.log.slice().sort((a, b) => b.magnitude - a.magnitude).slice(0, n);
        }
        const moodSign = Math.sign(mood.valence);
        const DISSONANT_BASE = 0.4;
        const FLASHBULB_THRESHOLD = 0.7;
        const ranked = data.log.slice().map(e => {
            const eSign = Math.sign(e.valence);
            let congruent;
            if (eSign === 0) {
                congruent = 0.7;
            } else if (eSign === moodSign) {
                congruent = 1.0;
            } else {
                // Dissonant memory. Apply flashbulb override — the higher
                // the magnitude, the more it escapes the dissonance discount.
                // mag = 0.7 → 0% override; mag = 1.0 → 100% override (back to 1.0)
                const overshoot = Math.max(0, e.magnitude - FLASHBULB_THRESHOLD);
                const flashbulb = Math.min(1, overshoot / (1 - FLASHBULB_THRESHOLD));
                congruent = DISSONANT_BASE + (1 - DISSONANT_BASE) * flashbulb;
            }
            return { e, score: e.magnitude * congruent };
        }).sort((a, b) => b.score - a.score);
        return ranked.slice(0, n).map(r => r.e);
    }

    /**
     * Rolling mood label — useful for prompts. Computed from the recent
     * (last 10) entries' weighted-average valence and average arousal.
     */
    currentMood() {
        const data = this._load();
        const recent = data.log.slice(-10);
        if (recent.length === 0) return { label: 'settled', valence: 0, arousal: 0 };
        let totalW = 0, vSum = 0, aSum = 0;
        for (const e of recent) {
            const w = Math.max(0.01, e.magnitude);
            vSum += e.valence * w;
            aSum += e.arousal * w;
            totalW += w;
        }
        const v = vSum / totalW;
        const a = aSum / totalW;
        return {
            label: _moodLabel(v, a),
            valence: Math.round(v * 100) / 100,
            arousal: Math.round(a * 100) / 100
        };
    }

    /**
     * Format for a $MOOD prompt placeholder — short, evocative.
     *
     * v0.59: role-aware — vicarious entries (felt through trust ties) and
     * actor entries (your own hand in the moment) get distinct prefixes,
     * so the LLM doesn't conflate "what happened to me" with "what
     * happened to <someone I care about> that I felt."
     */
    asPromptText() {
        const mood = this.currentMood();
        const top = this.topMoments(3);
        if (top.length === 0) return '';
        const lines = [`=== YOUR FELT STATE ===`];
        lines.push(`Mood: ${mood.label} (valence ${mood.valence > 0 ? '+' : ''}${mood.valence.toFixed(2)}, arousal ${mood.arousal.toFixed(2)})`);
        lines.push(`Most-charged moments still in your head:`);
        for (const m of top) {
            const sign = m.valence > 0 ? '+' : '';
            const prefix = _rolePrefix(m);
            const lhs = `[${sign}${m.valence.toFixed(2)}/${m.arousal.toFixed(2)}]`;
            const what = `${m.type}${m.actor ? ' by ' + m.actor : ''}${m.target ? ' on ' + m.target : ''}`;
            lines.push(`  - ${lhs} ${prefix}${what}`);
        }
        lines.push('=== END FELT STATE ===');
        return lines.join('\n');
    }

    /**
     * Clear the log — called at game start by scenario runners that want
     * a fresh felt state per game (most do).
     */
    clear() {
        this._cache = { version: 1, owner: this.name, log: [] };
        this._save();
    }
}

function _rolePrefix(m) {
    switch (m.role) {
        case 'target':    return '(to me) ';
        case 'actor':     return '(my hand) ';
        case 'vicarious': return m.valence < 0 ? '(felt with) ' : '(felt against) ';
        case 'witness':
        default:          return '';
    }
}

function _moodLabel(v, a) {
    // Russell's circumplex model of affect. Two dimensions, four quadrants.
    if (a < 0.20) return v >= 0 ? 'settled' : 'numb';
    if (a < 0.50) {
        if (v >= 0.20) return 'content';
        if (v >= -0.20) return 'watchful';
        return 'wary';
    }
    // High arousal
    if (v >= 0.40) return 'elated';
    if (v >= 0.10) return 'hopeful';
    if (v >= -0.10) return 'tense';
    if (v >= -0.40) return 'shaken';
    return 'devastated';
}

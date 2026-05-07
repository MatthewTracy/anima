/**
 * RecursiveBeliefTable — second-order theory of mind.
 *
 * Where BeliefTable answers "what does the agent believe about others?",
 * this answers the harder question: **what does the agent believe others
 * believe about THEM?**
 *
 * For owner A, this stores per-other-agent X:
 *   - perceived_trust_of_me: how A thinks X views A (-1.0 hostile → +1.0 ally)
 *   - confidence:            how sure A is about X's view (0..1)
 *   - evidence:              recent reasons supporting the inference
 *
 * Why this matters: depth-2 ToM unlocks **second-order strategy** — act
 * differently than the other expects, in order to surprise them. Madison
 * thinking "Hamilton sees me as institutionalist; if I act decisively
 * he won't see it coming" is impossible without this primitive. It is
 * the missing axis between souls (who I am) and beliefs (what I think
 * of them).
 *
 * No prior multi-agent LLM framework ships depth-2 ToM as first-class
 * state. This is a frontier feature.
 *
 * Status (v0.8): ships as the data structure + $REFLECTIONS placeholder.
 *   - Agents can explicitly write their theories via setPerception/updatePerception
 *   - Inference rules (e.g. "if X attacked you, X probably distrusts you")
 *     are deferred to v0.9
 *   - LLM-driven recursive inference each turn: deferred to v1.0+
 *
 * Persistence: bots/<name>/recursive_beliefs.json (separate from
 * beliefs.json so the two tables stay legible).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { atomicWriteFileSync } from '../runtime/atomic_io.js';
import { join } from 'path';

const BOTS_DIR = './bots';
const TRUST_MIN = -1.0;
const TRUST_MAX = 1.0;
const CONFIDENCE_MIN = 0.0;
const CONFIDENCE_MAX = 1.0;
const MAX_EVIDENCE_ENTRIES = 5;
const EVIDENCE_TEXT_MAX = 140;

export class RecursiveBeliefTable {
    /**
     * @param {string} owner - the agent doing the reflecting
     */
    constructor(owner) {
        if (!owner) throw new Error('RecursiveBeliefTable requires an owner.');
        this.owner = owner;
        this.dir = join(BOTS_DIR, owner);
        this.path = join(this.dir, 'recursive_beliefs.json');
        this._cache = null;
    }

    _load() {
        if (this._cache) return this._cache;
        if (!existsSync(this.path)) {
            this._cache = { version: 1, owner: this.owner, perceptions: {} };
            return this._cache;
        }
        try {
            this._cache = JSON.parse(readFileSync(this.path, 'utf8'));
            if (!this._cache.perceptions) this._cache.perceptions = {};
            return this._cache;
        } catch (e) {
            console.warn(`[RECURSIVE] Failed to load ${this.path}: ${e.message}. Starting fresh.`);
            this._cache = { version: 1, owner: this.owner, perceptions: {} };
            return this._cache;
        }
    }

    _save() {
        if (!this._cache) return;
        try {
            atomicWriteFileSync(this.path, JSON.stringify(this._cache, null, 2));
        } catch (e) {
            console.warn(`[RECURSIVE] Failed to save ${this.path}: ${e.message}`);
        }
    }

    /**
     * Get the owner's theory of how `otherAgent` perceives them.
     * Returns the entry or a neutral default.
     */
    getPerception(otherAgent) {
        if (!otherAgent || otherAgent === this.owner) return null;
        const data = this._load();
        return data.perceptions[otherAgent] || {
            perceived_trust_of_me: 0,
            confidence: 0,
            lastUpdate: null,
            evidence: []
        };
    }

    /**
     * Replace the owner's perception of how `otherAgent` sees them.
     * Use when the owner forms an explicit hypothesis.
     */
    setPerception(otherAgent, perceived_trust, confidence, reason) {
        if (!otherAgent || otherAgent === this.owner) return;
        const data = this._load();
        if (!data.perceptions[otherAgent]) {
            data.perceptions[otherAgent] = {
                perceived_trust_of_me: 0,
                confidence: 0,
                lastUpdate: null,
                evidence: []
            };
        }
        const entry = data.perceptions[otherAgent];
        const oldTrust = entry.perceived_trust_of_me;
        entry.perceived_trust_of_me = Math.max(TRUST_MIN, Math.min(TRUST_MAX, perceived_trust));
        entry.confidence = Math.max(CONFIDENCE_MIN, Math.min(CONFIDENCE_MAX, confidence));
        entry.lastUpdate = new Date().toISOString();
        entry.evidence.push({
            at: entry.lastUpdate,
            delta: Math.round((entry.perceived_trust_of_me - oldTrust) * 1000) / 1000,
            reason: `[SET] ${reason || ''}`.slice(0, EVIDENCE_TEXT_MAX)
        });
        if (entry.evidence.length > MAX_EVIDENCE_ENTRIES) {
            entry.evidence.splice(0, entry.evidence.length - MAX_EVIDENCE_ENTRIES);
        }
        this._save();
    }

    /**
     * Adjust the perception by deltas. Useful when events shift the
     * owner's hypothesis incrementally — "Hamilton complimented my
     * speech, maybe he thinks better of me than I thought."
     */
    updatePerception(otherAgent, deltaTrust, deltaConfidence, reason) {
        if (!otherAgent || otherAgent === this.owner) return;
        if (typeof deltaTrust !== 'number' || Number.isNaN(deltaTrust)) return;

        const data = this._load();
        if (!data.perceptions[otherAgent]) {
            data.perceptions[otherAgent] = {
                perceived_trust_of_me: 0,
                confidence: 0,
                lastUpdate: null,
                evidence: []
            };
        }
        const entry = data.perceptions[otherAgent];
        entry.perceived_trust_of_me = Math.max(TRUST_MIN, Math.min(TRUST_MAX, entry.perceived_trust_of_me + deltaTrust));
        if (typeof deltaConfidence === 'number' && !Number.isNaN(deltaConfidence)) {
            entry.confidence = Math.max(CONFIDENCE_MIN, Math.min(CONFIDENCE_MAX, entry.confidence + deltaConfidence));
        }
        entry.lastUpdate = new Date().toISOString();
        entry.evidence.push({
            at: entry.lastUpdate,
            delta: Math.round(deltaTrust * 1000) / 1000,
            reason: (reason || '').slice(0, EVIDENCE_TEXT_MAX)
        });
        if (entry.evidence.length > MAX_EVIDENCE_ENTRIES) {
            entry.evidence.splice(0, entry.evidence.length - MAX_EVIDENCE_ENTRIES);
        }
        this._save();
    }

    /**
     * Return all perceived perceptions ordered by perceived trust descending.
     * Useful for "you think these people see you favorably / unfavorably".
     */
    rankedPerceptions() {
        const data = this._load();
        return Object.entries(data.perceptions)
            .map(([name, entry]) => ({ name, ...entry }))
            .sort((a, b) => b.perceived_trust_of_me - a.perceived_trust_of_me);
    }

    /**
     * Format for $REFLECTIONS prompt placeholder. Each line is a
     * second-order theory the agent holds about how someone sees them.
     */
    asPromptText() {
        const ranked = this.rankedPerceptions();
        if (ranked.length === 0) {
            return `=== YOUR REFLECTIONS — what you think others think of you ===\n(No reflections yet — you have not formed an explicit theory of how others see you. Strategy without this is one-sided.)\n=== END REFLECTIONS ===`;
        }
        const lines = ['=== YOUR REFLECTIONS — what you think others think of you ==='];
        for (const r of ranked) {
            const label = _perceptionLabel(r.perceived_trust_of_me);
            const conf = _confidenceLabel(r.confidence);
            const trustStr = r.perceived_trust_of_me > 0
                ? `+${r.perceived_trust_of_me.toFixed(2)}`
                : r.perceived_trust_of_me.toFixed(2);
            const recent = r.evidence.length > 0
                ? ` — basis: "${r.evidence[r.evidence.length - 1].reason}"`
                : '';
            lines.push(`- You ${conf} ${r.name} sees you as ${label} (perceived ${trustStr})${recent}`);
        }
        lines.push('=== END REFLECTIONS ===');
        return lines.join('\n');
    }

    /**
     * Wipe — typically between scenarios. Reflections from a Forum
     * game shouldn't bleed into a Cloister game with a different cast.
     */
    clear() {
        this._cache = { version: 1, owner: this.owner, perceptions: {} };
        this._save();
    }
}

function _perceptionLabel(trust) {
    if (trust >= 0.7) return 'a TRUSTED ally';
    if (trust >= 0.3) return 'reliable to them';
    if (trust >= 0.05) return 'cordial';
    if (trust > -0.05) return 'unread';
    if (trust > -0.3) return 'suspect';
    if (trust > -0.7) return 'distrusted';
    return 'an ENEMY';
}

function _confidenceLabel(c) {
    if (c >= 0.8) return 'are confident';
    if (c >= 0.5) return 'believe';
    if (c >= 0.2) return 'suspect';
    return 'guess';
}

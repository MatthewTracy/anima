/**
 * CommitmentLedger — conditional binding promises.
 *
 * Third v13 Tier-1 primitive after souls and beliefs. The trio:
 *   - Souls       — continuity of self
 *   - Beliefs     — continuity of relationships
 *   - Commitments — continuity of promises
 *
 * A commitment is a structured IF/THEN promise the engine tracks:
 *   - by:          the promiser ("I will...")
 *   - to:          the promisee ("...for you")
 *   - condition:   what must happen to fulfill it ("if you pay 3 iron")
 *   - consequence: what auto-fires on fulfillment ("I'll vote yes on Law #5")
 *   - deadline_ms: when the promise expires unfulfilled
 *
 * Lifecycle:
 *   pending → fulfilled  (condition predicate returned true → consequence fires)
 *   pending → broken     (deadline passed without fulfillment → witness event)
 *   pending → withdrawn  (promiser explicitly cancels)
 *
 * Status (v0.7): ships as the data structure + persistence layer.
 *   - Conditions are stored as opaque strings (predicate registration: v0.8)
 *   - Consequences are stored as opaque strings (executor registration: v0.8)
 *   - Witness/belief integration on fulfillment/break: v0.9
 *
 * This iteration gives scenarios a place to put commitments and reason
 * about them. Future iterations will close the loop on automatic
 * fulfillment detection and reputation consequences.
 *
 * Persistence: logs/commitments/<gameId>.json. The ledger is per-game,
 * not cross-game (a promise made in Forum doesn't carry to Cloister).
 * If you want cross-game obligations, that's a soul-level concern —
 * record "owes Hamilton 3 iron" in the soul instead.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const LEDGER_DIR = './logs/commitments';
const STATUS = Object.freeze({
    PENDING: 'pending',
    FULFILLED: 'fulfilled',
    BROKEN: 'broken',
    WITHDRAWN: 'withdrawn'
});

export class CommitmentLedger {
    /**
     * @param {string} gameId - identifier for this game's ledger file
     */
    constructor(gameId) {
        if (!gameId) throw new Error('CommitmentLedger requires a gameId.');
        this.gameId = gameId;
        this.path = join(LEDGER_DIR, `${gameId}.json`);
        this._cache = null;
        this._listeners = { fulfilled: [], broken: [], created: [], withdrawn: [] };
    }

    _load() {
        if (this._cache) return this._cache;
        if (!existsSync(this.path)) {
            this._cache = {
                version: 1,
                gameId: this.gameId,
                nextId: 1,
                commitments: []
            };
            return this._cache;
        }
        try {
            this._cache = JSON.parse(readFileSync(this.path, 'utf8'));
            if (!this._cache.commitments) this._cache.commitments = [];
            if (typeof this._cache.nextId !== 'number') this._cache.nextId = (this._cache.commitments.length || 0) + 1;
            return this._cache;
        } catch (e) {
            console.warn(`[COMMIT] Failed to load ${this.path}: ${e.message}. Starting fresh.`);
            this._cache = {
                version: 1,
                gameId: this.gameId,
                nextId: 1,
                commitments: []
            };
            return this._cache;
        }
    }

    _save() {
        if (!this._cache) return;
        try {
            if (!existsSync(LEDGER_DIR)) mkdirSync(LEDGER_DIR, { recursive: true });
            writeFileSync(this.path, JSON.stringify(this._cache, null, 2));
        } catch (e) {
            console.warn(`[COMMIT] Failed to save ${this.path}: ${e.message}`);
        }
    }

    _emit(event, commitment) {
        for (const fn of this._listeners[event] || []) {
            try { fn(commitment); } catch { /* nonfatal */ }
        }
    }

    /**
     * Subscribe to lifecycle events. Caller passes (commitment) callbacks.
     * Events: 'created', 'fulfilled', 'broken', 'withdrawn'.
     */
    on(event, fn) {
        if (!this._listeners[event]) return;
        this._listeners[event].push(fn);
    }

    /**
     * Create a new commitment.
     *
     * @param {object} args
     * @param {string} args.by          - promiser
     * @param {string} args.to          - promisee
     * @param {string} args.condition   - human-readable condition ("Hamilton pays 3 iron")
     * @param {string} args.consequence - human-readable consequence ("I vote yes on Law #5")
     * @param {number} args.deadline_ms - absolute timestamp (Date.now() + N) when this expires
     * @param {string} [args.note]      - optional commentary visible in UI
     * @returns {object} the created commitment
     */
    create({ by, to, condition, consequence, deadline_ms, note }) {
        if (!by || !to || !condition || !consequence) {
            throw new Error('Commitment requires by, to, condition, consequence.');
        }
        if (by === to) {
            throw new Error('You cannot commit to yourself.');
        }
        if (typeof deadline_ms !== 'number' || deadline_ms <= Date.now()) {
            throw new Error('Commitment deadline must be a future timestamp.');
        }
        const data = this._load();
        const commitment = {
            id: data.nextId++,
            by, to,
            condition: condition.trim(),
            consequence: consequence.trim(),
            note: note?.trim() || null,
            status: STATUS.PENDING,
            createdAt: Date.now(),
            deadline_ms,
            resolvedAt: null,
            resolution: null   // human-readable note on how it ended
        };
        data.commitments.push(commitment);
        this._save();
        this._emit('created', commitment);
        return commitment;
    }

    /**
     * Mark a commitment as fulfilled. Records resolution and fires the
     * 'fulfilled' event so scenarios can act on the consequence.
     */
    fulfill(id, resolutionNote) {
        const c = this._find(id);
        if (!c) return null;
        if (c.status !== STATUS.PENDING) {
            console.warn(`[COMMIT] Cannot fulfill #${id}: status is ${c.status}.`);
            return c;
        }
        c.status = STATUS.FULFILLED;
        c.resolvedAt = Date.now();
        c.resolution = resolutionNote || 'condition fulfilled';
        this._save();
        this._emit('fulfilled', c);
        return c;
    }

    /**
     * Mark a commitment as broken (deadline expired or explicitly broken).
     * Fires 'broken' so scenarios can broadcast a witness event and let
     * BeliefTable update accordingly.
     */
    break_(id, resolutionNote) {
        const c = this._find(id);
        if (!c) return null;
        if (c.status !== STATUS.PENDING) {
            console.warn(`[COMMIT] Cannot break #${id}: status is ${c.status}.`);
            return c;
        }
        c.status = STATUS.BROKEN;
        c.resolvedAt = Date.now();
        c.resolution = resolutionNote || 'deadline expired';
        this._save();
        this._emit('broken', c);
        return c;
    }

    /**
     * Withdraw a still-pending commitment (the promiser cancels). Less
     * dramatic than break_; some scenarios may not penalize this.
     */
    withdraw(id, by, note) {
        const c = this._find(id);
        if (!c) return null;
        if (c.by !== by) {
            console.warn(`[COMMIT] ${by} cannot withdraw #${id} — not the promiser.`);
            return c;
        }
        if (c.status !== STATUS.PENDING) return c;
        c.status = STATUS.WITHDRAWN;
        c.resolvedAt = Date.now();
        c.resolution = note || `withdrawn by ${by}`;
        this._save();
        this._emit('withdrawn', c);
        return c;
    }

    /**
     * Sweep: find all pending commitments whose deadline has passed and
     * break them. Call this on a tick or before each turn.
     * Returns the array of newly-broken commitments.
     */
    sweepDeadlines(now = Date.now()) {
        const data = this._load();
        const broken = [];
        for (const c of data.commitments) {
            if (c.status === STATUS.PENDING && c.deadline_ms <= now) {
                c.status = STATUS.BROKEN;
                c.resolvedAt = now;
                c.resolution = 'deadline expired (auto-sweep)';
                broken.push(c);
                this._emit('broken', c);
            }
        }
        if (broken.length > 0) this._save();
        return broken;
    }

    /**
     * Find one commitment by id.
     */
    _find(id) {
        return this._load().commitments.find(c => c.id === id);
    }

    /**
     * List commitments matching a filter.
     * Filter shape: { by?, to?, status?, involving? }
     */
    list(filter = {}) {
        const data = this._load();
        return data.commitments.filter(c => {
            if (filter.by && c.by !== filter.by) return false;
            if (filter.to && c.to !== filter.to) return false;
            if (filter.status && c.status !== filter.status) return false;
            if (filter.involving && c.by !== filter.involving && c.to !== filter.involving) return false;
            return true;
        });
    }

    /**
     * Compact prompt-friendly text for $COMMITMENTS placeholder. Lists
     * pending commitments visible to one agent (theirs and ones to them).
     */
    asPromptText(askingAgentName) {
        const involving = this.list({ involving: askingAgentName, status: STATUS.PENDING });
        if (involving.length === 0) {
            return `=== YOUR COMMITMENTS ===\n(No pending promises involving you.)\n=== END COMMITMENTS ===`;
        }
        const lines = ['=== YOUR COMMITMENTS — pending promises you are party to ==='];
        for (const c of involving) {
            const remaining = Math.max(0, Math.round((c.deadline_ms - Date.now()) / 1000));
            const role = c.by === askingAgentName ? 'YOU promised' : `${c.by} promised`;
            const recipient = c.to === askingAgentName ? 'you' : c.to;
            lines.push(`- #${c.id} ${role} ${recipient}: "${c.consequence}" IF "${c.condition}" — ${remaining}s remaining`);
        }
        lines.push('=== END COMMITMENTS ===');
        return lines.join('\n');
    }

    /**
     * Summary stats for the soul-inspector or end-of-game manuscript.
     */
    summary() {
        const data = this._load();
        const counts = { pending: 0, fulfilled: 0, broken: 0, withdrawn: 0 };
        for (const c of data.commitments) counts[c.status]++;
        return {
            total: data.commitments.length,
            ...counts,
            kept_rate: data.commitments.length > 0
                ? counts.fulfilled / (counts.fulfilled + counts.broken || 1)
                : null
        };
    }
}

export { STATUS as COMMITMENT_STATUS };

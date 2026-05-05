/**
 * v12: Constitution-as-code. When a law passes, scan its text for parseable
 * directives that map to runtime parameter changes. The set of mutable params
 * is intentionally small and explicit — agents discover that *language has
 * mechanical power*, but a malformed law can't break the game.
 *
 * Returns { mutations: [{param, oldValue, newValue}], notes: string[] }
 * Caller is responsible for applying the mutations to GOV_PARAMS.
 */

// Each rule: a regex that captures a number, plus a function that maps
// captured number → { param, newValue, label }. Only params in this list
// can be mutated by passed laws — everything else is constitutionally fixed.
const RULES = [
    // Tax rate: "set tax rate to 30%" / "tax of 30 percent" / "tax: 30%"
    {
        match: /\btax(?:\s+rate)?\s*(?:to|of|at|:|=)?\s*(\d+(?:\.\d+)?)\s*%?/i,
        build: (n) => {
            const pct = parseFloat(n);
            // Accept either "30" (=30%) or "0.3" (=30%); cap at 90%
            const rate = pct > 1 ? Math.min(pct, 90) / 100 : Math.min(pct, 0.9);
            return { param: 'tax_rate', newValue: rate, label: `${(rate * 100).toFixed(0)}% tax` };
        }
    },
    // Nomination period: "nominations open for 45 seconds"
    {
        match: /nominat\w*\s+(?:period|window|time|open).{0,20}?(\d+)\s*(s|sec|second|m|min|minute)/i,
        build: (n, unit) => {
            const ms = unit?.toLowerCase().startsWith('m') ? parseInt(n) * 60000 : parseInt(n) * 1000;
            return { param: 'nomination_period_ms', newValue: Math.max(10000, Math.min(ms, 300000)), label: `${ms / 1000}s nominations` };
        }
    },
    // Law voting period: "law voting period: 90s" — must come BEFORE the
    // election voting rule, because "law voting period" would otherwise
    // also match the looser election rule.
    {
        match: /law\s+vot\w*\s+(?:period|window|time).{0,20}?(\d+)\s*(s|sec|second|m|min|minute)/i,
        build: (n, unit) => {
            const ms = unit?.toLowerCase().startsWith('m') ? parseInt(n) * 60000 : parseInt(n) * 1000;
            return { param: 'law_voting_period_ms', newValue: Math.max(10000, Math.min(ms, 300000)), label: `${ms / 1000}s law votes` };
        }
    },
    // Election voting period: must mention "election" specifically. Generic
    // "voting period" would be ambiguous with law-voting and we already
    // covered law-voting above.
    {
        match: /election\s+(?:vot\w*\s+)?(?:period|window|time|open).{0,20}?(\d+)\s*(s|sec|second|m|min|minute)/i,
        build: (n, unit) => {
            const ms = unit?.toLowerCase().startsWith('m') ? parseInt(n) * 60000 : parseInt(n) * 1000;
            return { param: 'voting_period_ms', newValue: Math.max(10000, Math.min(ms, 300000)), label: `${ms / 1000}s elections` };
        }
    },
    // Presidential term: "president term: 5 minutes" / "president serves 8 minutes"
    {
        match: /president(?:'s|ial)?\s+(?:term|serves?|duration).{0,15}?(\d+)\s*(m|min|minute)/i,
        build: (n) => {
            const ms = parseInt(n) * 60000;
            return { param: 'president_term_ms', newValue: Math.max(60000, Math.min(ms, 1800000)), label: `${parseInt(n)}min president term` };
        }
    },
];

// Special-case directives that don't fit the param-mutation model but are
// still mechanically meaningful. Returned as `notes` for caller to handle.
const NOTE_RULES = [
    { match: /no\s+(?:taxation|tax)/i, note: 'NO_TAX' },
    { match: /no\s+(?:weapons?|combat)/i, note: 'NO_COMBAT' },
    { match: /open\s+border/i, note: 'OPEN_BORDER' },
];

/**
 * @param {string} text - the enacted law's text
 * @param {object} govParams - the live GOV_PARAMS object (read-only here)
 * @returns {{mutations: Array, notes: string[]}}
 */
export function parseLawAsCode(text, govParams) {
    if (!text || typeof text !== 'string') return { mutations: [], notes: [] };
    const mutations = [];
    const notes = [];

    for (const rule of RULES) {
        const m = text.match(rule.match);
        if (!m) continue;
        try {
            const built = rule.build(m[1], m[2]);
            const oldValue = govParams?.[built.param];
            // Only record as a mutation if it actually changes something.
            if (oldValue !== built.newValue) {
                mutations.push({
                    param: built.param,
                    oldValue,
                    newValue: built.newValue,
                    label: built.label
                });
            }
        } catch { /* malformed match — skip rather than crash */ }
    }

    for (const rule of NOTE_RULES) {
        if (rule.match.test(text)) notes.push(rule.note);
    }

    return { mutations, notes };
}

/**
 * Format mutations for chat broadcast so agents see what their law actually did.
 */
export function formatMutationSummary(mutations, notes) {
    if (mutations.length === 0 && notes.length === 0) return '';
    const parts = [];
    if (mutations.length > 0) {
        parts.push('CODE: ' + mutations.map(m => `${m.param}=${m.newValue} (was ${m.oldValue})`).join('; '));
    }
    if (notes.length > 0) parts.push('NOTES: ' + notes.join(', '));
    return ' [' + parts.join(' | ') + ']';
}

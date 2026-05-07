#!/usr/bin/env node
/**
 * Print every cognitive-timescale constant the substrate uses, with
 * citations. Read-only — calls into core/cognition/timescales.js.
 *
 * Usage: node scripts/show_timescales.js
 *        npm run timescales
 *
 * Useful for:
 *   - Audits before a tuning pass
 *   - Verifying the substrate's tunables haven't drifted from docs
 *   - Quick reminder of what each layer's half-life or cap is
 */

import { asReport } from '../core/cognition/timescales.js';

console.log('');
console.log(asReport());
console.log('');

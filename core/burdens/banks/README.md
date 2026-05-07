# Burden banks

> Pre-baked sets of secrets, sins, debts, and unspoken regrets — one bank per reference scenario. Each entry is a private hidden state that an agent can carry into a game and (optionally) confess publicly during it.

## Why these exist

The Burden primitive (see [`../burden.js`](../burden.js)) lets an agent hold private state that NO other agent can read. A scenario assigns each agent a burden at game start; the agent reads their own burden alongside their soul, and the LLM weighs whether/when/how to confess publicly. Confession converts hidden burden to a public scar in the soul.

These bank files give scenario authors **drop-in burden content** appropriate to the scenario's setting. A cloister burden has a monastic flavor; a crew burden has a pirate flavor; etc.

## Files

| File | For scenario | Burdens |
|---|---|---|
| `cloister.json` | monastic drama | 7 sins / doubts / visions |
| `crew.json` | pirate ship | 7 betrayals / hidden loyalties / secret debts |
| `outpost.json` | sci-fi station | 7 secrets / professional lapses / private grief |
| `forum.json` | governance simulation | 7 political secrets / past corruptions |

## Wiring status

As of this writing, **only the Cell scenario assigns burdens** at game start (it loads from `scenarios/cell/burdens.json`, scenario-specific path — see `assignRandomFromBank` in `scenarios/cell/runner.js`). The four bank files in this directory are **available** but not yet auto-wired into Cloister / Crew / Outpost / Forum.

A future scenario or contributor can wire them by:

```js
import { assignRandomFromBank } from '../../core/burdens/burden.js';
import bank from '../../core/burdens/banks/cloister.json' assert { type: 'json' };

// In seedSoulsIfNeeded() or a similar setup hook:
for (const name of roster) {
    if (Math.random() < 0.5) {
        assignRandomFromBank(name, bank.burdens, { source: 'cloister-seed' });
    }
}
```

This is the same pattern Cell uses, just pointed at the shared bank instead of a scenario-local one.

## Adding a new bank

Each bank has shape `{ name, description, burdens: [{kind, text}, ...] }`. `kind` is a free-form tag (e.g., `"sin"`, `"secret"`, `"vision"`, `"debt"`); `text` is the burden statement in first person. See any existing bank for examples.

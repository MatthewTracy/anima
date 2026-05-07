# core/witness — see `src/agent/`

> The witness primitive (cross-agent action broadcast: agents within proximity see `[SAW]` events for credible accusations) currently lives in **`src/agent/witness.js`** and **`src/agent/mindserver_proxy.js`** — the legacy Forum scenario layout.

This directory is a reserved migration target. When the Forum scenario migrates to the unified `scenarios/<name>/runner.js` shape, the witness primitive moves here under `core/witness/`. Until then, this directory is intentionally empty so:

- Listings of `core/` show the witness layer is a real primitive
- Anyone looking here finds this README pointing at the right code
- The future migration target is reserved at the obvious path

See [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) for the broader migration plan.

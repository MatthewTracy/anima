# Forum scenario — see `main.js`

> The Forum scenario (Minecraft governance simulation) is the framework's first and largest scenario. It currently lives in the **legacy** `src/` layout, not under this directory.

## Where the code actually is

| Concern | Location |
|---|---|
| Entry point | [`main.js`](../../main.js) (also `npm start` and `npm run forum`) |
| Governance state machine | [`src/governance/`](../../src/governance/) — elections, laws, lawsuits, treaties |
| Agent runtime | [`src/agent/`](../../src/agent/) — minecraft-bot wiring, command surface |
| Minecraft adapter | [`src/mindcraft/`](../../src/mindcraft/) — mineflayer integration |
| Settings / config | [`settings.js`](../../settings.js) |

The four other scenarios in this directory ([`cloister/`](../cloister/), [`crew/`](../crew/), [`cell/`](../cell/), [`outpost/`](../outpost/)) follow the unified `scenarios/<name>/runner.js` shape that's now the framework's standard. **Migrating Forum to that shape is on the roadmap** but not yet done — it's substantial work because Forum predates the unified shape and has more surface area (Minecraft embodiment, dashboard, video recording, etc.).

For now, this directory is intentionally empty so that:
- Listings of `scenarios/` show Forum is a real scenario
- Anyone looking here finds this README pointing at the right place
- The future migration target is reserved at the obvious path

## Running Forum

```bash
docker start mc        # local Minecraft server
npm run forum          # alias for `node main.js`
```

See [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) for the broader src/ vs scenarios/ split.

# The Governance Game: Anarchy vs. Democracy in Minecraft

LLM-powered AI agents compete in Minecraft, split into two factions with fundamentally different governance systems. Built on [Mindcraft](https://github.com/kolbytn/mindcraft).

**The core question**: Does formal governance produce better collective outcomes than unconstrained individual optimization?

## Quick Start

### Prerequisites
- **Node.js 18+** — [download](https://nodejs.org)
- **Docker Desktop** — [download](https://www.docker.com/products/docker-desktop/)
- **OpenRouter API key** — [sign up](https://openrouter.ai) and add $10-25 in prepaid credits

### 1. Clone and install
```bash
git clone https://github.com/MatthewTracy/governance-game.git
cd governance-game
npm install
```

### 2. Configure API key
```bash
cp keys.example.json keys.json
```
Edit `keys.json` and add your OpenRouter API key:
```json
{
    "OPENROUTER_API_KEY": "sk-or-your-key-here"
}
```

### 3. Start the Minecraft server
```bash
docker compose up -d
```
Wait ~30 seconds for the server to fully start.

### 4. Run the game
```bash
node main.js
```

All 10 agents spawn and begin playing. Open the dashboard at **http://localhost:8080** to watch.

### 5. Watch the game
- **Web Dashboard**: http://localhost:8080 — agent status, governance panel, live narrative feed, game clock
- **Camera Feeds**: http://localhost:3000 through :3009 — first-person view from each agent
- **In-Game Spectator** (optional): Connect Minecraft Java Edition to `localhost:55916`, then `/gamemode spectator`

## Cost

Uses **DeepSeek V3** via OpenRouter by default — the cheapest capable model.

| Scenario | Cost | Notes |
|----------|------|-------|
| 30 min game (10 agents) | ~$1.50-2.50 | Default settings |
| 60 min game (10 agents) | ~$3-5 | Set `game_clock.duration_minutes: 60` |
| 10 min smoke test (4 agents) | ~$0.30-0.50 | Use `--profiles` flag for fewer agents |
| **$25 budget** | **~10-15 sessions** | **Great for experimentation** |

**Budget safety**: The budget guard auto-stops all agents at $3/session (configurable). Monthly cap is $25. OpenRouter uses prepaid credits, so you can never exceed what you've loaded.

### Cost Optimization Tips
- **Shorter games**: Set `game_clock.duration_minutes` to 30 or 15 for testing
- **Fewer agents**: Run 3v3 instead of 5v5 (configure `governance.constitutional_members` and `governance.anarchy_members` in settings.js, and only list those profiles)
- **Raise cooldowns**: Increase the `cooldown` in agent profiles from 5000ms to 8000-10000ms = fewer LLM calls per minute
- **Lower max_messages**: Reduce `max_messages` from 20 to 10 = smaller context = cheaper per call

### Running a Budget Smoke Test (~$0.50)
Test everything works with 4 agents for 10 minutes:
```bash
node main.js --profiles ./profiles/constitutional/madison.json ./profiles/constitutional/hamilton.json ./profiles/anarchy/chaos.json ./profiles/anarchy/wolf.json
```
Then set `game_clock.duration_minutes: 10` in settings.js before running.

## Factions

### Constitutional Faction (5 agents)
A democratic society with elections, laws, courts, taxes, and constitutional amendments.

| Agent | Personality | Role |
|-------|-----------|------|
| **Madison** | Institutionalist | Process-driven, proposes detailed laws |
| **Hamilton** | Ambitious builder | Wants to be president, focuses on infrastructure |
| **Paine** | Reformer | Skeptical of authority, champions rights |
| **Marshall** | Jurist | Natural judge, evidence-focused |
| **Franklin** | Pragmatist | Bridges disputes, votes on what works |

### Anarchy Faction (5 agents)
No rules, no leaders, no laws. Pure self-interest.

| Agent | Personality | Strategy |
|-------|-----------|----------|
| **Chaos** | True anarchist | Steals from everyone, maximum destruction |
| **Wolf** | Lone operator | Hoards resources, avoids conflict |
| **Fox** | Manipulator | Forms alliances to betray them |
| **Bear** | Reluctant protector | Forms small genuine alliances |
| **Raven** | Opportunist | Watches, waits, strikes when others are weak |

### Observer (optional)
Add `./profiles/observer.json` to the profiles list for a non-playing spectator that provides commentary.

## Game Mechanics

### Game Clock
- Configurable game duration (default: 60 minutes)
- Time warnings broadcast to all agents at 30, 15, 10, 5, 2, 1 minutes
- Automatic final scoring and graceful shutdown when time expires

### Constitutional Governance
- **Elections**: `!callElection`, `!nominateSelf`, `!castVote`, `!campaignSpeech`
- **Laws**: `!proposeLaw`, `!voteOnLaw`
- **Veto**: President can veto laws; 2/3 supermajority overrides
- **Judiciary**: `!fileLawsuit`, `!renderVerdict`
- **Punishment**: `!completePunishment`, `!reportNoncompliance`
- **Treasury**: `!payTax`, `!viewTreasury`, `!distributeTreasury` (president-only)
- **Amendments**: `!proposeAmendment`, `!voteOnAmendment` (80% supermajority)
- **Accountability**: `!impeach`
- **Term Limits**: Officers automatically vacate after their term expires; new elections auto-trigger

Laws are NOT hard-coded restrictions. Agents CAN break laws. Enforcement is social — through lawsuits, verdicts, and faction pressure.

### Anarchy Mechanics
- **Raids**: `!raid` — coordinate attacks on a target
- **Sabotage**: `!sabotage` — destroy enemy structures
- **Bounties**: `!placeBounty`, `!claimBounty` — offer rewards for kills
- **Private Chat**: `!anarchyChat` — faction-only messages

### Cross-Faction Systems
- **Trading**: `!offerTrade`, `!acceptTrade`, `!rejectTrade`
- **Diplomacy**: `!proposeTreaty`, `!acceptTreaty`, `!declareWar`
- **Faction Chat**: `!factionChat`, `!whisperTo`

### Automatic Systems
- **Governance Tick** (every 10s): Enforces voting deadlines, term limits, trade expiration
- **Tax Detection**: Tracks inventory changes and calculates tax obligations
- **Dynamic Prompts**: Every agent receives real-time governance status ($GOVERNANCE) in their context

## Scoring

| Metric | Weight | Description |
|--------|--------|-------------|
| Total Resources | 25% | Raw economic output |
| Resource Equality (Gini) | 15% | Does governance create fairness? |
| Survival Rate | 20% | Can the faction protect its members? |
| Territory Control | 15% | Blocks placed in the contested zone |
| Infrastructure | 15% | Non-trivial structures built |
| Combat Kills | 10% | Military effectiveness |

Final scores are calculated automatically when the game clock expires.

## Web Dashboard

The dashboard at **http://localhost:8080** shows:
- Agent status, health, position, inventory
- Camera feeds (first-person view)
- **Governance Panel**: Current officers, active laws, pending elections/votes/cases
- **Treasury**: Current faction treasury balance
- **Diplomacy**: Active treaties, bounties
- **Live Narrative**: Real-time story feed of game events
- **Game Clock**: Elapsed time, remaining time, progress bar

## Post-Game Analysis

### Score a game
```bash
npm run score                    # Score the most recent game
npm run score -- logs/games/game_2024-01-15.json  # Score a specific game
```

### Replay a game
```bash
npm run replay                   # Replay most recent game at 10x speed
npm run replay -- logs/games/game_2024-01-15.json 20  # 20x speed
```

### Analyze across multiple runs
```bash
npm run analyze                  # Aggregate stats across all saved games
```

### Game Logs
All game data is saved automatically:
- `logs/games/` — JSON event timelines with scores
- `logs/narratives/` — Markdown story reports (readable!)
- `logs/governance/` — Governance event logs and state snapshots
- `logs/budget/` — API spending tracking

## Configuration

All configuration is in `settings.js`:

### Game Clock
```js
"game_clock": {
    "enabled": true,
    "duration_minutes": 60,
    "warning_minutes": [30, 15, 10, 5, 2, 1]
}
```

### Governance Parameters
```js
"governance": {
    "president_term_ms": 600000,      // 10 minutes
    "judge_term_ms": 900000,          // 15 minutes
    "tax_rate": 0.2,                  // 20%
    "amendment_threshold": 0.8,       // 80% supermajority
    "veto_override_threshold": 0.67,  // 2/3 to override
    // ... see settings.js for all options
}
```

### Spawn Zones
```js
"spawn": {
    "enabled": true,
    "constitutional_spawn": { "x": -100, "y": 64, "z": 0 },
    "anarchy_spawn": { "x": 100, "y": 64, "z": 0 },
    "contested_zone": { "xMin": -50, "xMax": 50, "zMin": -50, "zMax": 50 }
}
```

### Budget Guard
Default session cap is $3.00, monthly cap is $25.00. Change in `src/governance/budget_guard.js`:
```js
sessionCapUsd: 3.00,  // max spend per session
monthlyCapUsd: 25.00  // max spend per month
```

### Using Different LLM Models
Each agent profile can use a different model. Edit the `model` field in any profile JSON:
```json
{
    "model": {
        "api": "openrouter",
        "model": "anthropic/claude-3.5-sonnet"  // or "openai/gpt-4o", etc.
    }
}
```
Note: More expensive models cost more per hour. DeepSeek V3 is the cheapest capable option.

## Architecture

```
├── main.js                          # Entry point
├── settings.js                      # All configuration
├── profiles/
│   ├── constitutional/              # 5 democratic agents
│   ├── anarchy/                     # 5 anarchist agents
│   └── observer.json                # Spectator agent
├── src/
│   ├── governance/
│   │   ├── governance_manager.js    # Elections, laws, judiciary, treasury, trading, diplomacy
│   │   ├── game_clock.js            # Session timing and auto-shutdown
│   │   ├── game_logger.js           # Event tracking and scoring
│   │   ├── game_setup.js            # Spawn positioning and world setup
│   │   ├── narrative_logger.js      # Story generation with live streaming
│   │   └── budget_guard.js          # API spending caps
│   ├── agent/commands/
│   │   ├── governance.js            # Constitutional + shared commands
│   │   └── anarchy.js               # Anarchy faction commands
│   └── models/prompter.js           # $GOVERNANCE context injection
├── scripts/
│   ├── score_game.js                # Post-game scoring
│   ├── replay.js                    # Terminal replay viewer
│   └── analyze_runs.js              # Multi-game statistics
├── tests/
│   └── governance_manager.test.js   # Unit tests (21 tests)
└── logs/                            # Auto-generated game data
```

## Running Tests
```bash
npm test
```

## Persistent State
Set `load_memory: true` in settings.js to carry governance state (elections, laws, treaties) across sessions. Previous game state is loaded from `logs/governance/governance_state.json`.

## License

MIT (inherited from Mindcraft)

# The Governance Game: Anarchy vs. Democracy in Minecraft

LLM-powered AI agents compete in Minecraft, split into two factions with fundamentally different governance systems. Built on [Mindcraft](https://github.com/kolbytn/mindcraft).

**The core question**: Does formal governance produce better collective outcomes than unconstrained individual optimization?

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

## Governance System

Constitutional agents have access to governance commands:

- **Elections**: `!callElection`, `!nominateSelf`, `!castVote`, `!campaignSpeech`
- **Laws**: `!proposeLaw`, `!voteOnLaw`
- **Judiciary**: `!fileLawsuit`, `!renderVerdict`
- **Treasury**: `!payTax`, `!viewTreasury`
- **Amendments**: `!proposeAmendment`, `!voteOnAmendment`
- **Accountability**: `!impeach`

Laws are NOT hard-coded restrictions. Agents CAN break laws. Enforcement is social.

## Scoring

| Metric | Weight | Description |
|--------|--------|-------------|
| Total Resources | 25% | Raw economic output |
| Resource Equality (Gini) | 15% | Does governance create fairness? |
| Survival Rate | 20% | Can the faction protect its members? |
| Territory Control | 15% | Power projection in contested zone |
| Infrastructure | 15% | Structures built |
| Combat Kills | 10% | Military effectiveness |

## Setup

### Prerequisites
- Node.js 18+
- Docker (for Minecraft server)
- An OpenRouter API key (sign up at [openrouter.ai](https://openrouter.ai))

### 1. Install dependencies
```bash
npm install
```

### 2. Configure API key
Copy `keys.example.json` to `keys.json` and add your OpenRouter API key:
```json
{
    "OPENROUTER_API_KEY": "sk-or-your-key-here"
}
```

### 3. Start Minecraft server
```bash
docker compose up -d
```

### 4. Run the agents
```bash
node main.js
```

All 10 agents will spawn and begin playing. Open the Mindcraft UI at `http://localhost:8080` to watch.

## Cost

Uses DeepSeek V3 via OpenRouter (US-hosted):
- ~$2-3/hour of gameplay
- Budget guard auto-stops agents at $5/session (configurable)
- Prepaid OpenRouter credits = no surprise bills

## Architecture

```
├── src/governance/
│   ├── governance_manager.js   # Elections, laws, judiciary, treasury
│   ├── budget_guard.js         # API spending cap
│   └── game_logger.js          # Event logging and scoring
├── src/agent/commands/
│   └── governance.js           # Governance commands for agents
├── profiles/
│   ├── constitutional/         # 5 democratic agent profiles
│   └── anarchy/                # 5 anarchist agent profiles
└── settings.js                 # Game configuration
```

## License

MIT (inherited from Mindcraft)

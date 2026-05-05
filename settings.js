const settings = {
    "minecraft_version": "auto", // or specific version like "1.21.6"
    "host": "127.0.0.1", // or "localhost", "your.ip.address.here"
    "port": 25565, // set to -1 to automatically scan for open ports
    "auth": "offline", // or "microsoft"

    // the mindserver manages all agents and hosts the UI
    "mindserver_port": 8080,
    "auto_open_ui": true, // opens UI in browser on startup

    "base_profile": "survival", // survival mode for the governance experiment
    "profiles": [
        // === DEFAULT: 3v3 (quality over quantity) ===
        // Cheaper (~$0.30/hr), faster startup, no connection throttle issues,
        // each agent has more narrative weight. Uncomment the bottom 4 for 5v5.

        // CONSTITUTIONAL FACTION (3 agents)
        "./profiles/constitutional/madison.json",
        "./profiles/constitutional/hamilton.json",
        "./profiles/constitutional/paine.json",
        // "./profiles/constitutional/marshall.json",  // 5v5: uncomment
        // "./profiles/constitutional/franklin.json",  // 5v5: uncomment

        // ANARCHY FACTION (3 agents)
        "./profiles/anarchy/chaos.json",
        "./profiles/anarchy/wolf.json",
        "./profiles/anarchy/fox.json",
        // "./profiles/anarchy/bear.json",   // 5v5: uncomment
        // "./profiles/anarchy/raven.json",  // 5v5: uncomment
    ],

    // Spawn delay between agents (avoids Paper connection throttle)
    "spawn_delay_ms": 8000,

    "load_memory": false, // load memory from previous session (also loads governance state)

    // N3: world seed (for reproducibility). Captured in saved game logs.
    // The Minecraft server uses LEVEL_SEED env var; this just records what was used.
    "world_seed": "12345",


    // #1 — concrete first moves so the game actually plays
    "init_message": "You spawned into the Governance Game ($GAME_DURATION minutes total).\n\nMINECRAFT BASICS (first 60 seconds):\n1. Punch a tree with bare hands → get oak_log (4-5)\n2. !craftRecipe(\"oak_planks\", 4) → !craftRecipe(\"crafting_table\", 1)\n3. Make sticks → !craftRecipe(\"wooden_pickaxe\", 1)\n4. Mine stone (cobblestone) → upgrade to stone_pickaxe\n5. Find food: !attack on cow/pig/chicken, or !collectBlocks(\"wheat\")\n6. Build a small shelter before night (zombies spawn in dark)\n\nGOVERNANCE STEPS (after first minute):\n- CONSTITUTIONAL: someone MUST !callElection(\"president\") FIRST. THEN others !nominateSelf(\"president\"). Then !castVote. Without callElection first, nominations fail silently.\n- After president is elected, !proposeLaw(\"text\") — laws need majority vote.\n- ANARCHY: !placeBounty(\"target\",\"item\",amount) on strong enemies. Coordinate raids.\n\nUse !goal to set your strategic objective. Be active — silent agents lose.",
    "only_chat_with": [], // empty = chat publicly so all agents can interact

    "speak": false,
    "chat_ingame": true, // bot responses are shown in minecraft chat
    "language": "en",
    "render_bot_view": true, // bot camera feeds at localhost:3000 (Madison), 3001 (Hamilton), ..., 3009 (Raven)

    // === CAMERA FEED TUNING ===
    // Trade-off: higher values = better visuals, lower = smoother FPS
    // With 10 agents, GPU/CPU renders 10 cameras simultaneously
    // Recommended: 640x480 @ viewDistance 4 for balance
    //              1280x720 @ viewDistance 6 for quality (may chug)
    "viewer": {
        "firstPerson": true,    // false = third-person
        "viewDistance": 4,      // 4 = balanced
        "width": 1280,          // 720p — decent quality
        "height": 720
    },


    "allow_insecure_coding": false, // keep this off for safety
    "allow_vision": false,
    "blocked_actions" : ["!checkBlueprint", "!checkBlueprintLevel", "!getBlueprint", "!getBlueprintLevel"],
    "code_timeout_mins": -1,
    "relevant_docs_count": 5,

    "max_messages": 20, // slightly higher for governance conversations
    "num_examples": 2,
    "max_commands": -1,
    "show_command_syntax": "full",
    "narrate_behavior": true,
    "chat_bot_messages": true, // bots chat with each other publicly

    "spawn_timeout": 60, // increased for 10 agents spawning
    "block_place_delay": 0,

    "log_all_prompts": false, // set to true for debugging

    // === BUDGET CONTROL ===
    // Per-session and per-month spending caps. session_cap_usd is the hard
    // kill-switch — agents stop the moment cumulative LLM cost exceeds it.
    "budget": {
        "session_cap_usd": 3.00,        // hard cap per game/run
        "monthly_cap_usd": 25.00,       // soft tracking only (not enforced)
        "warning_threshold": 0.80       // warn at 80% of session cap
    },

    // === GAME CLOCK ===
    // Controls the session duration and time warnings
    "game_clock": {
        "enabled": true,                    // set to false to disable the game clock
        "duration_minutes": 10,             // how long the game lasts (30 min = ~$1.50-2.50)
        "warning_minutes": [30, 15, 10, 5, 2, 1]  // when to warn agents about remaining time
    },

    // === GOVERNANCE CONFIGURATION ===
    // All governance parameters are configurable for experimentation
    "governance": {
        // Faction members — MUST match the profiles list above
        "constitutional_members": ["Madison", "Hamilton", "Paine"],     // 3v3 default
        "anarchy_members": ["Chaos", "Wolf", "Fox"],                    // 3v3 default
        // For 5v5, use:
        // "constitutional_members": ["Madison", "Hamilton", "Paine", "Marshall", "Franklin"],
        // "anarchy_members": ["Chaos", "Wolf", "Fox", "Bear", "Raven"],

        // Term durations
        "president_term_ms": 600000,        // 10 minutes
        "judge_term_ms": 900000,            // 15 minutes

        // Voting periods
        "nomination_period_ms": 60000,      // 1 minute for nominations
        "voting_period_ms": 90000,          // 90 seconds for election voting
        "law_voting_period_ms": 120000,     // 2 minutes for law voting

        // Economic parameters
        "tax_rate": 0.2,                    // 20% flat tax on valuable items
        "tax_items": ["diamond", "iron_ingot", "gold_ingot", "emerald"],

        // Constitutional thresholds (tuned for 3v3 — lower required %s for small factions)
        "amendment_threshold": 0.67,        // 2/3 = 2 of 3 (was 0.8 for 5v5 = 4 of 5)
        "veto_override_threshold": 0.6,     // 60% = 2 of 3 (was 0.67 for 5v5 = 4 of 6)

        // Governance tick interval
        "tick_interval_ms": 10000           // 10 seconds between governance ticks
    },

    // === SPAWN POSITIONING (#3) ===
    // Faction spawn zones and contested territory — ON by default for territory dynamics
    "spawn": {
        "enabled": true,                    // teleport factions to their zones on spawn
        "constitutional_spawn": { "x": -100, "y": 70, "z": 0 },
        "anarchy_spawn": { "x": 100, "y": 70, "z": 0 },
        "contested_zone": {
            "xMin": -50, "xMax": 50,
            "zMin": -50, "zMax": 50
        },
        "world_border": {
            "enabled": false,
            "radius": 200                   // blocks from center
        },
        "spawn_protection_seconds": 30      // #11: agents take no damage for first 30s
    },

    // === SCORING (#9) ===
    // Configurable scoring weights — must sum to 1.0
    "scoring": {
        "weights": {
            "totalResources": 0.25,
            "resourceEquality": 0.15,
            "survivalRate": 0.20,
            "territoryControl": 0.15,
            "infrastructure": 0.15,
            "combatKills": 0.10
        }
    },

    // === WIN CONDITIONS (#7) ===
    // What ends the game and determines winner
    "win_conditions": {
        "primary": "timeout",              // timeout | first_to_resources | last_faction_standing | territory_hold
        "first_to_resources": {            // win immediately if a faction collects this much
            "enabled": false,
            "threshold": 500
        },
        "last_faction_standing": {         // win if all members of opposing faction are dead
            "enabled": false
        },
        "territory_hold": {                // win if a faction holds X% of contested zone for N min
            "enabled": false,
            "minutes_required": 5,
            "blocks_threshold": 0.6
        }
    },

    // === GOVERNANCE NUDGES (#1) ===
    // Timed system broadcasts to push agents toward governance actions
    "governance_nudges": {
        "enabled": true,
        "schedule_seconds": [60, 180, 360, 600]  // when to nudge (60s, 3m, 6m, 10m)
    },

    // === LOW HP BROADCAST (#6) ===
    "low_hp_broadcast": {
        "enabled": true,
        "threshold": 8           // HP at which to broadcast to faction
    },
}

if (process.env.SETTINGS_JSON) {
    try {
        Object.assign(settings, JSON.parse(process.env.SETTINGS_JSON));
    } catch (err) {
        console.error("Failed to parse SETTINGS_JSON:", err);
    }
}

export default settings;

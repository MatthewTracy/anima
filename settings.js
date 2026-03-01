const settings = {
    "minecraft_version": "auto", // or specific version like "1.21.6"
    "host": "127.0.0.1", // or "localhost", "your.ip.address.here"
    "port": 55916, // set to -1 to automatically scan for open ports
    "auth": "offline", // or "microsoft"

    // the mindserver manages all agents and hosts the UI
    "mindserver_port": 8080,
    "auto_open_ui": true, // opens UI in browser on startup

    "base_profile": "survival", // survival mode for the governance experiment
    "profiles": [
        // === CONSTITUTIONAL FACTION (5 agents) ===
        "./profiles/constitutional/madison.json",
        "./profiles/constitutional/hamilton.json",
        "./profiles/constitutional/paine.json",
        "./profiles/constitutional/marshall.json",
        "./profiles/constitutional/franklin.json",

        // === ANARCHY FACTION (5 agents) ===
        "./profiles/anarchy/chaos.json",
        "./profiles/anarchy/wolf.json",
        "./profiles/anarchy/fox.json",
        "./profiles/anarchy/bear.json",
        "./profiles/anarchy/raven.json",
    ],

    "load_memory": false, // load memory from previous session
    "init_message": "You have spawned into the Governance Game. Look around, gather resources, and begin working toward your faction's goals. Use !goal to set your first objective.", // sends to all on spawn
    "only_chat_with": [], // empty = chat publicly so all agents can interact

    "speak": false,
    "chat_ingame": true, // bot responses are shown in minecraft chat
    "language": "en",
    "render_bot_view": true, // bot camera feeds at localhost:3000 (Madison), 3001 (Hamilton), ..., 3009 (Raven)

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

}

if (process.env.SETTINGS_JSON) {
    try {
        Object.assign(settings, JSON.parse(process.env.SETTINGS_JSON));
    } catch (err) {
        console.error("Failed to parse SETTINGS_JSON:", err);
    }
}

export default settings;

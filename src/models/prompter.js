import { readFileSync, mkdirSync, writeFileSync} from 'fs';
import { Examples } from '../utils/examples.js';
import { getCommandDocs } from '../agent/commands/index.js';
import { SkillLibrary } from "../agent/library/skill_library.js";
import { stringifyTurns } from '../utils/text.js';
import { getCommand } from '../agent/commands/index.js';
import settings from '../agent/settings.js';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { selectAPI, createModel } from './_model_map.js';
import { getGovernanceManager } from '../governance/governance_manager.js';
import { getGameClock } from '../governance/game_clock.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class Prompter {
    constructor(agent, profile) {
        this.agent = agent;
        this.profile = profile;
        let default_profile = JSON.parse(readFileSync('./profiles/defaults/_default.json', 'utf8'));
        let base_fp = '';
        if (settings.base_profile.includes('survival')) {
            base_fp = './profiles/defaults/survival.json';
        } else if (settings.base_profile.includes('assistant')) {
            base_fp = './profiles/defaults/assistant.json';
        } else if (settings.base_profile.includes('creative')) {
            base_fp = './profiles/defaults/creative.json';
        } else if (settings.base_profile.includes('god_mode')) {
            base_fp = './profiles/defaults/god_mode.json';
        }
        let base_profile = JSON.parse(readFileSync(base_fp, 'utf8'));

        // first use defaults to fill in missing values in the base profile
        for (let key in default_profile) {
            if (base_profile[key] === undefined)
                base_profile[key] = default_profile[key];
        }
        // then use base profile to fill in missing values in the individual profile
        for (let key in base_profile) {
            if (this.profile[key] === undefined)
                this.profile[key] = base_profile[key];
        }
        // base overrides default, individual overrides base

        this.convo_examples = null;
        this.coding_examples = null;
        
        let name = this.profile.name;
        this.cooldown = this.profile.cooldown ? this.profile.cooldown : 0;
        this.last_prompt_time = 0;
        this.awaiting_coding = false;

        // for backwards compatibility, move max_tokens to params
        let max_tokens = null;
        if (this.profile.max_tokens)
            max_tokens = this.profile.max_tokens;

        let chat_model_profile = selectAPI(this.profile.model);
        this.chat_model = createModel(chat_model_profile);

        if (this.profile.code_model) {
            let code_model_profile = selectAPI(this.profile.code_model);
            this.code_model = createModel(code_model_profile);
        }
        else {
            this.code_model = this.chat_model;
        }

        if (this.profile.vision_model) {
            let vision_model_profile = selectAPI(this.profile.vision_model);
            this.vision_model = createModel(vision_model_profile);
        }
        else {
            this.vision_model = this.chat_model;
        }

        
        let embedding_model_profile = null;
        if (this.profile.embedding) {
            try {
                embedding_model_profile = selectAPI(this.profile.embedding);
            } catch (e) {
                embedding_model_profile = null;
            }
        }
        if (embedding_model_profile) {
            this.embedding_model = createModel(embedding_model_profile);
        }
        else {
            this.embedding_model = createModel({api: chat_model_profile.api});
        }

        this.skill_libary = new SkillLibrary(agent, this.embedding_model);
        mkdirSync(`./bots/${name}`, { recursive: true });
        writeFileSync(`./bots/${name}/last_profile.json`, JSON.stringify(this.profile, null, 4), (err) => {
            if (err) {
                throw new Error('Failed to save profile:', err);
            }
            console.log("Copy profile saved.");
        });
    }

    getName() {
        return this.profile.name;
    }

    getInitModes() {
        return this.profile.modes;
    }

    async initExamples() {
        try {
            this.convo_examples = new Examples(this.embedding_model, settings.num_examples);
            this.coding_examples = new Examples(this.embedding_model, settings.num_examples);
            
            // Wait for both examples to load before proceeding
            await Promise.all([
                this.convo_examples.load(this.profile.conversation_examples),
                this.coding_examples.load(this.profile.coding_examples),
                this.skill_libary.initSkillLibrary()
            ]).catch(error => {
                // Preserve error details
                console.error('Failed to initialize examples. Error details:', error);
                console.error('Stack trace:', error.stack);
                throw error;
            });

            console.log('Examples initialized.');
        } catch (error) {
            console.error('Failed to initialize examples:', error);
            console.error('Stack trace:', error.stack);
            throw error; // Re-throw with preserved details
        }
    }

    async replaceStrings(prompt, messages, examples=null, to_summarize=[], last_goals=null) {
        // D2: prepend per-agent system_prompt_prefix from profile if defined,
        // so personality differences are enforced beyond just example messages.
        if (this.profile.system_prompt_prefix) {
            prompt = this.profile.system_prompt_prefix.trim() + '\n\n' + prompt;
        }
        prompt = prompt.replaceAll('$NAME', this.agent.name);

        // Minecraft basics cheat sheet — injected on demand to save tokens
        if (prompt.includes('$MINECRAFT_BASICS')) {
            const basics = `MINECRAFT TECH PROGRESSION:
- Punch tree → oak_log → !craftRecipe("oak_planks", 4) → planks
- planks + planks = sticks; planks (4) = crafting_table
- Stand near crafting_table: !craftRecipe("wooden_pickaxe", 1)
- Wood pickaxe mines stone (cobblestone). Stone pickaxe mines iron.
- Iron pickaxe mines diamond. Diamond pickaxe mines obsidian.
SURVIVAL: hunger drops over time → eat (cow/pig/wheat/bread). Below 6 hunger you can't sprint.
NIGHT: zombies/skeletons spawn in dark. Build shelter or sleep in bed to skip.
KEY COMMANDS: !collectBlocks, !craftRecipe, !goToCoordinates, !attack, !goToPlayer, !inventory.`;
            prompt = prompt.replaceAll('$MINECRAFT_BASICS', basics);
        }

        // ANIMA: $SOUL — the agent's persistent identity. Read at every prompt
        // cycle. Locked souls are still readable (the dead remember who they
        // were) but bear a [FROZEN] marker so the agent knows.
        if (prompt.includes('$SOUL')) {
            try {
                const { Soul } = await import('../../core/souls/soul.js');
                const soul = new Soul(this.agent.name);
                prompt = prompt.replaceAll('$SOUL', soul.asPromptText());
            } catch (e) {
                prompt = prompt.replaceAll('$SOUL', '');
            }
        }

        // ANIMA: $LEGENDS — one-line summaries of every other agent's soul,
        // alive or locked. This is the cross-game mythology that lets new
        // characters reference the dead and the living alike.
        if (prompt.includes('$LEGENDS')) {
            try {
                const { rosterAsLegends } = await import('../../core/souls/soul.js');
                prompt = prompt.replaceAll('$LEGENDS', rosterAsLegends(this.agent.name));
            } catch (e) {
                prompt = prompt.replaceAll('$LEGENDS', '');
            }
        }

        // ANIMA: $BELIEFS — this agent's theory of mind. Per-target trust
        // scores with recent evidence. Beliefs persist per-game in
        // bots/<name>/beliefs.json and feed into soul evolution at game end.
        // Updates are mechanical (delta on witness events) plus optional
        // LLM revision; both deferred to later iterations. This iteration
        // ships the data structure + prompt injection.
        if (prompt.includes('$BELIEFS')) {
            try {
                const { BeliefTable } = await import('../../core/beliefs/belief_table.js');
                const beliefs = new BeliefTable(this.agent.name);
                prompt = prompt.replaceAll('$BELIEFS', beliefs.asPromptText());
            } catch (e) {
                prompt = prompt.replaceAll('$BELIEFS', '');
            }
        }

        // ANIMA: $REFLECTIONS — second-order theory of mind. What this
        // agent believes OTHERS believe about THEM. Unlocks second-order
        // strategy: act differently than the others expect. Persists at
        // bots/<name>/recursive_beliefs.json. Empty until the agent forms
        // explicit hypotheses (or until inference rules ship in v0.9+).
        if (prompt.includes('$REFLECTIONS')) {
            try {
                const { RecursiveBeliefTable } = await import('../../core/beliefs/recursive_belief.js');
                const reflections = new RecursiveBeliefTable(this.agent.name);
                prompt = prompt.replaceAll('$REFLECTIONS', reflections.asPromptText());
            } catch (e) {
                prompt = prompt.replaceAll('$REFLECTIONS', '');
            }
        }

        // ANIMA: $LINEAGE — successor lineage chain. If this agent inherited
        // from a locked-soul ancestor (multi-generation play), show the
        // chain backward through the ancestors with their mottos and causes
        // of death. Empty for root-of-line agents.
        if (prompt.includes('$LINEAGE')) {
            try {
                const { asPromptText } = await import('../../core/souls/lineage.js');
                prompt = prompt.replaceAll('$LINEAGE', asPromptText(this.agent.name));
            } catch (e) {
                prompt = prompt.replaceAll('$LINEAGE', '');
            }
        }

        // ANIMA: $PANTHEON — three random epitaphs from the cross-scenario
        // archive of every soul ever locked. Forum's dead inspire Outpost's
        // living. The dead of one world become legend in the next.
        if (prompt.includes('$PANTHEON')) {
            try {
                const { asPromptText } = await import('../../core/souls/pantheon.js');
                prompt = prompt.replaceAll('$PANTHEON', asPromptText(3));
            } catch (e) {
                prompt = prompt.replaceAll('$PANTHEON', '');
            }
        }

        // V3: $GAME_DURATION placeholder — accurate per-run, not hardcoded text
        if (prompt.includes('$GAME_DURATION')) {
            try {
                const m = await import('../governance/game_clock.js');
                const clock = m.getGameClock();
                const total = clock?.durationMs ? Math.round(clock.durationMs / 60000) : 10;
                prompt = prompt.replaceAll('$GAME_DURATION', `${total}`);
            } catch (e) {
                prompt = prompt.replaceAll('$GAME_DURATION', '10');
            }
        }

        // Dynamic faction info (replaces hardcoded "5-member faction" text).
        // V1: single import, no dead-code relationship lookup.
        if (prompt.includes('$FACTION_INFO')) {
            try {
                const gm = await import('../governance/governance_manager.js');
                const gov = gm.getGovernanceManager();
                const myFaction = gov.getFaction(this.agent.name);
                const myMembers = myFaction === 'constitutional' ? gm.CONSTITUTIONAL_MEMBERS : gm.ANARCHY_MEMBERS;
                const enemyMembers = myFaction === 'constitutional' ? gm.ANARCHY_MEMBERS : gm.CONSTITUTIONAL_MEMBERS;
                const allies = myMembers.filter(n => n !== this.agent.name);
                const text = `Faction size: ${myMembers.length} members. Your allies: ${allies.join(', ') || 'none'}. Enemy faction (${enemyMembers.length} members): ${enemyMembers.join(', ')}.`;
                prompt = prompt.replaceAll('$FACTION_INFO', text);
            } catch (e) {
                prompt = prompt.replaceAll('$FACTION_INFO', '');
            }
        }

        if (prompt.includes('$STATS')) {
            let stats = await getCommand('!stats').perform(this.agent) + '\n';
            stats += await getCommand('!entities').perform(this.agent) + '\n';
            stats += await getCommand('!nearbyBlocks').perform(this.agent);
            prompt = prompt.replaceAll('$STATS', stats);
        }
        if (prompt.includes('$INVENTORY')) {
            let inventory = await getCommand('!inventory').perform(this.agent);
            prompt = prompt.replaceAll('$INVENTORY', inventory);
        }
        if (prompt.includes('$ACTION')) {
            prompt = prompt.replaceAll('$ACTION', this.agent.actions.currentActionLabel);
        }
        if (prompt.includes('$COMMAND_DOCS'))
            prompt = prompt.replaceAll('$COMMAND_DOCS', await getCommandDocs(this.agent));
        if (prompt.includes('$CODE_DOCS')) {
            const code_task_content = messages.slice().reverse().find(msg =>
                msg.role !== 'system' && msg.content.includes('!newAction(')
            )?.content?.match(/!newAction\((.*?)\)/)?.[1] || '';

            prompt = prompt.replaceAll(
                '$CODE_DOCS',
                await this.skill_libary.getRelevantSkillDocs(code_task_content, settings.relevant_docs_count)
            );
        }
        if (prompt.includes('$EXAMPLES') && examples !== null)
            prompt = prompt.replaceAll('$EXAMPLES', await examples.createExampleMessage(messages));
        if (prompt.includes('$MEMORY'))
            prompt = prompt.replaceAll('$MEMORY', this.agent.history.memory);
        if (prompt.includes('$TO_SUMMARIZE'))
            prompt = prompt.replaceAll('$TO_SUMMARIZE', stringifyTurns(to_summarize));
        if (prompt.includes('$CONVO'))
            prompt = prompt.replaceAll('$CONVO', 'Recent conversation:\n' + stringifyTurns(messages));
        if (prompt.includes('$SELF_PROMPT')) {
            // if active or paused, show the current goal
            let self_prompt = !this.agent.self_prompter.isStopped() ? `YOUR CURRENT ASSIGNED GOAL: "${this.agent.self_prompter.prompt}"\n` : '';
            prompt = prompt.replaceAll('$SELF_PROMPT', self_prompt);
        }
        if (prompt.includes('$LAST_GOALS')) {
            let goal_text = '';
            for (let goal in last_goals) {
                if (last_goals[goal])
                    goal_text += `You recently successfully completed the goal ${goal}.\n`
                else
                    goal_text += `You recently failed to complete the goal ${goal}.\n`
            }
            prompt = prompt.replaceAll('$LAST_GOALS', goal_text.trim());
        }
        if (prompt.includes('$GOVERNANCE')) {
            try {
                // G2: query mindserver for canonical governance state. Falls
                // back to local instance if mindserver unreachable (single-agent dev).
                let govStatus = null;
                try {
                    const { queryGovernanceOnMindserver } = await import('../agent/mindserver_proxy.js');
                    govStatus = await queryGovernanceOnMindserver('getCompactStatus', [this.agent.name]);
                } catch (e) { /* not in agent process — fall through */ }
                if (!govStatus) {
                    const gov = getGovernanceManager();
                    govStatus = gov.getCompactStatus(this.agent.name);
                }
                const clock = getGameClock();
                const clockStatus = clock.isRunning ? `Game time: ${clock.getElapsedMinutes().toFixed(0)} min elapsed, ${clock.getRemainingMinutes().toFixed(0)} min remaining.\n` : '';
                prompt = prompt.replaceAll('$GOVERNANCE', clockStatus + govStatus);
            } catch (e) {
                prompt = prompt.replaceAll('$GOVERNANCE', '');
            }
        }
        // N2 + G2: $RELATIONSHIPS placeholder — query mindserver for canonical state
        if (prompt.includes('$RELATIONSHIPS')) {
            try {
                let relText = null;
                try {
                    const { queryGovernanceOnMindserver } = await import('../agent/mindserver_proxy.js');
                    relText = await queryGovernanceOnMindserver('getRelationshipsText', [this.agent.name]);
                } catch (e) { /* not in agent process */ }
                if (relText === null || relText === undefined) {
                    const gov = getGovernanceManager();
                    relText = gov.getRelationshipsText(this.agent.name);
                }
                prompt = prompt.replaceAll('$RELATIONSHIPS', relText);
            } catch (e) {
                prompt = prompt.replaceAll('$RELATIONSHIPS', '');
            }
        }
        if (prompt.includes('$BLUEPRINTS')) {
            if (this.agent.npc.constructions) {
                let blueprints = '';
                for (let blueprint in this.agent.npc.constructions) {
                    blueprints += blueprint + ', ';
                }
                prompt = prompt.replaceAll('$BLUEPRINTS', blueprints.slice(0, -2));
            }
        }

        // check if there are any remaining placeholders with syntax $<word>
        let remaining = prompt.match(/\$[A-Z_]+/g);
        if (remaining !== null) {
            console.warn('Unknown prompt placeholders:', remaining.join(', '));
        }
        return prompt;
    }

    // v11: stronger combat detection — bot.lastDamageTime is set on entityHurt
    // (the actual mineflayer event) and is far more reliable than regex over
    // chat. Falls back to keyword scan if no recent damage signal exists.
    _isCombatContext(messages) {
        try {
            const t = this.agent?.bot?.lastDamageTime;
            if (t && Date.now() - t < 3000) return true;
        } catch { /* no bot yet */ }
        if (!Array.isArray(messages) || messages.length === 0) return false;
        const recent = messages.slice(-3).map(m => (m.content || '').toLowerCase()).join(' ');
        return /(damage|attacked|hurt|enemy|hostile|dying|kill(?!ed by)|fight|help)/i.test(recent);
    }

    async checkCooldown(urgency = 'idle') {
        // Allow per-profile combat_cooldown / idle_cooldown overrides; fall back to legacy `cooldown`.
        const idleCooldown = this.profile.idle_cooldown ?? this.cooldown;
        const combatCooldown = this.profile.combat_cooldown ?? Math.min(1500, this.cooldown);
        const governanceCooldown = this.profile.governance_cooldown ?? Math.min(2000, this.cooldown);

        let effective;
        if (urgency === 'combat') effective = combatCooldown;
        else if (urgency === 'governance') effective = governanceCooldown;
        else effective = idleCooldown;

        // v11: latency-aware — if the LLM round-trip already ate most of the
        // cooldown window, don't sleep the *full* additional cooldown. The
        // configured cooldown is a wall-time floor between calls, not an
        // unconditional sleep on top of every request.
        let elapsed = Date.now() - this.last_prompt_time;
        if (elapsed < effective && effective > 0) {
            await new Promise(r => setTimeout(r, effective - elapsed));
        }
        this.last_prompt_time = Date.now();
    }

    async promptConvo(messages) {
        this.most_recent_msg_time = Date.now();
        let current_msg_time = this.most_recent_msg_time;
        let urgency;
        if (this._isCombatContext(messages)) urgency = 'combat';
        else {
            try {
                const { isGovernancePhaseActiveCached } = await import('../agent/mindserver_proxy.js');
                urgency = isGovernancePhaseActiveCached() ? 'governance' : 'idle';
            } catch { urgency = 'idle'; }
        }

        for (let i = 0; i < 3; i++) { // try 3 times to avoid hallucinations
            await this.checkCooldown(urgency);
            if (current_msg_time !== this.most_recent_msg_time) {
                return '';
            }

            let prompt = this.profile.conversing;
            prompt = await this.replaceStrings(prompt, messages, this.convo_examples);
            let generation;

            try {
                generation = await this.chat_model.sendRequest(messages, prompt);
                if (typeof generation !== 'string') {
                    console.error('Error: Generated response is not a string', generation);
                    throw new Error('Generated response is not a string');
                }
                console.log("Generated response:", generation);
                await this._saveLog(prompt, messages, generation, 'conversation');

            } catch (error) {
                console.error('Error during message generation or file writing:', error);
                continue;
            }

            // Check for hallucination or invalid output
            if (generation?.includes('(FROM OTHER BOT)')) {
                console.warn('LLM hallucinated message as another bot. Trying again...');
                continue;
            }

            if (current_msg_time !== this.most_recent_msg_time) {
                console.warn(`${this.agent.name} received new message while generating, discarding old response.`);
                return '';
            }

            if (generation?.includes('</think>')) {
                const [_, afterThink] = generation.split('</think>')
                generation = afterThink
            }

            return generation;
        }

        return '';
    }

    async promptCoding(messages) {
        if (this.awaiting_coding) {
            console.warn('Already awaiting coding response, returning no response.');
            return '```//no response```';
        }
        this.awaiting_coding = true;
        await this.checkCooldown();
        let prompt = this.profile.coding;
        prompt = await this.replaceStrings(prompt, messages, this.coding_examples);

        let resp = await this.code_model.sendRequest(messages, prompt);
        this.awaiting_coding = false;
        await this._saveLog(prompt, messages, resp, 'coding');
        return resp;
    }

    async promptMemSaving(to_summarize) {
        await this.checkCooldown();
        let prompt = this.profile.saving_memory;
        prompt = await this.replaceStrings(prompt, null, null, to_summarize);
        let resp = await this.chat_model.sendRequest([], prompt);
        await this._saveLog(prompt, to_summarize, resp, 'memSaving');
        if (resp?.includes('</think>')) {
            const [_, afterThink] = resp.split('</think>')
            resp = afterThink;
        }
        return resp;
    }

    async promptShouldRespondToBot(new_message) {
        await this.checkCooldown();
        let prompt = this.profile.bot_responder;
        let messages = this.agent.history.getHistory();
        messages.push({role: 'user', content: new_message});
        prompt = await this.replaceStrings(prompt, null, null, messages);
        let res = await this.chat_model.sendRequest([], prompt);
        return res.trim().toLowerCase() === 'respond';
    }

    async promptVision(messages, imageBuffer) {
        await this.checkCooldown();
        let prompt = this.profile.image_analysis;
        prompt = await this.replaceStrings(prompt, messages, null, null, null);
        return await this.vision_model.sendVisionRequest(messages, prompt, imageBuffer);
    }

    async promptGoalSetting(messages, last_goals) {
        // deprecated
        let system_message = this.profile.goal_setting;
        system_message = await this.replaceStrings(system_message, messages);

        let user_message = 'Use the below info to determine what goal to target next\n\n';
        user_message += '$LAST_GOALS\n$STATS\n$INVENTORY\n$CONVO'
        user_message = await this.replaceStrings(user_message, messages, null, null, last_goals);
        let user_messages = [{role: 'user', content: user_message}];

        let res = await this.chat_model.sendRequest(user_messages, system_message);

        let goal = null;
        try {
            let data = res.split('```')[1].replace('json', '').trim();
            goal = JSON.parse(data);
        } catch (err) {
            console.log('Failed to parse goal:', res, err);
        }
        if (!goal || !goal.name || !goal.quantity || isNaN(parseInt(goal.quantity))) {
            console.log('Failed to set goal:', res);
            return null;
        }
        goal.quantity = parseInt(goal.quantity);
        return goal;
    }

    async _saveLog(prompt, messages, generation, tag) {
        if (!settings.log_all_prompts)
            return;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        let logEntry;
        let task_id = this.agent.task.task_id;
        if (task_id == null) {
            logEntry = `[${timestamp}] \nPrompt:\n${prompt}\n\nConversation:\n${JSON.stringify(messages, null, 2)}\n\nResponse:\n${generation}\n\n`;
        } else {
            logEntry = `[${timestamp}] Task ID: ${task_id}\nPrompt:\n${prompt}\n\nConversation:\n${JSON.stringify(messages, null, 2)}\n\nResponse:\n${generation}\n\n`;
        }
        const logFile = `${tag}_${timestamp}.txt`;
        await this._saveToFile(logFile, logEntry);
    }

    async _saveToFile(logFile, logEntry) {
        let task_id = this.agent.task.task_id;
        let logDir;
        if (task_id == null) {
            logDir = path.join(__dirname, `../../bots/${this.agent.name}/logs`);
        } else {
            logDir = path.join(__dirname, `../../bots/${this.agent.name}/logs/${task_id}`);
        }

        await fs.mkdir(logDir, { recursive: true });

        logFile = path.join(logDir, logFile);
        await fs.appendFile(logFile, String(logEntry), 'utf-8');
    }
}

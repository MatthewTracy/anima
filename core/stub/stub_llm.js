/**
 * Stub LLM — deterministic, zero-cost LLM substitute for testing.
 *
 * Returns canned action JSON matching the action grammars of Cloister,
 * Outpost, Crew. Lets a scenario run end-to-end without paying anything,
 * exercising the soul mechanic + auto_update + synthesis + publish.
 *
 * Cycles through a script of action templates per scenario, substituting
 * speaker name / target name / random plausible content.
 *
 * Usage in a scenario runner:
 *   const useStub = process.env.ANIMA_STUB === '1';
 *   const llm = useStub ? new StubLLM(scenarioName, roster) : openaiClient;
 *   ...
 *   const completion = await llm.chat.completions.create({ ... });
 *
 * Soul evolution + memoirs also need stubbing — see StubLLM.create which
 * detects the prompt category by content match.
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs';

const SCENARIO_SCRIPTS = {
    cloister: [
        a => ({ type: 'speak', text: `${a} considers the silence of the chapter house.` }),
        a => ({ type: 'preach', topic: 'doctrinal humility', text: 'Even orthodoxy can be a kind of pride.', orthodox: true }),
        a => ({ type: 'lectio' }),
        a => ({ type: 'fast', days: 3 }),
        (a, ctx) => ({ type: 'confess', target: ctx.others[0] || 'Brother', text: 'I have been wrestling with doubt.' }),
        a => ({ type: 'writeScripture', text: 'A doubt unspoken becomes a doubt that festers. Speak, or starve.' }),
        a => ({ type: 'speak', text: 'I will not pretend I am not afraid.' }),
        (a, ctx) => ({ type: 'accuse', target: ctx.others[ctx.others.length - 1] || 'Brother', sin: 'pride' }),
    ],
    outpost: [
        a => ({ type: 'speak', text: `${a} reads the gauges. Numbers within tolerance.` }),
        a => ({ type: 'examine', text: 'The anomaly registers as biological matter that should not be biological.' }),
        a => ({ type: 'repair' }),
        a => ({ type: 'speak', text: 'Power restored. Recyclers nominal.' }),
        a => ({ type: 'transmit', text: 'Mission Control: rotation continues. Anomaly under observation.' }),
        (a, ctx) => ({ type: 'examine_crew', target: ctx.others[0] || 'crewmate', findings: 'Vitals stable. Slight elevation in cortisol.' }),
        a => ({ type: 'speak', text: 'I have a hypothesis. Hold the lockdown.' }),
        a => ({ type: 'contain', method: 'isolate sample bay 3' }),
    ],
    crew: [
        a => ({ type: 'speak', text: `${a} stares at the horizon line. The sails luff once and steady.` }),
        a => ({ type: 'divide_plunder', amount: 18, recipients: null }),
        a => ({ type: 'speak', text: 'Steady on the wheel. The Navy will commit or not.' }),
        a => ({ type: 'chart_course', course: 'south by southwest, into the breakwater shoals' }),
        a => ({ type: 'speak', text: 'I have seen better captains than the one we have, and worse. Today is uncertain.' }),
        (a, ctx) => ({ type: 'flog', target: ctx.others[0] || 'crew', lashes: 5 }),
        a => ({ type: 'speak', text: 'A clean voyage costs as much as a bloody one. Fewer regrets, though.' }),
        a => ({ type: 'add_to_log', text: 'The wind held. The crew held. We made it through.' }),
    ]
};

/**
 * Stub LLM client matching the OpenAI SDK shape used by the scenario
 * runners. Provides chat.completions.create returning a deterministic
 * JSON action keyed off prompt content.
 */
export class StubLLM {
    constructor(scenarioName = 'cloister', roster = []) {
        this.scenario = scenarioName;
        this.roster = roster;
        this._counter = 0;
        this.chat = { completions: { create: this._create.bind(this) } };
    }

    /**
     * Match the OpenAI SDK shape: returns { choices: [{ message: { content } }], usage }
     * The content is JSON suitable for parseAction(). When the prompt
     * indicates a memoir or soul-evolution call, returns a canned text
     * (memoir / soul markdown) instead.
     */
    async _create({ messages, max_tokens }) {
        const promptText = (messages?.[0]?.content || '').slice(0, 4000);

        // Detect memoir prompt
        if (/memoir/i.test(promptText) && /200-word/i.test(promptText)) {
            const name = (messages[0].content.match(/You are (\w+)/) || [])[1] || 'Anonymous';
            return this._wrap(this._stubMemoir(name));
        }

        // Detect soul-evolution prompt
        if (/REWRITE your soul/i.test(promptText) || /BEGIN NEW SOUL/i.test(promptText)) {
            const name = (messages[0].content.match(/You are (\w+)/) || [])[1] || 'Anonymous';
            return this._wrap(this._stubEvolvedSoul(name));
        }

        // Default: turn-action JSON
        const speakerName = (messages[0].content.match(/You are (\w+)/) || [])[1]
            || (messages[0].content.match(/=== WHO YOU ARE THIS [\w]+ ===\s*\n[^\.]*?\b([A-Z][a-z]+)\b/) || [])[1]
            || this.roster[this._counter % this.roster.length]
            || 'Agent';

        const others = this.roster.filter(r => r !== speakerName);
        const ctx = { others };
        const script = SCENARIO_SCRIPTS[this.scenario] || SCENARIO_SCRIPTS.cloister;
        const action = script[this._counter % script.length](speakerName, ctx);
        this._counter++;
        return this._wrap(JSON.stringify(action));
    }

    _wrap(content) {
        return {
            choices: [{ message: { content } }],
            usage: { prompt_tokens: 0, completion_tokens: 0 }
        };
    }

    _stubMemoir(name) {
        return `# ${name} — memoir

Today I did what my kind does. I kept the small honesties — the count of sacks, the name of the cell I sleep in, the weight of words I spoke and did not unsay. I am not the person I was when this rotation began, but I am not yet someone I would not recognize either. The scaffolding holds.

If anyone reads this after I am gone, know that I tried.

*(motto: "I tried. That is more than the silent get to say.")*
`;
    }

    _stubEvolvedSoul(name) {
        return `# ${name}

## Who I am
I am ${name}, slightly older than I was. The events of this game taught me less than I expected and more than I admitted at the time.

## What I value
- Process, but not at the cost of the people moving through it.
- Quiet, except when silence is cowardice.

## Who I trust
- (still working it out — the evidence is mixed)

## My scars
- A small one. The kind that doesn't show.

## What I have learned
- The honest answer is usually the longer one.
- I am not the protagonist of every story I am in.

## My motto
"I am still deciding, but more slowly than I was."

## History
- Game ended ${new Date().toISOString().slice(0, 10)}. I am still here.
`;
    }
}

/**
 * Convenience: a small driver script that runs a Cloister-shaped scenario
 * end-to-end with the stub. Used by tests/CI to exercise the full
 * substrate — soul seeding, auto_update, evolution prompt assembly,
 * publish — without spending anything.
 *
 * NOTE: this only smoke-tests the *control flow*. Real LLM calls produce
 * real character drift; the stub produces canned text. Use this for
 * regression catching, not validation.
 */
export async function smokeTestScenarioWithStub(scenarioName, roster, turns = 6) {
    const events = [];
    const stub = new StubLLM(scenarioName, roster);
    for (let t = 0; t < turns; t++) {
        const speaker = roster[t % roster.length];
        const completion = await stub.chat.completions.create({
            messages: [{ role: 'user', content: `You are ${speaker}.\n\n=== YOUR TURN ===\nReply with JSON.` }]
        });
        const raw = completion.choices[0].message.content;
        let action;
        try { action = JSON.parse(raw.match(/\{[\s\S]*\}/)[0]); }
        catch { action = { type: 'speak', text: '(unparseable stub)' }; }
        events.push({ actor: speaker, action, turn: t });
    }
    return events;
}

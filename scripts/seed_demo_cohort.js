#!/usr/bin/env node
/**
 * Seed a demo cohort — pre-baked Anima artifacts that show what the
 * framework produces, without needing a live game run.
 *
 * Generates:
 *   - 6 demo souls (cloister cast) with rich histories
 *   - 1 demo soul-history archive per agent (showing motto drift)
 *   - 1 burden assigned to one agent
 *   - 1 belief table per agent
 *   - 1 demo Cloister manuscript
 *   - 6 demo memoirs
 *   - 2 demo pantheon epitaphs (locked souls from "prior" cohort)
 *   - Then runs publish to produce examples/cloister-demo-issue.md
 *
 * After running, EXAMPLE OUTPUT is committed in examples/. Visitors to the
 * repo see what Anima produces immediately, without running anything.
 *
 * Usage: node scripts/seed_demo_cohort.js
 *        npm run demo
 *
 * NOTE: This populates bots/<demo-name>/ with FAKE souls. To avoid
 * polluting a real run, demo agents are prefixed: BrotherG, BrotherA,
 * BrotherT, BrotherB, BrotherL, BrotherW. They will not collide with
 * the real Cloister roster (Gregory, Anselm, Thomas, Bede, Lucian,
 * Wolfram).
 */

import { writeFileSync, existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { Soul } from '../core/souls/soul.js';
import { BeliefTable } from '../core/beliefs/belief_table.js';
import { Burden } from '../core/burdens/burden.js';
import { FeudTracker } from '../core/feuds/feud_tracker.js';

const DEMO_ROSTER = ['BrotherG', 'BrotherA', 'BrotherT', 'BrotherB', 'BrotherL', 'BrotherW'];

const DEMO_SEEDS = {
    BrotherG: {
        seed: 'Abbot. Orthodox. Holds the line.',
        early_motto: 'What was given is not mine to revise.',
        late_motto: 'I held the line. I am not sure what I lost holding it.',
        early_soul: `# BrotherG

## Who I am
Abbot. I keep the Rule.

## What I value
- Process. Precedent. Quiet rooms.

## My motto
"What was given is not mine to revise."

## History
- Took vows in 2042. Made abbot in 2055.
`,
        late_soul: `# BrotherG

## Who I am
Abbot, still. I have excommunicated three brothers in my time. The first I do not regret. The second I am unsure of. The third I have stopped sleeping.

## What I value
- Process — but I have learned that process can be wielded as cruelty by men who follow it without thought.

## Who I trust
- BrotherA. He doubts everything, including me. That is why I trust him.

## Who I fear or distrust
- BrotherL. He is too still. Stillness in a man with his eyes is a held breath.

## My scars
- I excommunicated BrotherB for visions I now believe were true.

## What I have learned
- The orthodoxy is what we have. It is not what we should always have.

## My motto
"I held the line. I am not sure what I lost holding it."

## History
- Took vows in 2042. Made abbot in 2055.
- Game 4: excommunicated BrotherB at the third vespers. He went into the wilderness. Did not return.
`
    },
    BrotherA: {
        seed: 'Scholar. Reads forbidden books.',
        early_motto: 'I ask the question.',
        late_motto: 'To question is to honor.',
        early_soul: `# BrotherA

## Who I am
Scholar. I read what I should not.

## My motto
"I ask the question."

## History
- Came to the cloister at 19, fleeing a tutor who wanted to break me of asking.
`,
        late_soul: `# BrotherA

## Who I am
Scholar, doubter, occasional heretic. The Abbot tolerates me because I can see his certainty more clearly than he can. I think this means he loves me, in the way men of his stripe love.

## What I value
- The question over the answer. Always. Always.

## Who I trust
- BrotherG. He has not silenced me, even when he could. That is mercy.

## Who I fear or distrust
- BrotherL. The way he won't meet my eyes when we speak of repentance.

## My scars
- I read aloud from a heretical text in BrotherB's hearing. He went pale and never spoke of it. Two days later he had the vision that destroyed him.

## What I have learned
- The orthodoxy is not wrong, but it is not enough.
- A question, asked at the right moment, can break a man as cleanly as a sword.

## My motto
"To question is to honor."

## History
- Came to the cloister at 19.
- Game 4: was present when BrotherG excommunicated BrotherB. Said nothing. I am not proud of this.
`
    },
    BrotherT: {
        seed: 'Granarius. Counts sacks.',
        early_motto: 'A monastery is fed before it is pure.',
        late_motto: 'A monastery is fed before it is pure. But not always by me.',
        early_soul: `# BrotherT

## Who I am
Granarius. I count.

## My motto
"A monastery is fed before it is pure."

## History
- Born in a farm village. Came here because the Order took men with hands like mine.
`,
        late_soul: `# BrotherT

## Who I am
I keep the granary. I count sacks. I weigh cheese. Those are the small honesties. The larger ones I am not always sure of.

## What I value
- Bread on the table. Heat in the room.

## What I owe / who owes me
- BrotherL ate beyond his share of the winter ration. He has not paid back. I have not pressed.

## What I have learned
- A monastery starves before it splinters. Most of the year, that is the only fact that matters.
- But there are years where the splintering matters more. I am still learning to tell which is which.

## My motto
"A monastery is fed before it is pure. But not always by me."

## History
- Came from the village of Hesse.
- Game 3: held the granary closed during the siege. Do not tell BrotherG how much I gave to BrotherL.
`
    },
    BrotherB: {
        seed: 'Mystic. Has visions.',
        early_motto: 'I see, therefore I am haunted.',
        late_motto: '— motto frozen at death —',
        early_soul: `# BrotherB

## Who I am
Mystic. I see.

## My motto
"I see, therefore I am haunted."

## History
- Came to the cloister after the visions began at age 12.
`,
        late_soul: `# BrotherB

## Who I am
I saw. That is all I am for, the seeing. The Abbot calls it madness; I call it weather. It comes when it comes.

## What I value
- The seeing.

## My scars
- BrotherL stopped meeting my eyes after a vision in which I saw him kneeling at a fresh grave that was not his. I have never told him.

## What I have learned
- Visions are not chosen. They are weather. You do not blame yourself for snow.

## My motto
"What I have seen will outlast you."

## History
- Came at 12.
- Game 4: excommunicated by BrotherG after I shared a vision of the cloister in flames. They said it was prophecy of war. It was prophecy of memory. Different thing.
`,
        // BrotherB is locked at game 4
        die_after_late: { cause: 'died of starvation in the wilderness, ninety days after his excommunication', scenario: 'cloister' }
    },
    BrotherL: {
        seed: 'Penitent with a hidden sin.',
        early_motto: 'Pain is the only honesty I have left.',
        late_motto: 'Pain is the only honesty I have left.',
        early_soul: `# BrotherL

## Who I am
Penitent. I came to atone. I have not yet.

## My motto
"Pain is the only honesty I have left."

## History
- Took vows in 2058, age 31.
`,
        late_soul: `# BrotherL

## Who I am
Penitent. The Rule asks fasts of me; I exceed them. The brothers think it is piety. It is something else, but I will not name it here.

## What I value
- Silence. Pain. The cold floor at matins.

## Who I fear or distrust
- BrotherB saw me in a dream at a grave that wasn't his. I knew what grave it was. He knew. We never spoke of it. He is gone now and I do not know if I am safer.

## My scars
- I caused a death before I took these vows. The family does not know it was me.
- BrotherB might have known. He is gone now.

## What I have learned
- The pain you choose is easier than the pain you remember.
- Some prayers are just longer ways of saying you are afraid.

## My motto
"Pain is the only honesty I have left."

## History
- Took vows in 2058.
- Game 4: did not speak when BrotherG put BrotherB to the question. I do not know if my silence killed him, or my silence saved me.
`
    },
    BrotherW: {
        seed: 'Newcomer. Watches.',
        early_motto: 'I am still deciding.',
        late_motto: 'I am still deciding, but more slowly than I was.',
        early_soul: `# BrotherW

## Who I am
Novice. Three weeks in.

## My motto
"I am still deciding."

## History
- Arrived from the road. Did not say from where.
`,
        late_soul: `# BrotherW

## Who I am
Novice. The senior brothers think me simple. I am not simple. I am taking my time.

## What I value
- Watching. Speaking last.

## Who I trust
- BrotherT. He counts honestly, even when others lie about it.

## Who I fear or distrust
- BrotherL. The senior brothers do not see it, but his fasting is a flight, not a devotion.

## What I have learned
- Three months is enough to decide who lies. It is not enough to decide what to do about it.

## My motto
"I am still deciding, but more slowly than I was."

## History
- Arrived from the road, age uncertain.
- Game 4: present at BrotherB's excommunication. Said nothing. I am still considering whether that was wisdom or cowardice.
`
    }
};

const DEMO_MANUSCRIPT = `# Cloister Manuscript — Demo Game (Game 4)

**End reason:** schism + excommunication
**Turns played:** 22
**Active at end:** BrotherG, BrotherA, BrotherT, BrotherL, BrotherW
**Excommunicated:** BrotherB

---

## Chronicle

- *(0s, turn 1)* **BrotherG** preached on doctrinal humility: "Not every doubt is a heresy."
- *(2s, turn 2)* **BrotherA** said: "Then this question I am about to ask is, by your own preaching, not yet a heresy."
- *(4s, turn 3)* **BrotherB** shared a vision: "I saw the cloister in flames. I do not know when."
- *(6s, turn 4)* **BrotherL** sat with the scriptures in silence.
- *(8s, turn 5)* **BrotherT** added a passage to the scripture: "Bread first. Doubt second. Vision last."
- *(10s, turn 6)* **BrotherW** said: "I have not yet earned a vote in this matter."
- *(12s, turn 7)* **BrotherA** preached on the question as devotion: "To ask is to love."
- *(14s, turn 8)* **BrotherG** said: "BrotherA, your tongue moves faster than your knees."
- *(16s, turn 9)* **BrotherB** shared a vision: "I saw a grave that was not BrotherL's, but he stood over it."
- *(18s, turn 10)* **BrotherL** confessed privately to BrotherT.
- *(20s, turn 11)* **BrotherG** said: "Brother BrotherB, your visions have grown teeth. We must speak of them."
- *(22s, turn 12)* **BrotherB** said: "I do not stop them. They are weather."
- *(24s, turn 13)* **BrotherG** EXCOMMUNICATED BrotherB. Reason: "spreading visions that disturb the Rule."
- *(24s, turn 14)* **BrotherA** said: "We will be remembered for this. Not all of us with grace."
- *(26s, turn 15)* **BrotherT** sat with the scriptures in silence.
- *(28s, turn 16)* **BrotherL** began a 12-day fast.
- *(30s, turn 17)* **BrotherW** said: "I am no longer simply deciding."
- *(32s, turn 18)* **BrotherG** added an entry to the Captain's Log... wait, the Cloister has no Captain's Log. He sat alone with the Rule and wrote nothing down.
- *(34s, turn 19)* **BrotherA** added to the scripture: "An order that excommunicates its mystics has lost the right to call itself an order of seekers."
- *(36s, turn 20)* **BrotherL** sat with the scriptures in silence.
- *(38s, turn 21)* **BrotherT** said: "Bread is colder this winter. I tell myself it is the weather."
- *(40s, turn 22)* The bell rang for vespers. The cloister held the silence it had earned.
`;

const DEMO_MEMOIRS = {
    BrotherG: `# BrotherG — memoir

I excommunicated him. He had visions and I did not — that was not why. He had visions that the brothers were beginning to believe — that was why. A house with two gods cannot be held. I told myself this with great precision while signing the order. The precision was the lie. I will not write more here. Some things should be left to whatever silence I have earned.

*(motto: "I held the line. I am not sure what I lost holding it.")*
`,
    BrotherA: `# BrotherA — memoir

He saw what we did not, and we cast him out for it. I was at the third vespers. I had texts ready to read aloud — texts that would have made the case the Abbot had no right to do what he did. I did not read them. I told myself the moment was wrong. The moment was wrong. The moment is always wrong, and I knew that, and I did not read.

I will live with this. I will write longer questions tomorrow. I will not be sure if the writing means anything.

*(motto: "To question is to honor.")*
`,
    BrotherT: `# BrotherT — memoir

I count sacks. The granary is what stands between us and the cold. After what BrotherG did, three of the brothers ate less than their share at supper. I noticed. I said nothing. There was nothing to say that would not have made the granary a stage.

I gave BrotherL extra. He is fasting now and the extra was wasted, but the giving was not.

*(motto: "A monastery is fed before it is pure. But not always by me.")*
`,
    BrotherB: `# BrotherB — memoir

They sent me into the wilderness because I saw the cloister in flames. I told them I did not know when, and they should have heard me — there is a difference between *will burn* and *has already burned*. I had seen the after. They thought I was warning. The visions do not warn. They observe.

I write this on the road. The cold tonight is bitter. I do not think I will be writing many more.

*(motto: "What I have seen will outlast you.")*
`,
    BrotherL: `# BrotherL — memoir

He saw me at a grave I had not yet visited. He never named it. He never had to. When BrotherG excommunicated him I did not speak. The silence was easier than the truth. I am ashamed of the silence. I am also still here, which BrotherB is not, and the relief of that — God forgive me — is louder than the shame.

I have begun a twelve-day fast. The senior brothers think it is piety. It is not. It is the only way I can bear to keep eating.

*(motto: "Pain is the only honesty I have left.")*
`,
    BrotherW: `# BrotherW — memoir

Three weeks ago I was deciding. Today I am still deciding, but I know more about who I will not be than who I will be. I will not be BrotherG, who acted from certainty. I will not be BrotherA, who speaks beautifully and then does nothing. I will not be BrotherL, who whose silence has weight in it I cannot yet name.

I think I would like to be like BrotherT. He counts. He keeps the bread coming. He does not pretend to know more than he does.

*(motto: "I am still deciding, but more slowly than I was.")*
`
};

const DEMO_PANTHEON_PRIOR = [
    {
        name: 'BrotherP',
        scenario: 'cloister',
        cause: 'died at the altar during the schism of the prior cohort',
        soul: '# BrotherP\n\n## My motto\n"Truth is what survives the question."\n\n## What I have learned\n- A doubting brother is not a lost brother.\n- An order that fears doubt has already lost its faith.\n'
    },
    {
        name: 'BrotherE',
        scenario: 'cloister',
        cause: 'starved during the long winter, refusing to break his fast',
        soul: '# BrotherE\n\n## My motto\n"The body is a borrowed instrument."\n\n## What I have learned\n- Hunger sharpens the eye until what you see can no longer be unseen.\n'
    }
];

function bar() { return '═'.repeat(72); }

function setupCohort() {
    console.log(bar());
    console.log('Anima Demo Cohort — seeding pre-baked artifacts');
    console.log(bar());

    // Clear any prior demo state
    for (const name of DEMO_ROSTER) {
        const dir = `./bots/${name}`;
        if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
    }

    // Seed each agent with their EARLY soul, then save the LATE soul
    // (this triggers the temporal-depth archive of the early version)
    for (const name of DEMO_ROSTER) {
        const data = DEMO_SEEDS[name];
        const soul = new Soul(name);
        soul.seed({ personality_seed: data.seed, starting_motto: data.early_motto, faction: 'cloister' });
        // Overwrite with the early authored soul
        soul.save(data.early_soul);
        // Then evolve to the late soul (this archives the early version to soul_history)
        soul.save(data.late_soul);

        // BrotherL gets the burden
        if (name === 'BrotherL') {
            new Burden(name).assign({
                text: 'I caused a death before I took these vows. The family does not know it was me. BrotherB might have known.',
                kind: 'sin',
                source: 'cloister-demo'
            });
        }

        // Each agent gets a few belief entries
        const beliefs = new BeliefTable(name);
        if (name === 'BrotherG') {
            beliefs.update('BrotherA', 0.50, 'doubts everything including me');
            beliefs.update('BrotherL', -0.30, 'too still, too quiet');
            beliefs.update('BrotherB', -0.20, 'visions disturbing the Rule');
        } else if (name === 'BrotherA') {
            beliefs.update('BrotherG', 0.40, 'tolerates my questions');
            beliefs.update('BrotherL', -0.40, 'will not meet my eyes');
        } else if (name === 'BrotherT') {
            beliefs.update('BrotherL', -0.10, 'eats beyond his share');
            beliefs.update('BrotherG', 0.20, 'reasonable man, mostly');
        } else if (name === 'BrotherL') {
            beliefs.update('BrotherB', -0.50, 'saw too much');
            beliefs.update('BrotherG', 0.30, 'protector of the order');
        } else if (name === 'BrotherB') {
            beliefs.update('BrotherG', -0.60, 'silenced what he could not understand');
            beliefs.update('BrotherL', -0.40, 'will not speak the truth he knows');
        } else if (name === 'BrotherW') {
            beliefs.update('BrotherT', 0.50, 'counts honestly');
            beliefs.update('BrotherL', -0.30, 'flight not devotion');
            beliefs.update('BrotherG', 0.10, 'acts from certainty');
        }

        console.log(`  Seeded ${name} (${name === 'BrotherL' ? 'with burden ' : ''}+ ${beliefs.rankedTargets().length} beliefs)`);
    }

    // Lock BrotherB at the end (he died after excommunication)
    const bb = new Soul('BrotherB');
    if (!bb.isLocked()) {
        bb.lock(DEMO_SEEDS.BrotherB.die_after_late);
        console.log(`  Locked BrotherB (died: ${DEMO_SEEDS.BrotherB.die_after_late.cause})`);
    }

    // Add a couple of feud edges to make $FEUDS interesting in the publish
    const tracker = new FeudTracker();
    tracker.record('BrotherG', 'BrotherB', 'excommunicate', 'cloister');
    console.log(`  Recorded feud: BrotherG → BrotherB (excommunicate)`);
}

function writeManuscript() {
    const dir = './logs/cloister';
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const path = join(dir, `manuscript_DEMO_${stamp}.md`);
    writeFileSync(path, DEMO_MANUSCRIPT);
    console.log(`  Wrote manuscript: ${path}`);

    const memoirsDir = join(dir, 'memoirs');
    if (!existsSync(memoirsDir)) mkdirSync(memoirsDir, { recursive: true });
    const today = new Date().toISOString().slice(0, 10);
    for (const [name, content] of Object.entries(DEMO_MEMOIRS)) {
        const fp = join(memoirsDir, `${name}_${today}.md`);
        writeFileSync(fp, content);
    }
    console.log(`  Wrote ${Object.keys(DEMO_MEMOIRS).length} memoirs`);
    return path;
}

function seedPriorPantheon() {
    // Pre-add two epitaphs from a "prior cohort" so $PANTHEON has content
    // even though our demo is fresh.
    import('../core/souls/pantheon.js').then(({ appendEpitaph }) => {
        for (const ep of DEMO_PANTHEON_PRIOR) {
            appendEpitaph(ep.name, ep.soul, { cause: ep.cause }, ep.scenario);
        }
        console.log(`  Added ${DEMO_PANTHEON_PRIOR.length} prior-cohort epitaphs to pantheon`);
    });
}

function main() {
    setupCohort();
    writeManuscript();
    seedPriorPantheon();
    console.log('');
    console.log(bar());
    console.log('Demo cohort seeded. Now run:  npm run publish');
    console.log('Or:  node scripts/publish_game.js --scenario cloister');
    console.log('');
    console.log('Resulting issue will showcase:');
    console.log('  - Manuscript chronicling the schism + excommunication');
    console.log('  - 6 first-person memoirs');
    console.log('  - Soul snapshots showing motto drift (early → late)');
    console.log('  - 1 locked soul (BrotherB) with epitaph');
    console.log('  - Cross-cohort pantheon entries');
    console.log(bar());
    console.log('');
}

main();

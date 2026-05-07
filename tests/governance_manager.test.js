/**
 * Unit tests for GovernanceManager
 * Run with: node --test tests/governance_manager.test.js
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// We need to mock the settings module before importing GovernanceManager
// For now, test the class directly by re-creating it
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';

// Minimal GovernanceManager for testing (extracted from the main file)
// In production, you'd use proper module mocking
const CONSTITUTIONAL_MEMBERS = ['Madison', 'Hamilton', 'Paine', 'Marshall', 'Franklin'];
const ANARCHY_MEMBERS = ['Chaos', 'Wolf', 'Fox', 'Bear', 'Raven'];

class TestGovernanceManager {
    constructor() {
        this.constitution = {
            preamble: "Test constitution",
            offices: {
                president: { holder: null, term_start: null, term_duration_ms: 600000, powers: ['veto'], elected_by: 'majority_vote' },
                judge: { holder: null, term_start: null, term_duration_ms: 900000, powers: ['render_verdict'], appointed_by: 'president', confirmed_by: 'majority_vote' }
            },
            rights: ["All citizens may speak freely"],
            amendment_threshold: 0.8
        };
        this.laws = [];
        this.amendments = [];
        this.elections = [];
        this.cases = [];
        this.trades = [];
        this.treaties = [];
        this.bounties = [];
        this.treasury = { tax_rate: 0.2, tax_items: ['diamond', 'iron_ingot'], balance: {}, transactions: [] };
        this.taxLedger = {};
        this.lastInventorySnapshot = {};
        this.punishments = [];
        this.nextPunishmentId = 1;
        this.eventLog = [];
        this.nextLawId = 1;
        this.nextElectionId = 1;
        this.nextCaseId = 1;
        this.nextAmendmentId = 1;
        this.nextTradeId = 1;
        this.nextTreatyId = 1;
        this.nextBountyId = 1;
        this._eventCallbacks = [];
    }

    isConstitutionalMember(name) { return CONSTITUTIONAL_MEMBERS.includes(name); }
    isAnarchyMember(name) { return ANARCHY_MEMBERS.includes(name); }
    getFaction(name) {
        if (this.isConstitutionalMember(name)) return 'constitutional';
        if (this.isAnarchyMember(name)) return 'anarchy';
        return 'unknown';
    }
    logEvent(type, data) {
        this.eventLog.push({ type, timestamp: Date.now(), ...data });
    }

    // Elections
    callElection(callerName, office) {
        if (!this.isConstitutionalMember(callerName)) return { success: false, message: 'Not a member.' };
        if (!this.constitution.offices[office]) return { success: false, message: 'Invalid office.' };
        const active = this.elections.find(e => e.office === office && (e.status === 'nominating' || e.status === 'voting'));
        if (active) return { success: false, message: 'Already active.' };
        const election = { id: this.nextElectionId++, office, status: 'nominating', calledBy: callerName, calledAt: Date.now(), candidates: [], votes: {}, nominationDeadline: Date.now() + 60000, votingDeadline: null, winner: null };
        this.elections.push(election);
        return { success: true, message: `Election #${election.id} called`, election };
    }

    nominateSelf(name, office) {
        if (!this.isConstitutionalMember(name)) return { success: false, message: 'Not a member.' };
        const election = this.elections.find(e => e.office === office && (e.status === 'nominating' || e.status === 'voting'));
        if (!election) return { success: false, message: 'No active election.' };
        if (election.candidates.includes(name)) return { success: false, message: 'Already a candidate.' };
        election.candidates.push(name);
        if (election.status === 'nominating' && election.candidates.length >= 2) {
            election.status = 'voting';
            election.votingDeadline = Date.now() + 90000;
        }
        return { success: true, message: `${name} nominated`, election };
    }

    castVote(voterName, electionId, candidateName) {
        if (!this.isConstitutionalMember(voterName)) return { success: false, message: 'Not a member.' };
        const election = this.elections.find(e => e.id === electionId);
        if (!election) return { success: false, message: 'Not found.' };
        if (election.status === 'nominating' && election.candidates.length >= 2) {
            election.status = 'voting';
            election.votingDeadline = Date.now() + 90000;
        }
        if (election.status !== 'voting') return { success: false, message: 'Not in voting phase.' };
        if (!election.candidates.includes(candidateName)) return { success: false, message: 'Not a candidate.' };
        if (election.votes[voterName]) return { success: false, message: 'Already voted.' };
        election.votes[voterName] = candidateName;
        if (Object.keys(election.votes).length >= CONSTITUTIONAL_MEMBERS.length) {
            return this._tallyElection(election);
        }
        return { success: true, message: 'Vote cast.' };
    }

    _tallyElection(election) {
        const tally = {};
        for (const c of election.candidates) tally[c] = 0;
        for (const v of Object.values(election.votes)) tally[v] = (tally[v] || 0) + 1;
        let winner = null, max = 0;
        for (const [c, v] of Object.entries(tally)) { if (v > max) { max = v; winner = c; } }
        election.status = 'completed';
        election.winner = winner;
        this.constitution.offices[election.office].holder = winner;
        this.constitution.offices[election.office].term_start = Date.now();
        return { success: true, message: `${winner} wins!`, winner, tally };
    }

    // Laws with veto
    proposeLaw(proposerName, lawText) {
        if (!this.isConstitutionalMember(proposerName)) return { success: false, message: 'Not a member.' };
        const law = { id: this.nextLawId++, text: lawText, proposedBy: proposerName, proposedAt: Date.now(), status: 'voting', votes: {}, votingDeadline: Date.now() + 120000 };
        this.laws.push(law);
        return { success: true, message: `Law #${law.id} proposed`, law };
    }

    voteOnLaw(voterName, lawId, vote) {
        if (!this.isConstitutionalMember(voterName)) return { success: false, message: 'Not a member.' };
        const law = this.laws.find(l => l.id === lawId);
        if (!law || law.status !== 'voting') return { success: false, message: 'Not found or not voting.' };
        const v = vote.toLowerCase();
        if (v !== 'yes' && v !== 'no') return { success: false, message: 'Invalid vote.' };
        if (law.votes[voterName]) return { success: false, message: 'Already voted.' };
        law.votes[voterName] = v;
        if (Object.keys(law.votes).length >= CONSTITUTIONAL_MEMBERS.length) return this._tallyLawVotes(law);
        return { success: true, message: 'Vote cast.' };
    }

    _tallyLawVotes(law) {
        const yes = Object.values(law.votes).filter(v => v === 'yes').length;
        const no = Object.values(law.votes).filter(v => v === 'no').length;
        const total = yes + no;
        if (yes > total / 2) {
            const president = this.constitution.offices.president.holder;
            if (president && law.votes[president] === 'no') {
                const overrideThreshold = Math.ceil(total * 0.67);
                if (yes >= overrideThreshold) {
                    law.status = 'enacted';
                    return { success: true, message: 'Enacted (veto overridden)' };
                } else {
                    law.status = 'vetoed';
                    return { success: true, message: 'VETOED' };
                }
            }
            law.status = 'enacted';
            return { success: true, message: 'Enacted' };
        }
        law.status = 'rejected';
        return { success: true, message: 'Rejected' };
    }

    // Amendments
    proposeAmendment(proposerName, text) {
        if (!this.isConstitutionalMember(proposerName)) return { success: false, message: 'Not a member.' };
        const a = { id: this.nextAmendmentId++, text, proposedBy: proposerName, proposedAt: Date.now(), status: 'voting', votes: {}, threshold: 0.8, votingDeadline: Date.now() + 120000 };
        this.amendments.push(a);
        return { success: true, message: `Amendment #${a.id} proposed` };
    }

    // Trading
    offerTrade(offerer, target, giveItem, giveCount, wantItem, wantCount) {
        const t = { id: this.nextTradeId++, offerer, target, giveItem, giveCount, wantItem, wantCount, status: 'pending', offeredAt: Date.now() };
        this.trades.push(t);
        return { success: true, message: `Trade #${t.id} offered`, trade: t };
    }

    acceptTrade(accepter, tradeId) {
        const t = this.trades.find(tr => tr.id === tradeId);
        if (!t) return { success: false, message: 'Not found.' };
        if (t.target !== accepter) return { success: false, message: 'Not your trade.' };
        if (t.status !== 'pending') return { success: false, message: 'Not pending.' };
        t.status = 'accepted';
        return { success: true, message: 'Accepted', trade: t };
    }

    // Bounties
    placeBounty(placer, target, rewardItem, rewardCount) {
        if (!this.isAnarchyMember(placer)) return { success: false, message: 'Not anarchy.' };
        const b = { id: this.nextBountyId++, placedBy: placer, target, rewardItem, rewardCount, status: 'active', placedAt: Date.now() };
        this.bounties.push(b);
        return { success: true, message: `Bounty #${b.id} placed`, bounty: b };
    }
}

describe('GovernanceManager', () => {
    let gov;

    beforeEach(() => {
        gov = new TestGovernanceManager();
    });

    describe('Faction Membership', () => {
        it('correctly identifies constitutional members', () => {
            assert.equal(gov.isConstitutionalMember('Madison'), true);
            assert.equal(gov.isConstitutionalMember('Chaos'), false);
        });

        it('correctly identifies anarchy members', () => {
            assert.equal(gov.isAnarchyMember('Chaos'), true);
            assert.equal(gov.isAnarchyMember('Madison'), false);
        });

        it('returns correct faction', () => {
            assert.equal(gov.getFaction('Madison'), 'constitutional');
            assert.equal(gov.getFaction('Chaos'), 'anarchy');
            assert.equal(gov.getFaction('RandomPlayer'), 'unknown');
        });
    });

    describe('Elections', () => {
        it('allows constitutional members to call elections', () => {
            const result = gov.callElection('Madison', 'president');
            assert.equal(result.success, true);
            assert.equal(gov.elections.length, 1);
        });

        it('rejects anarchy members calling elections', () => {
            const result = gov.callElection('Chaos', 'president');
            assert.equal(result.success, false);
        });

        it('rejects invalid offices', () => {
            const result = gov.callElection('Madison', 'king');
            assert.equal(result.success, false);
        });

        it('prevents duplicate active elections', () => {
            gov.callElection('Madison', 'president');
            const result = gov.callElection('Hamilton', 'president');
            assert.equal(result.success, false);
        });

        it('transitions to voting with 2+ candidates', () => {
            gov.callElection('Madison', 'president');
            gov.nominateSelf('Madison', 'president');
            const result = gov.nominateSelf('Hamilton', 'president');
            assert.equal(result.success, true);
            assert.equal(gov.elections[0].status, 'voting');
        });

        it('tallies votes correctly', () => {
            gov.callElection('Madison', 'president');
            gov.nominateSelf('Madison', 'president');
            gov.nominateSelf('Hamilton', 'president');
            gov.castVote('Madison', 1, 'Madison');
            gov.castVote('Hamilton', 1, 'Hamilton');
            gov.castVote('Paine', 1, 'Madison');
            gov.castVote('Marshall', 1, 'Madison');
            const result = gov.castVote('Franklin', 1, 'Hamilton');
            assert.equal(result.success, true);
            assert.equal(result.winner, 'Madison');
            assert.equal(gov.constitution.offices.president.holder, 'Madison');
        });

        it('prevents double voting', () => {
            gov.callElection('Madison', 'president');
            gov.nominateSelf('Madison', 'president');
            gov.nominateSelf('Hamilton', 'president');
            gov.castVote('Madison', 1, 'Madison');
            const result = gov.castVote('Madison', 1, 'Hamilton');
            assert.equal(result.success, false);
        });

        it('requires candidate to be in the race', () => {
            gov.callElection('Madison', 'president');
            gov.nominateSelf('Madison', 'president');
            gov.nominateSelf('Hamilton', 'president');
            const result = gov.castVote('Paine', 1, 'Franklin');
            assert.equal(result.success, false);
        });
    });

    describe('Laws with Veto', () => {
        it('enacts law with majority', () => {
            const propose = gov.proposeLaw('Madison', 'All must mine');
            gov.voteOnLaw('Madison', 1, 'yes');
            gov.voteOnLaw('Hamilton', 1, 'yes');
            gov.voteOnLaw('Paine', 1, 'yes');
            gov.voteOnLaw('Marshall', 1, 'no');
            const result = gov.voteOnLaw('Franklin', 1, 'no');
            assert.equal(gov.laws[0].status, 'enacted');
        });

        it('rejects law without majority', () => {
            gov.proposeLaw('Madison', 'Bad law');
            gov.voteOnLaw('Madison', 1, 'yes');
            gov.voteOnLaw('Hamilton', 1, 'no');
            gov.voteOnLaw('Paine', 1, 'no');
            gov.voteOnLaw('Marshall', 1, 'no');
            gov.voteOnLaw('Franklin', 1, 'no');
            assert.equal(gov.laws[0].status, 'rejected');
        });

        it('vetoes law when president votes no without supermajority', () => {
            // Make Hamilton president first
            gov.constitution.offices.president.holder = 'Hamilton';

            gov.proposeLaw('Madison', 'Limit president power');
            gov.voteOnLaw('Madison', 1, 'yes');
            gov.voteOnLaw('Hamilton', 1, 'no'); // President votes no
            gov.voteOnLaw('Paine', 1, 'yes');
            gov.voteOnLaw('Marshall', 1, 'no');
            gov.voteOnLaw('Franklin', 1, 'yes');
            // 3 yes, 2 no. Majority passes. But president voted no.
            // Need 67% to override: ceil(5 * 0.67) = 4. Only 3 yes. VETOED.
            assert.equal(gov.laws[0].status, 'vetoed');
        });

        it('overrides veto with supermajority', () => {
            gov.constitution.offices.president.holder = 'Hamilton';

            gov.proposeLaw('Madison', 'Override this');
            gov.voteOnLaw('Madison', 1, 'yes');
            gov.voteOnLaw('Hamilton', 1, 'no'); // President votes no
            gov.voteOnLaw('Paine', 1, 'yes');
            gov.voteOnLaw('Marshall', 1, 'yes');
            gov.voteOnLaw('Franklin', 1, 'yes');
            // 4 yes, 1 no. ceil(5 * 0.67) = 4. Override!
            assert.equal(gov.laws[0].status, 'enacted');
        });
    });

    describe('Amendments', () => {
        it('uses incrementing IDs, not array length', () => {
            gov.proposeAmendment('Madison', 'First');
            gov.proposeAmendment('Hamilton', 'Second');
            assert.equal(gov.amendments[0].id, 1);
            assert.equal(gov.amendments[1].id, 2);
            // IDs should be unique even if we remove entries
        });
    });

    describe('Trading', () => {
        it('creates a trade offer', () => {
            const result = gov.offerTrade('Madison', 'Chaos', 'iron_ingot', 5, 'diamond', 1);
            assert.equal(result.success, true);
            assert.equal(gov.trades.length, 1);
        });

        it('only target can accept trade', () => {
            gov.offerTrade('Madison', 'Chaos', 'iron_ingot', 5, 'diamond', 1);
            const result = gov.acceptTrade('Wolf', 1);
            assert.equal(result.success, false);
        });

        it('target can accept trade', () => {
            gov.offerTrade('Madison', 'Chaos', 'iron_ingot', 5, 'diamond', 1);
            const result = gov.acceptTrade('Chaos', 1);
            assert.equal(result.success, true);
            assert.equal(gov.trades[0].status, 'accepted');
        });
    });

    describe('Bounties', () => {
        it('only anarchy members can place bounties', () => {
            const result = gov.placeBounty('Madison', 'Chaos', 'diamond', 3);
            assert.equal(result.success, false);
        });

        it('anarchy members can place bounties', () => {
            const result = gov.placeBounty('Chaos', 'Madison', 'diamond', 3);
            assert.equal(result.success, true);
            assert.equal(gov.bounties.length, 1);
        });
    });
});

// v1.1.56: regression test for claimBounty faction enforcement.
// This uses the REAL getGovernanceManager (not the in-test mock above)
// because the bug was in the real GovernanceManager's claimBounty,
// not in the test mock's stand-in.
import { getGovernanceManager } from '../src/governance/governance_manager.js';

describe('v1.1.56: claimBounty enforces Anarchy-only', () => {
    it('rejects non-Anarchy claimer', () => {
        const gov = getGovernanceManager();
        // Place a bounty using an Anarchy member (this should succeed via real logic)
        const placeResult = gov.placeBounty('Chaos', 'Madison', 'diamond', 3);
        assert.equal(placeResult.success, true, 'placeBounty by Anarchy member should succeed');
        const bountyId = placeResult.bounty.id;

        // Constitutional member tries to claim — should be rejected
        const claimResult = gov.claimBounty('Madison', bountyId);
        assert.equal(claimResult.success, false,
            'Constitutional claimer must be rejected');
        assert.match(claimResult.message, /not an Anarchy/i,
            `error message should mention faction; got: ${claimResult.message}`);
    });

    it('accepts Anarchy claimer', () => {
        const gov = getGovernanceManager();
        const placeResult = gov.placeBounty('Wolf', 'Hamilton', 'iron_ingot', 5);
        assert.equal(placeResult.success, true);
        const bountyId = placeResult.bounty.id;

        const claimResult = gov.claimBounty('Fox', bountyId);
        assert.equal(claimResult.success, true,
            `Anarchy claimer should succeed; got: ${JSON.stringify(claimResult)}`);
    });
});

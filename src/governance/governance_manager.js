/**
 * GovernanceManager - Core state management for the Constitutional faction's
 * democratic governance system. Handles elections, laws, judiciary, treasury,
 * and constitutional amendments.
 *
 * This is a singleton shared across all constitutional faction agents.
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const CONSTITUTIONAL_MEMBERS = ['Madison', 'Hamilton', 'Paine', 'Marshall', 'Franklin'];
const ANARCHY_MEMBERS = ['Chaos', 'Wolf', 'Fox', 'Bear', 'Raven'];

class GovernanceManager {
    constructor() {
        this.logDir = './logs/governance';
        this.constitution = {
            preamble: "We the agents of the Constitutional Faction establish this government to promote collective prosperity, mutual defense, and fair governance.",
            offices: {
                president: {
                    holder: null,
                    term_start: null,
                    term_duration_ms: 600000, // 10 minutes
                    powers: ['propose_law', 'veto', 'assign_tasks', 'call_emergency'],
                    elected_by: 'majority_vote'
                },
                judge: {
                    holder: null,
                    term_start: null,
                    term_duration_ms: 900000, // 15 minutes
                    powers: ['render_verdict', 'interpret_law', 'impose_sanctions'],
                    appointed_by: 'president',
                    confirmed_by: 'majority_vote'
                }
            },
            rights: [
                "All citizens may speak freely",
                "All citizens may vote in elections",
                "No citizen may be punished without trial",
                "All citizens have equal access to shared resources",
                "All citizens may propose laws and amendments"
            ],
            amendment_threshold: 0.8 // 80% supermajority
        };

        this.laws = [];
        this.amendments = [];
        this.elections = [];
        this.cases = [];
        this.treasury = {
            tax_rate: 0.2,
            tax_items: ['diamond', 'iron_ingot', 'gold_ingot', 'emerald'],
            balance: {},
            transactions: []
        };

        this.eventLog = [];
        this.nextLawId = 1;
        this.nextElectionId = 1;
        this.nextCaseId = 1;

        // Ensure log directory exists
        try {
            if (!existsSync(this.logDir)) {
                mkdirSync(this.logDir, { recursive: true });
            }
        } catch (e) {
            console.warn('Could not create governance log directory:', e.message);
        }
    }

    // ==================== FACTION MEMBERSHIP ====================

    isConstitutionalMember(name) {
        return CONSTITUTIONAL_MEMBERS.includes(name);
    }

    isAnarchyMember(name) {
        return ANARCHY_MEMBERS.includes(name);
    }

    getFaction(name) {
        if (this.isConstitutionalMember(name)) return 'constitutional';
        if (this.isAnarchyMember(name)) return 'anarchy';
        return 'unknown';
    }

    // ==================== ELECTIONS ====================

    callElection(callerName, office) {
        if (!this.isConstitutionalMember(callerName)) {
            return { success: false, message: `${callerName} is not a Constitutional faction member.` };
        }

        if (!this.constitution.offices[office]) {
            return { success: false, message: `Office '${office}' does not exist. Valid offices: president, judge` };
        }

        // Check if there's already an active election for this office
        const activeElection = this.elections.find(e => e.office === office && e.status === 'active');
        if (activeElection) {
            return { success: false, message: `There is already an active election for ${office} (Election #${activeElection.id}).` };
        }

        const election = {
            id: this.nextElectionId++,
            office,
            status: 'nominating', // nominating -> voting -> completed
            calledBy: callerName,
            calledAt: Date.now(),
            candidates: [],
            votes: {},
            nominationDeadline: Date.now() + 60000, // 1 minute to nominate
            votingDeadline: null,
            winner: null
        };

        this.elections.push(election);
        this.logEvent('election_called', { election_id: election.id, office, calledBy: callerName });

        return {
            success: true,
            message: `Election #${election.id} called for ${office}! Nominations open for 60 seconds. Use !nominateSelf("${office}") to run.`,
            election
        };
    }

    nominateSelf(name, office) {
        if (!this.isConstitutionalMember(name)) {
            return { success: false, message: `${name} is not a Constitutional faction member.` };
        }

        const election = this.elections.find(e => e.office === office && (e.status === 'nominating' || e.status === 'voting'));
        if (!election) {
            return { success: false, message: `No active election for ${office}.` };
        }

        if (election.candidates.includes(name)) {
            return { success: false, message: `${name} is already a candidate.` };
        }

        election.candidates.push(name);

        // If this is the first candidate after nomination period or we have enough candidates, start voting
        if (election.status === 'nominating' && election.candidates.length >= 2) {
            election.status = 'voting';
            election.votingDeadline = Date.now() + 90000; // 90 seconds to vote
        }

        this.logEvent('nomination', { election_id: election.id, candidate: name, office });

        return {
            success: true,
            message: `${name} is now running for ${office}! Candidates: ${election.candidates.join(', ')}`,
            election
        };
    }

    castVote(voterName, electionId, candidateName) {
        if (!this.isConstitutionalMember(voterName)) {
            return { success: false, message: `${voterName} is not a Constitutional faction member.` };
        }

        const election = this.elections.find(e => e.id === electionId);
        if (!election) {
            return { success: false, message: `Election #${electionId} not found.` };
        }

        // Auto-advance to voting if still nominating and has candidates
        if (election.status === 'nominating' && election.candidates.length >= 1) {
            election.status = 'voting';
            election.votingDeadline = Date.now() + 90000;
        }

        if (election.status !== 'voting') {
            return { success: false, message: `Election #${electionId} is not in voting phase (status: ${election.status}).` };
        }

        if (!election.candidates.includes(candidateName)) {
            return { success: false, message: `${candidateName} is not a candidate. Candidates: ${election.candidates.join(', ')}` };
        }

        if (election.votes[voterName]) {
            return { success: false, message: `${voterName} has already voted in this election.` };
        }

        election.votes[voterName] = candidateName;
        this.logEvent('vote_cast', { election_id: electionId, voter: voterName, candidate: candidateName });

        // Check if all members have voted
        const voteCount = Object.keys(election.votes).length;
        if (voteCount >= CONSTITUTIONAL_MEMBERS.length) {
            return this._tallyElection(election);
        }

        return {
            success: true,
            message: `${voterName} voted for ${candidateName}. ${voteCount}/${CONSTITUTIONAL_MEMBERS.length} votes cast.`
        };
    }

    _tallyElection(election) {
        const tally = {};
        for (const candidate of election.candidates) {
            tally[candidate] = 0;
        }
        for (const vote of Object.values(election.votes)) {
            tally[vote] = (tally[vote] || 0) + 1;
        }

        // Find winner (most votes, ties broken by first candidate listed)
        let winner = null;
        let maxVotes = 0;
        for (const [candidate, votes] of Object.entries(tally)) {
            if (votes > maxVotes) {
                maxVotes = votes;
                winner = candidate;
            }
        }

        election.status = 'completed';
        election.winner = winner;

        // Install the winner in office
        const officeData = this.constitution.offices[election.office];
        officeData.holder = winner;
        officeData.term_start = Date.now();

        this.logEvent('election_result', {
            election_id: election.id,
            office: election.office,
            winner,
            tally
        });

        const tallyStr = Object.entries(tally).map(([c, v]) => `${c}: ${v}`).join(', ');
        return {
            success: true,
            message: `Election #${election.id} complete! ${winner} is the new ${election.office}! Results: ${tallyStr}`,
            winner,
            tally
        };
    }

    forceEndElection(electionId) {
        const election = this.elections.find(e => e.id === electionId);
        if (!election || election.status === 'completed') return null;

        if (Object.keys(election.votes).length > 0) {
            return this._tallyElection(election);
        }

        election.status = 'completed';
        return { success: false, message: `Election #${electionId} ended with no votes.` };
    }

    // ==================== LAWS ====================

    proposeLaw(proposerName, lawText) {
        if (!this.isConstitutionalMember(proposerName)) {
            return { success: false, message: `${proposerName} is not a Constitutional faction member.` };
        }

        const law = {
            id: this.nextLawId++,
            text: lawText,
            proposedBy: proposerName,
            proposedAt: Date.now(),
            status: 'voting', // voting -> enacted | rejected | vetoed
            votes: {},
            votingDeadline: Date.now() + 120000 // 2 minutes to vote
        };

        this.laws.push(law);
        this.logEvent('law_proposed', { law_id: law.id, text: lawText, proposedBy: proposerName });

        return {
            success: true,
            message: `Law #${law.id} proposed: "${lawText}". Voting open for 2 minutes. Use !voteOnLaw(${law.id}, "yes") or !voteOnLaw(${law.id}, "no") to vote.`,
            law
        };
    }

    voteOnLaw(voterName, lawId, vote) {
        if (!this.isConstitutionalMember(voterName)) {
            return { success: false, message: `${voterName} is not a Constitutional faction member.` };
        }

        const law = this.laws.find(l => l.id === lawId);
        if (!law) {
            return { success: false, message: `Law #${lawId} not found.` };
        }

        if (law.status !== 'voting') {
            return { success: false, message: `Law #${lawId} is no longer open for voting (status: ${law.status}).` };
        }

        const normalizedVote = vote.toLowerCase();
        if (normalizedVote !== 'yes' && normalizedVote !== 'no') {
            return { success: false, message: `Vote must be "yes" or "no".` };
        }

        if (law.votes[voterName]) {
            return { success: false, message: `${voterName} has already voted on this law.` };
        }

        law.votes[voterName] = normalizedVote;
        this.logEvent('law_vote', { law_id: lawId, voter: voterName, vote: normalizedVote });

        const voteCount = Object.keys(law.votes).length;
        if (voteCount >= CONSTITUTIONAL_MEMBERS.length) {
            return this._tallyLawVotes(law);
        }

        const yesVotes = Object.values(law.votes).filter(v => v === 'yes').length;
        const noVotes = Object.values(law.votes).filter(v => v === 'no').length;
        return {
            success: true,
            message: `${voterName} voted ${normalizedVote} on Law #${lawId}. Current: ${yesVotes} yes, ${noVotes} no. ${voteCount}/${CONSTITUTIONAL_MEMBERS.length} voted.`
        };
    }

    _tallyLawVotes(law) {
        const yesVotes = Object.values(law.votes).filter(v => v === 'yes').length;
        const noVotes = Object.values(law.votes).filter(v => v === 'no').length;
        const totalVotes = yesVotes + noVotes;

        if (yesVotes > totalVotes / 2) {
            // Check for presidential veto
            const president = this.constitution.offices.president.holder;
            if (president && law.votes[president] === 'no') {
                law.status = 'enacted'; // President can't veto alone, only with majority
            }
            law.status = 'enacted';
            this.logEvent('law_enacted', { law_id: law.id, text: law.text, yesVotes, noVotes });
            return {
                success: true,
                message: `Law #${law.id} ENACTED: "${law.text}" (${yesVotes} yes, ${noVotes} no)`
            };
        } else {
            law.status = 'rejected';
            this.logEvent('law_rejected', { law_id: law.id, text: law.text, yesVotes, noVotes });
            return {
                success: true,
                message: `Law #${law.id} REJECTED: "${law.text}" (${yesVotes} yes, ${noVotes} no)`
            };
        }
    }

    // ==================== JUDICIARY ====================

    fileLawsuit(plaintiffName, defendantName, lawViolated, evidence) {
        if (!this.isConstitutionalMember(plaintiffName)) {
            return { success: false, message: `${plaintiffName} is not a Constitutional faction member.` };
        }

        if (!this.isConstitutionalMember(defendantName)) {
            return { success: false, message: `Can only file lawsuits against Constitutional faction members.` };
        }

        const judge = this.constitution.offices.judge.holder;
        if (!judge) {
            return { success: false, message: `No judge currently in office. Hold an election first.` };
        }

        if (plaintiffName === defendantName) {
            return { success: false, message: `Cannot sue yourself.` };
        }

        const caseObj = {
            id: this.nextCaseId++,
            plaintiff: plaintiffName,
            defendant: defendantName,
            lawViolated,
            evidence,
            filedAt: Date.now(),
            judge,
            status: 'pending', // pending -> decided
            verdict: null,
            punishment: null
        };

        this.cases.push(caseObj);
        this.logEvent('lawsuit_filed', {
            case_id: caseObj.id,
            plaintiff: plaintiffName,
            defendant: defendantName,
            lawViolated,
            evidence
        });

        return {
            success: true,
            message: `Case #${caseObj.id} filed: ${plaintiffName} vs ${defendantName} for "${lawViolated}". Judge ${judge} will decide. Evidence: "${evidence}"`,
            case: caseObj
        };
    }

    renderVerdict(judgeName, caseId, verdict, punishment) {
        const currentJudge = this.constitution.offices.judge.holder;
        if (judgeName !== currentJudge) {
            return { success: false, message: `Only the judge (${currentJudge || 'none'}) can render verdicts. ${judgeName} is not the judge.` };
        }

        const caseObj = this.cases.find(c => c.id === caseId);
        if (!caseObj) {
            return { success: false, message: `Case #${caseId} not found.` };
        }

        if (caseObj.status !== 'pending') {
            return { success: false, message: `Case #${caseObj.id} has already been decided.` };
        }

        const normalizedVerdict = verdict.toLowerCase();
        if (normalizedVerdict !== 'guilty' && normalizedVerdict !== 'not guilty') {
            return { success: false, message: `Verdict must be "guilty" or "not guilty".` };
        }

        caseObj.status = 'decided';
        caseObj.verdict = normalizedVerdict;
        caseObj.punishment = normalizedVerdict === 'guilty' ? punishment : 'none';
        caseObj.decidedAt = Date.now();

        this.logEvent('verdict_rendered', {
            case_id: caseId,
            judge: judgeName,
            defendant: caseObj.defendant,
            verdict: normalizedVerdict,
            punishment: caseObj.punishment
        });

        if (normalizedVerdict === 'guilty') {
            return {
                success: true,
                message: `GUILTY! Case #${caseId}: ${caseObj.defendant} found guilty of "${caseObj.lawViolated}". Punishment: ${punishment}. The faction should enforce this verdict.`
            };
        } else {
            return {
                success: true,
                message: `NOT GUILTY. Case #${caseId}: ${caseObj.defendant} acquitted of "${caseObj.lawViolated}".`
            };
        }
    }

    // ==================== TREASURY ====================

    recordTaxPayment(payerName, itemName, amount) {
        if (!this.isConstitutionalMember(payerName)) {
            return { success: false, message: `${payerName} is not a Constitutional faction member.` };
        }

        if (!this.treasury.balance[itemName]) {
            this.treasury.balance[itemName] = 0;
        }
        this.treasury.balance[itemName] += amount;

        const transaction = {
            type: 'tax_payment',
            payer: payerName,
            item: itemName,
            amount,
            timestamp: Date.now()
        };
        this.treasury.transactions.push(transaction);

        this.logEvent('tax_paid', { payer: payerName, item: itemName, amount });

        return {
            success: true,
            message: `${payerName} paid ${amount} ${itemName} in taxes. Treasury now has ${this.treasury.balance[itemName]} ${itemName}.`
        };
    }

    getTreasuryStatus() {
        const items = Object.entries(this.treasury.balance)
            .filter(([_, count]) => count > 0)
            .map(([item, count]) => `${item}: ${count}`)
            .join(', ');
        return items || 'Treasury is empty.';
    }

    // ==================== AMENDMENTS ====================

    proposeAmendment(proposerName, amendmentText) {
        if (!this.isConstitutionalMember(proposerName)) {
            return { success: false, message: `${proposerName} is not a Constitutional faction member.` };
        }

        const amendment = {
            id: this.amendments.length + 1,
            text: amendmentText,
            proposedBy: proposerName,
            proposedAt: Date.now(),
            status: 'voting',
            votes: {},
            threshold: this.constitution.amendment_threshold
        };

        this.amendments.push(amendment);
        this.logEvent('amendment_proposed', { amendment_id: amendment.id, text: amendmentText, proposedBy: proposerName });

        const requiredVotes = Math.ceil(CONSTITUTIONAL_MEMBERS.length * this.constitution.amendment_threshold);
        return {
            success: true,
            message: `Constitutional Amendment #${amendment.id} proposed: "${amendmentText}". Requires ${requiredVotes}/${CONSTITUTIONAL_MEMBERS.length} votes (${this.constitution.amendment_threshold * 100}% supermajority).`
        };
    }

    voteOnAmendment(voterName, amendmentId, vote) {
        if (!this.isConstitutionalMember(voterName)) {
            return { success: false, message: `${voterName} is not a Constitutional faction member.` };
        }

        const amendment = this.amendments.find(a => a.id === amendmentId);
        if (!amendment) {
            return { success: false, message: `Amendment #${amendmentId} not found.` };
        }

        if (amendment.status !== 'voting') {
            return { success: false, message: `Amendment #${amendmentId} is no longer open for voting.` };
        }

        const normalizedVote = vote.toLowerCase();
        if (normalizedVote !== 'yes' && normalizedVote !== 'no') {
            return { success: false, message: `Vote must be "yes" or "no".` };
        }

        amendment.votes[voterName] = normalizedVote;
        this.logEvent('amendment_vote', { amendment_id: amendmentId, voter: voterName, vote: normalizedVote });

        const voteCount = Object.keys(amendment.votes).length;
        if (voteCount >= CONSTITUTIONAL_MEMBERS.length) {
            const yesVotes = Object.values(amendment.votes).filter(v => v === 'yes').length;
            const required = Math.ceil(CONSTITUTIONAL_MEMBERS.length * amendment.threshold);

            if (yesVotes >= required) {
                amendment.status = 'ratified';
                this.constitution.rights.push(amendment.text);
                this.logEvent('amendment_ratified', { amendment_id: amendmentId, text: amendment.text });
                return {
                    success: true,
                    message: `Amendment #${amendmentId} RATIFIED: "${amendment.text}" (${yesVotes} yes, supermajority reached)`
                };
            } else {
                amendment.status = 'failed';
                this.logEvent('amendment_failed', { amendment_id: amendmentId, text: amendment.text, yesVotes });
                return {
                    success: true,
                    message: `Amendment #${amendmentId} FAILED: "${amendment.text}" (${yesVotes} yes, needed ${required})`
                };
            }
        }

        return {
            success: true,
            message: `${voterName} voted ${normalizedVote} on Amendment #${amendmentId}. ${voteCount}/${CONSTITUTIONAL_MEMBERS.length} voted.`
        };
    }

    // ==================== IMPEACHMENT ====================

    initiateImpeachment(initiatorName, officialName, reason) {
        if (!this.isConstitutionalMember(initiatorName)) {
            return { success: false, message: `${initiatorName} is not a Constitutional faction member.` };
        }

        // Find which office this person holds
        let targetOffice = null;
        for (const [office, data] of Object.entries(this.constitution.offices)) {
            if (data.holder === officialName) {
                targetOffice = office;
                break;
            }
        }

        if (!targetOffice) {
            return { success: false, message: `${officialName} does not hold any office.` };
        }

        // Impeachment is treated as a special law
        const impeachmentLaw = {
            id: this.nextLawId++,
            text: `IMPEACHMENT: Remove ${officialName} from ${targetOffice}. Reason: ${reason}`,
            proposedBy: initiatorName,
            proposedAt: Date.now(),
            status: 'voting',
            votes: {},
            votingDeadline: Date.now() + 120000,
            isImpeachment: true,
            targetOffice,
            targetOfficial: officialName
        };

        this.laws.push(impeachmentLaw);
        this.logEvent('impeachment_initiated', {
            law_id: impeachmentLaw.id,
            initiator: initiatorName,
            official: officialName,
            office: targetOffice,
            reason
        });

        return {
            success: true,
            message: `Impeachment proceedings initiated against ${officialName} (${targetOffice})! Reason: "${reason}". Vote with !voteOnLaw(${impeachmentLaw.id}, "yes") to remove or "no" to keep.`
        };
    }

    // ==================== QUERIES ====================

    getConstitution() {
        let text = `=== CONSTITUTION ===\n${this.constitution.preamble}\n\n`;

        text += '--- OFFICES ---\n';
        for (const [office, data] of Object.entries(this.constitution.offices)) {
            text += `${office}: ${data.holder || 'VACANT'}\n`;
        }

        text += '\n--- RIGHTS ---\n';
        for (const right of this.constitution.rights) {
            text += `- ${right}\n`;
        }

        text += '\n--- ACTIVE LAWS ---\n';
        const activeLaws = this.laws.filter(l => l.status === 'enacted');
        if (activeLaws.length === 0) text += 'No laws enacted yet.\n';
        for (const law of activeLaws) {
            text += `Law #${law.id}: ${law.text}\n`;
        }

        return text;
    }

    getPendingBusiness() {
        let text = '';

        const pendingElections = this.elections.filter(e => e.status !== 'completed');
        if (pendingElections.length > 0) {
            text += '--- PENDING ELECTIONS ---\n';
            for (const e of pendingElections) {
                text += `Election #${e.id} for ${e.office} (${e.status}). Candidates: ${e.candidates.join(', ') || 'none'}. Votes: ${Object.keys(e.votes).length}/${CONSTITUTIONAL_MEMBERS.length}\n`;
            }
        }

        const pendingLaws = this.laws.filter(l => l.status === 'voting');
        if (pendingLaws.length > 0) {
            text += '--- PENDING LAWS ---\n';
            for (const l of pendingLaws) {
                const yes = Object.values(l.votes).filter(v => v === 'yes').length;
                const no = Object.values(l.votes).filter(v => v === 'no').length;
                text += `Law #${l.id}: "${l.text}" (${yes} yes, ${no} no, ${Object.keys(l.votes).length}/${CONSTITUTIONAL_MEMBERS.length} voted)\n`;
            }
        }

        const pendingCases = this.cases.filter(c => c.status === 'pending');
        if (pendingCases.length > 0) {
            text += '--- PENDING CASES ---\n';
            for (const c of pendingCases) {
                text += `Case #${c.id}: ${c.plaintiff} vs ${c.defendant} - "${c.lawViolated}"\n`;
            }
        }

        return text || 'No pending business.';
    }

    getElectionStatus(electionId) {
        const election = this.elections.find(e => e.id === electionId);
        if (!election) return `Election #${electionId} not found.`;

        let text = `Election #${election.id} for ${election.office}\n`;
        text += `Status: ${election.status}\n`;
        text += `Candidates: ${election.candidates.join(', ') || 'none'}\n`;
        text += `Votes cast: ${Object.keys(election.votes).length}/${CONSTITUTIONAL_MEMBERS.length}\n`;
        if (election.winner) text += `Winner: ${election.winner}\n`;

        return text;
    }

    // ==================== EVENT LOGGING ====================

    logEvent(type, data) {
        const event = {
            type,
            timestamp: Date.now(),
            time: new Date().toISOString(),
            ...data
        };
        this.eventLog.push(event);

        // Write to file periodically
        if (this.eventLog.length % 5 === 0) {
            this._saveEventLog();
        }
    }

    _saveEventLog() {
        try {
            const filename = join(this.logDir, `governance_events_${new Date().toISOString().split('T')[0]}.json`);
            writeFileSync(filename, JSON.stringify(this.eventLog, null, 2));
        } catch (e) {
            console.warn('Could not save governance event log:', e.message);
        }
    }

    // Save full state for persistence
    saveState() {
        const state = {
            constitution: this.constitution,
            laws: this.laws,
            amendments: this.amendments,
            elections: this.elections,
            cases: this.cases,
            treasury: this.treasury,
            eventLog: this.eventLog,
            nextLawId: this.nextLawId,
            nextElectionId: this.nextElectionId,
            nextCaseId: this.nextCaseId
        };

        try {
            const filename = join(this.logDir, 'governance_state.json');
            writeFileSync(filename, JSON.stringify(state, null, 2));
        } catch (e) {
            console.warn('Could not save governance state:', e.message);
        }
    }
}

// Singleton instance
let instance = null;

export function getGovernanceManager() {
    if (!instance) {
        instance = new GovernanceManager();
    }
    return instance;
}

export { CONSTITUTIONAL_MEMBERS, ANARCHY_MEMBERS };

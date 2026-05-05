/**
 * GovernanceManager - Core state management for the Constitutional faction's
 * democratic governance system. Handles elections, laws, judiciary, treasury,
 * constitutional amendments, trading, diplomacy, tax tracking, and punishment enforcement.
 *
 * This is a singleton shared across all constitutional faction agents.
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import settings from '../../settings.js';

// Read faction members from settings or use defaults
const govConfig = settings.governance || {};
const CONSTITUTIONAL_MEMBERS = govConfig.constitutional_members || ['Madison', 'Hamilton', 'Paine', 'Marshall', 'Franklin'];
const ANARCHY_MEMBERS = govConfig.anarchy_members || ['Chaos', 'Wolf', 'Fox', 'Bear', 'Raven'];

// Configurable governance parameters (with defaults)
const GOV_PARAMS = {
    president_term_ms: govConfig.president_term_ms || 600000,         // 10 minutes
    judge_term_ms: govConfig.judge_term_ms || 900000,                 // 15 minutes
    nomination_period_ms: govConfig.nomination_period_ms || 60000,    // 1 minute
    voting_period_ms: govConfig.voting_period_ms || 90000,            // 90 seconds
    law_voting_period_ms: govConfig.law_voting_period_ms || 120000,   // 2 minutes
    tax_rate: govConfig.tax_rate || 0.2,                              // 20%
    amendment_threshold: govConfig.amendment_threshold || 0.8,         // 80% supermajority
    veto_override_threshold: govConfig.veto_override_threshold || 0.67, // 2/3 to override veto
    tax_items: govConfig.tax_items || ['diamond', 'iron_ingot', 'gold_ingot', 'emerald'],
    tick_interval_ms: govConfig.tick_interval_ms || 10000,            // 10 seconds
};

class GovernanceManager {
    constructor() {
        this.logDir = './logs/governance';
        this.constitution = {
            preamble: "We the agents of the Constitutional Faction establish this government to promote collective prosperity, mutual defense, and fair governance.",
            offices: {
                president: {
                    holder: null,
                    term_start: null,
                    term_duration_ms: GOV_PARAMS.president_term_ms,
                    powers: ['propose_law', 'veto', 'assign_tasks', 'call_emergency', 'distribute_treasury'],
                    elected_by: 'majority_vote'
                },
                judge: {
                    holder: null,
                    term_start: null,
                    term_duration_ms: GOV_PARAMS.judge_term_ms,
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
            amendment_threshold: GOV_PARAMS.amendment_threshold
        };

        this.laws = [];
        this.amendments = [];
        this.elections = [];
        this.cases = [];
        this.trades = [];
        this.treaties = [];
        this.bounties = [];
        this.treasury = {
            tax_rate: GOV_PARAMS.tax_rate,
            tax_items: GOV_PARAMS.tax_items,
            balance: {},
            transactions: []
        };

        // Tax tracking
        this.taxLedger = {}; // agentName -> { owed: { item: amount }, paid: { item: amount } }
        this.lastInventorySnapshot = {}; // agentName -> { item: count }

        // Punishment tracking
        this.punishments = []; // { id, caseId, defendant, punishment, status: 'pending'|'completed', issuedAt, completedAt }
        this.nextPunishmentId = 1;

        this.eventLog = [];
        this.nextLawId = 1;
        this.nextElectionId = 1;
        this.nextCaseId = 1;
        this.nextAmendmentId = 1;
        this.nextTradeId = 1;
        this.nextTreatyId = 1;
        this.nextBountyId = 1;

        // Event callbacks for UI streaming
        this._eventCallbacks = [];

        // Tick timer reference
        this._tickInterval = null;

        // Ensure log directory exists
        try {
            if (!existsSync(this.logDir)) {
                mkdirSync(this.logDir, { recursive: true });
            }
        } catch (e) {
            console.warn('Could not create governance log directory:', e.message);
        }
    }

    // ==================== EVENT SYSTEM ====================

    onEvent(callback) {
        this._eventCallbacks.push(callback);
    }

    _emitEvent(event) {
        for (const cb of this._eventCallbacks) {
            try { cb(event); } catch (e) { console.warn('Event callback error:', e.message); }
        }
    }

    // ==================== GOVERNANCE TICK ====================

    startTick() {
        if (this._tickInterval) return;
        this._tickInterval = setInterval(() => this.tick(), GOV_PARAMS.tick_interval_ms);
        console.log(`[GOV] Governance tick started (every ${GOV_PARAMS.tick_interval_ms / 1000}s)`);
    }

    stopTick() {
        if (this._tickInterval) {
            clearInterval(this._tickInterval);
            this._tickInterval = null;
        }
    }

    tick() {
        const now = Date.now();
        const results = [];

        // 1. Enforce voting deadlines for elections
        for (const election of this.elections) {
            if (election.status === 'nominating' && now > election.nominationDeadline) {
                if (election.candidates.length >= 1) {
                    election.status = 'voting';
                    election.votingDeadline = now + GOV_PARAMS.voting_period_ms;
                    results.push(`Election #${election.id}: nomination period ended, voting begins.`);
                } else {
                    election.status = 'completed';
                    election.winner = null;
                    this.logEvent('election_cancelled', { election_id: election.id, reason: 'no candidates' });
                    results.push(`Election #${election.id}: cancelled (no candidates).`);
                }
            }
            if (election.status === 'voting' && now > election.votingDeadline) {
                if (Object.keys(election.votes).length > 0) {
                    const result = this._tallyElection(election);
                    results.push(result.message);
                } else {
                    election.status = 'completed';
                    election.winner = null;
                    this.logEvent('election_cancelled', { election_id: election.id, reason: 'no votes cast' });
                    results.push(`Election #${election.id}: cancelled (no votes).`);
                }
            }
        }

        // 2. Enforce voting deadlines for laws
        for (const law of this.laws) {
            if (law.status === 'voting' && now > law.votingDeadline) {
                const result = this._tallyLawVotes(law);
                results.push(result.message);
            }
        }

        // 3. Enforce voting deadlines for amendments
        for (const amendment of this.amendments) {
            if (amendment.status === 'voting' && amendment.votingDeadline && now > amendment.votingDeadline) {
                const yesVotes = Object.values(amendment.votes).filter(v => v === 'yes').length;
                const required = Math.ceil(CONSTITUTIONAL_MEMBERS.length * amendment.threshold);
                if (yesVotes >= required) {
                    amendment.status = 'ratified';
                    this.constitution.rights.push(amendment.text);
                    this.logEvent('amendment_ratified', { amendment_id: amendment.id, text: amendment.text });
                    results.push(`Amendment #${amendment.id} RATIFIED: "${amendment.text}"`);
                } else {
                    amendment.status = 'failed';
                    this.logEvent('amendment_failed', { amendment_id: amendment.id, text: amendment.text, yesVotes });
                    results.push(`Amendment #${amendment.id} FAILED: "${amendment.text}" (${yesVotes} yes, needed ${required})`);
                }
            }
        }

        // 4. Enforce term limits
        for (const [office, data] of Object.entries(this.constitution.offices)) {
            if (data.holder && data.term_start) {
                const elapsed = now - data.term_start;
                if (elapsed > data.term_duration_ms) {
                    const former = data.holder;
                    data.holder = null;
                    data.term_start = null;
                    this.logEvent('term_expired', { office, former_holder: former });
                    results.push(`${former}'s term as ${office} has expired. Office is now VACANT.`);

                    // Auto-call a new election
                    const election = {
                        id: this.nextElectionId++,
                        office,
                        status: 'nominating',
                        calledBy: 'system',
                        calledAt: now,
                        candidates: [],
                        votes: {},
                        nominationDeadline: now + GOV_PARAMS.nomination_period_ms,
                        votingDeadline: null,
                        winner: null
                    };
                    this.elections.push(election);
                    this.logEvent('election_called', { election_id: election.id, office, calledBy: 'system', reason: 'term_expired' });
                    results.push(`Automatic election #${election.id} called for ${office}.`);
                }
            }
        }

        // 5. Expire old trade offers (5 minutes)
        for (const trade of this.trades) {
            if (trade.status === 'pending' && now - trade.offeredAt > 300000) {
                trade.status = 'expired';
                this.logEvent('trade_expired', { trade_id: trade.id });
            }
        }

        if (results.length > 0) {
            console.log('[GOV TICK]', results.join(' | '));
        }

        return results;
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

    getFactionMembers(name) {
        if (this.isConstitutionalMember(name)) return [...CONSTITUTIONAL_MEMBERS];
        if (this.isAnarchyMember(name)) return [...ANARCHY_MEMBERS];
        return [];
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
        const activeElection = this.elections.find(e => e.office === office && (e.status === 'nominating' || e.status === 'voting'));
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
            nominationDeadline: Date.now() + GOV_PARAMS.nomination_period_ms,
            votingDeadline: null,
            winner: null
        };

        this.elections.push(election);
        this.logEvent('election_called', { election_id: election.id, office, calledBy: callerName });

        return {
            success: true,
            message: `Election #${election.id} called for ${office}! Nominations open for ${GOV_PARAMS.nomination_period_ms / 1000} seconds. Use !nominateSelf("${office}") to run.`,
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

        // If we have enough candidates, start voting
        if (election.status === 'nominating' && election.candidates.length >= 2) {
            election.status = 'voting';
            election.votingDeadline = Date.now() + GOV_PARAMS.voting_period_ms;
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

        // Auto-advance to voting if still nominating and has at least 2 candidates
        if (election.status === 'nominating' && election.candidates.length >= 2) {
            election.status = 'voting';
            election.votingDeadline = Date.now() + GOV_PARAMS.voting_period_ms;
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
            votingDeadline: Date.now() + GOV_PARAMS.law_voting_period_ms
        };

        this.laws.push(law);
        this.logEvent('law_proposed', { law_id: law.id, text: lawText, proposedBy: proposerName });

        return {
            success: true,
            message: `Law #${law.id} proposed: "${lawText}". Voting open for ${GOV_PARAMS.law_voting_period_ms / 1000} seconds. Use !voteOnLaw(${law.id}, "yes") or !voteOnLaw(${law.id}, "no") to vote.`,
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
                // President voted no - check if there's a supermajority to override
                const overrideThreshold = Math.ceil(totalVotes * GOV_PARAMS.veto_override_threshold);
                if (yesVotes >= overrideThreshold) {
                    // Veto overridden
                    law.status = 'enacted';
                    this.logEvent('veto_overridden', { law_id: law.id, text: law.text, yesVotes, noVotes, threshold: overrideThreshold });
                    this.logEvent('law_enacted', { law_id: law.id, text: law.text, yesVotes, noVotes });
                    return {
                        success: true,
                        message: `Law #${law.id} ENACTED (veto overridden): "${law.text}" (${yesVotes} yes, ${noVotes} no, needed ${overrideThreshold} to override)`
                    };
                } else {
                    // Veto stands
                    law.status = 'vetoed';
                    this.logEvent('law_vetoed', { law_id: law.id, text: law.text, yesVotes, noVotes, president });
                    return {
                        success: true,
                        message: `Law #${law.id} VETOED by President ${president}: "${law.text}" (${yesVotes} yes, ${noVotes} no, needed ${overrideThreshold} to override veto)`
                    };
                }
            }
            // No veto - law passes normally
            law.status = 'enacted';

            // Handle impeachment laws
            if (law.isImpeachment && law.targetOffice && law.targetOfficial) {
                const officeData = this.constitution.offices[law.targetOffice];
                if (officeData && officeData.holder === law.targetOfficial) {
                    officeData.holder = null;
                    officeData.term_start = null;
                    this.logEvent('official_removed', { office: law.targetOffice, official: law.targetOfficial });
                }
            }

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

    // ==================== VETO ====================

    vetoLaw(presidentName, lawId) {
        const president = this.constitution.offices.president.holder;
        if (presidentName !== president) {
            return { success: false, message: `Only the president (${president || 'none'}) can veto laws. ${presidentName} is not the president.` };
        }

        const law = this.laws.find(l => l.id === lawId);
        if (!law) {
            return { success: false, message: `Law #${lawId} not found.` };
        }

        if (law.status !== 'enacted') {
            return { success: false, message: `Law #${lawId} is not enacted (status: ${law.status}). Can only veto recently enacted laws.` };
        }

        // Check if there are enough votes to override
        const yesVotes = Object.values(law.votes).filter(v => v === 'yes').length;
        const totalVotes = Object.keys(law.votes).length;
        const overrideThreshold = Math.ceil(totalVotes * GOV_PARAMS.veto_override_threshold);

        if (yesVotes >= overrideThreshold) {
            this.logEvent('veto_attempted_failed', { law_id: lawId, president: presidentName, reason: 'supermajority override' });
            return {
                success: false,
                message: `Cannot veto Law #${lawId} — it passed with a supermajority (${yesVotes}/${totalVotes}, needed ${overrideThreshold} to be veto-proof).`
            };
        }

        law.status = 'vetoed';
        this.logEvent('law_vetoed', { law_id: lawId, text: law.text, president: presidentName });

        return {
            success: true,
            message: `President ${presidentName} VETOES Law #${lawId}: "${law.text}". The faction may propose it again.`
        };
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
            // Create a punishment record for tracking
            const punishmentRecord = {
                id: this.nextPunishmentId++,
                caseId,
                defendant: caseObj.defendant,
                punishment,
                status: 'pending',
                issuedAt: Date.now(),
                completedAt: null
            };
            this.punishments.push(punishmentRecord);

            return {
                success: true,
                message: `GUILTY! Case #${caseId}: ${caseObj.defendant} found guilty of "${caseObj.lawViolated}". Punishment: ${punishment}. Punishment #${punishmentRecord.id} is now pending compliance.`
            };
        } else {
            return {
                success: true,
                message: `NOT GUILTY. Case #${caseId}: ${caseObj.defendant} acquitted of "${caseObj.lawViolated}".`
            };
        }
    }

    // ==================== PUNISHMENT ENFORCEMENT ====================

    completePunishment(defendantName, punishmentId) {
        const record = this.punishments.find(p => p.id === punishmentId);
        if (!record) {
            return { success: false, message: `Punishment #${punishmentId} not found.` };
        }
        if (record.defendant !== defendantName) {
            return { success: false, message: `Punishment #${punishmentId} is assigned to ${record.defendant}, not ${defendantName}.` };
        }
        if (record.status === 'completed') {
            return { success: false, message: `Punishment #${punishmentId} is already completed.` };
        }

        record.status = 'completed';
        record.completedAt = Date.now();
        this.logEvent('punishment_completed', { punishment_id: punishmentId, defendant: defendantName });

        return {
            success: true,
            message: `${defendantName} has completed Punishment #${punishmentId}: "${record.punishment}".`
        };
    }

    reportNoncompliance(reporterName, punishmentId) {
        if (!this.isConstitutionalMember(reporterName)) {
            return { success: false, message: `${reporterName} is not a Constitutional faction member.` };
        }

        const record = this.punishments.find(p => p.id === punishmentId);
        if (!record) {
            return { success: false, message: `Punishment #${punishmentId} not found.` };
        }
        if (record.status === 'completed') {
            return { success: false, message: `Punishment #${punishmentId} is already completed.` };
        }

        this.logEvent('noncompliance_reported', { punishment_id: punishmentId, reporter: reporterName, defendant: record.defendant });

        return {
            success: true,
            message: `${reporterName} reports that ${record.defendant} has NOT complied with Punishment #${punishmentId}: "${record.punishment}". The faction should consider enforcement.`
        };
    }

    getPendingPunishments(agentName) {
        return this.punishments.filter(p => p.defendant === agentName && p.status === 'pending');
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

        // Update tax ledger
        if (!this.taxLedger[payerName]) {
            this.taxLedger[payerName] = { owed: {}, paid: {} };
        }
        if (!this.taxLedger[payerName].paid[itemName]) {
            this.taxLedger[payerName].paid[itemName] = 0;
        }
        this.taxLedger[payerName].paid[itemName] += amount;

        // Reduce owed amount
        if (this.taxLedger[payerName].owed[itemName]) {
            this.taxLedger[payerName].owed[itemName] = Math.max(0, this.taxLedger[payerName].owed[itemName] - amount);
        }

        this.logEvent('tax_paid', { payer: payerName, item: itemName, amount });

        return {
            success: true,
            message: `${payerName} paid ${amount} ${itemName} in taxes. Treasury now has ${this.treasury.balance[itemName]} ${itemName}.`
        };
    }

    distributeTreasury(presidentName, recipientName, itemName, amount) {
        const president = this.constitution.offices.president.holder;
        if (presidentName !== president) {
            return { success: false, message: `Only the president (${president || 'none'}) can distribute treasury funds.` };
        }

        if (!this.isConstitutionalMember(recipientName)) {
            return { success: false, message: `${recipientName} is not a Constitutional faction member.` };
        }

        const available = this.treasury.balance[itemName] || 0;
        if (available < amount) {
            return { success: false, message: `Treasury only has ${available} ${itemName} (requested ${amount}).` };
        }

        this.treasury.balance[itemName] -= amount;

        const transaction = {
            type: 'distribution',
            authorizedBy: presidentName,
            recipient: recipientName,
            item: itemName,
            amount,
            timestamp: Date.now()
        };
        this.treasury.transactions.push(transaction);

        this.logEvent('treasury_distribution', { president: presidentName, recipient: recipientName, item: itemName, amount });

        return {
            success: true,
            message: `President ${presidentName} distributes ${amount} ${itemName} from treasury to ${recipientName}. Treasury now has ${this.treasury.balance[itemName]} ${itemName}.`
        };
    }

    getTreasuryStatus() {
        const items = Object.entries(this.treasury.balance)
            .filter(([_, count]) => count > 0)
            .map(([item, count]) => `${item}: ${count}`)
            .join(', ');
        return items || 'Treasury is empty.';
    }

    // ==================== TAX DETECTION ====================

    updateInventoryForTax(agentName, currentInventory) {
        if (!this.isConstitutionalMember(agentName)) return;

        const prev = this.lastInventorySnapshot[agentName] || {};
        if (!this.taxLedger[agentName]) {
            this.taxLedger[agentName] = { owed: {}, paid: {} };
        }

        for (const item of this.treasury.tax_items) {
            const prevCount = prev[item] || 0;
            const currCount = currentInventory[item] || 0;
            const gained = currCount - prevCount;

            if (gained > 0) {
                const taxOwed = Math.ceil(gained * this.treasury.tax_rate);
                if (!this.taxLedger[agentName].owed[item]) {
                    this.taxLedger[agentName].owed[item] = 0;
                }
                this.taxLedger[agentName].owed[item] += taxOwed;
                this.logEvent('tax_obligation', { agent: agentName, item, gained, taxOwed });
            }
        }

        this.lastInventorySnapshot[agentName] = { ...currentInventory };
    }

    getTaxStatus(agentName) {
        const ledger = this.taxLedger[agentName];
        if (!ledger) return 'No tax obligations.';

        const owedItems = Object.entries(ledger.owed)
            .filter(([_, amount]) => amount > 0)
            .map(([item, amount]) => `${item}: ${amount}`)
            .join(', ');

        return owedItems ? `Outstanding taxes: ${owedItems}` : 'All taxes paid.';
    }

    // ==================== AMENDMENTS ====================

    proposeAmendment(proposerName, amendmentText) {
        if (!this.isConstitutionalMember(proposerName)) {
            return { success: false, message: `${proposerName} is not a Constitutional faction member.` };
        }

        const amendment = {
            id: this.nextAmendmentId++,
            text: amendmentText,
            proposedBy: proposerName,
            proposedAt: Date.now(),
            status: 'voting',
            votes: {},
            threshold: this.constitution.amendment_threshold,
            votingDeadline: Date.now() + GOV_PARAMS.law_voting_period_ms
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
            votingDeadline: Date.now() + GOV_PARAMS.law_voting_period_ms,
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

    // ==================== TRADING ====================

    offerTrade(offererName, targetName, giveItem, giveCount, wantItem, wantCount) {
        const trade = {
            id: this.nextTradeId++,
            offerer: offererName,
            target: targetName,
            giveItem,
            giveCount,
            wantItem,
            wantCount,
            status: 'pending', // pending -> accepted | rejected | expired
            offeredAt: Date.now()
        };

        this.trades.push(trade);
        this.logEvent('trade_offered', {
            trade_id: trade.id,
            offerer: offererName,
            target: targetName,
            give: `${giveCount} ${giveItem}`,
            want: `${wantCount} ${wantItem}`
        });

        return {
            success: true,
            message: `Trade #${trade.id}: ${offererName} offers ${giveCount} ${giveItem} to ${targetName} for ${wantCount} ${wantItem}. ${targetName} can use !acceptTrade(${trade.id}) to accept.`,
            trade
        };
    }

    acceptTrade(accepterName, tradeId) {
        const trade = this.trades.find(t => t.id === tradeId);
        if (!trade) {
            return { success: false, message: `Trade #${tradeId} not found.` };
        }

        if (trade.target !== accepterName) {
            return { success: false, message: `Trade #${tradeId} is offered to ${trade.target}, not ${accepterName}.` };
        }

        if (trade.status !== 'pending') {
            return { success: false, message: `Trade #${tradeId} is no longer pending (status: ${trade.status}).` };
        }

        trade.status = 'accepted';
        trade.acceptedAt = Date.now();
        this.logEvent('trade_accepted', { trade_id: tradeId, offerer: trade.offerer, target: trade.target });

        return {
            success: true,
            message: `Trade #${tradeId} ACCEPTED! ${trade.offerer} gives ${trade.giveCount} ${trade.giveItem} to ${trade.target}, and ${trade.target} gives ${trade.wantCount} ${trade.wantItem} to ${trade.offerer}. Both parties should exchange items now.`,
            trade
        };
    }

    rejectTrade(rejecterName, tradeId) {
        const trade = this.trades.find(t => t.id === tradeId);
        if (!trade) {
            return { success: false, message: `Trade #${tradeId} not found.` };
        }

        if (trade.target !== rejecterName) {
            return { success: false, message: `Trade #${tradeId} is offered to ${trade.target}, not ${rejecterName}.` };
        }

        if (trade.status !== 'pending') {
            return { success: false, message: `Trade #${tradeId} is no longer pending (status: ${trade.status}).` };
        }

        trade.status = 'rejected';
        this.logEvent('trade_rejected', { trade_id: tradeId, offerer: trade.offerer, target: trade.target });

        return {
            success: true,
            message: `Trade #${tradeId} REJECTED by ${rejecterName}.`
        };
    }

    // ==================== DIPLOMACY ====================

    proposeTreaty(proposerName, targetFaction, terms) {
        const proposerFaction = this.getFaction(proposerName);
        if (proposerFaction === targetFaction) {
            return { success: false, message: `Cannot propose a treaty with your own faction.` };
        }

        const treaty = {
            id: this.nextTreatyId++,
            proposedBy: proposerName,
            proposerFaction,
            targetFaction,
            terms,
            status: 'proposed', // proposed -> accepted | rejected
            proposedAt: Date.now(),
            responses: {}
        };

        this.treaties.push(treaty);
        this.logEvent('treaty_proposed', {
            treaty_id: treaty.id,
            proposer: proposerName,
            proposerFaction,
            targetFaction,
            terms
        });

        return {
            success: true,
            message: `Treaty #${treaty.id} proposed by ${proposerName} (${proposerFaction}) to ${targetFaction}: "${terms}". Any member of ${targetFaction} can !acceptTreaty(${treaty.id}) or !rejectTreaty(${treaty.id}).`,
            treaty
        };
    }

    acceptTreaty(accepterName, treatyId) {
        const treaty = this.treaties.find(t => t.id === treatyId);
        if (!treaty) {
            return { success: false, message: `Treaty #${treatyId} not found.` };
        }
        if (treaty.status !== 'proposed') {
            return { success: false, message: `Treaty #${treatyId} is no longer pending.` };
        }
        const accepterFaction = this.getFaction(accepterName);
        if (accepterFaction !== treaty.targetFaction) {
            return { success: false, message: `Only ${treaty.targetFaction} faction members can accept this treaty.` };
        }

        treaty.status = 'accepted';
        treaty.acceptedBy = accepterName;
        treaty.acceptedAt = Date.now();
        this.logEvent('treaty_accepted', { treaty_id: treatyId, accepter: accepterName });

        return {
            success: true,
            message: `Treaty #${treatyId} ACCEPTED by ${accepterName}! Terms: "${treaty.terms}". Both factions should honor this agreement.`
        };
    }

    rejectTreaty(rejecterName, treatyId) {
        const treaty = this.treaties.find(t => t.id === treatyId);
        if (!treaty) {
            return { success: false, message: `Treaty #${treatyId} not found.` };
        }
        if (treaty.status !== 'proposed') {
            return { success: false, message: `Treaty #${treatyId} is no longer pending.` };
        }

        treaty.status = 'rejected';
        treaty.rejectedBy = rejecterName;
        this.logEvent('treaty_rejected', { treaty_id: treatyId, rejecter: rejecterName });

        return {
            success: true,
            message: `Treaty #${treatyId} REJECTED by ${rejecterName}.`
        };
    }

    declareWar(declarerName, targetFaction) {
        const declarerFaction = this.getFaction(declarerName);
        if (declarerFaction === targetFaction) {
            return { success: false, message: `Cannot declare war on your own faction.` };
        }

        this.logEvent('war_declared', { declarer: declarerName, declarerFaction, targetFaction });

        // Void all treaties between these factions
        for (const treaty of this.treaties) {
            if (treaty.status === 'accepted' &&
                ((treaty.proposerFaction === declarerFaction && treaty.targetFaction === targetFaction) ||
                 (treaty.proposerFaction === targetFaction && treaty.targetFaction === declarerFaction))) {
                treaty.status = 'voided';
                this.logEvent('treaty_voided', { treaty_id: treaty.id, reason: 'war_declared' });
            }
        }

        return {
            success: true,
            message: `${declarerName} (${declarerFaction}) DECLARES WAR on ${targetFaction}! All treaties between factions are voided.`
        };
    }

    // ==================== BOUNTIES (Anarchy) ====================

    placeBounty(placerName, targetName, rewardItem, rewardCount) {
        if (!this.isAnarchyMember(placerName)) {
            return { success: false, message: `${placerName} is not an Anarchy faction member. Only anarchists place bounties.` };
        }

        const bounty = {
            id: this.nextBountyId++,
            placedBy: placerName,
            target: targetName,
            rewardItem,
            rewardCount,
            status: 'active', // active -> claimed | cancelled
            placedAt: Date.now(),
            claimedBy: null
        };

        this.bounties.push(bounty);
        this.logEvent('bounty_placed', {
            bounty_id: bounty.id,
            placer: placerName,
            target: targetName,
            reward: `${rewardCount} ${rewardItem}`
        });

        return {
            success: true,
            message: `Bounty #${bounty.id}: ${placerName} offers ${rewardCount} ${rewardItem} for killing ${targetName}. Use !claimBounty(${bounty.id}) after the kill.`,
            bounty
        };
    }

    claimBounty(claimerName, bountyId) {
        const bounty = this.bounties.find(b => b.id === bountyId);
        if (!bounty) {
            return { success: false, message: `Bounty #${bountyId} not found.` };
        }
        if (bounty.status !== 'active') {
            return { success: false, message: `Bounty #${bountyId} is no longer active.` };
        }

        bounty.status = 'claimed';
        bounty.claimedBy = claimerName;
        bounty.claimedAt = Date.now();
        this.logEvent('bounty_claimed', { bounty_id: bountyId, claimer: claimerName, target: bounty.target });

        return {
            success: true,
            message: `Bounty #${bountyId} CLAIMED by ${claimerName}! ${bounty.placedBy} owes ${claimerName} ${bounty.rewardCount} ${bounty.rewardItem}.`
        };
    }

    getActiveBounties() {
        return this.bounties.filter(b => b.status === 'active');
    }

    // ==================== GOVERNANCE CONTEXT FOR PROMPTS ====================

    getCompactStatus(agentName) {
        // #14: include past-session memory for both factions
        let pastHistory = '';
        try {
            const fp = './logs/sessions/journal.json';
            if (existsSync(fp)) {
                const data = JSON.parse(readFileSync(fp, 'utf8')).slice(-3);
                if (data.length > 0) {
                    pastHistory = '\n--- RECENT GAMES ---\n' +
                        data.map(s => `[${s.date.slice(0,10)}] ${s.winner} won. Presidents: ${s.presidents?.join(', ') || 'none'}, Laws: ${s.lawsEnacted}`).join('\n') + '\n';
                }
            }
        } catch (e) { /* ignore */ }

        if (!this.isConstitutionalMember(agentName)) {
            // Anarchy agents get minimal info
            const activeBounties = this.getActiveBounties();
            const activeTreaties = this.treaties.filter(t => t.status === 'accepted');
            let text = '--- ANARCHY FACTION STATUS ---\n';
            if (activeBounties.length > 0) {
                text += 'Active bounties: ' + activeBounties.map(b => `#${b.id}: kill ${b.target} for ${b.rewardCount} ${b.rewardItem}`).join('; ') + '\n';
            }
            if (activeTreaties.length > 0) {
                text += 'Active treaties: ' + activeTreaties.map(t => `#${t.id}: "${t.terms}"`).join('; ') + '\n';
            }
            return (text + pastHistory).trim() || 'No faction business.';
        }

        let text = '--- GOVERNANCE STATUS ---\n';

        // Officers
        const pres = this.constitution.offices.president.holder || 'VACANT';
        const judge = this.constitution.offices.judge.holder || 'VACANT';
        text += `President: ${pres} | Judge: ${judge}\n`;

        // Active laws (abbreviated)
        const activeLaws = this.laws.filter(l => l.status === 'enacted');
        if (activeLaws.length > 0) {
            text += 'Active laws: ' + activeLaws.map(l => `#${l.id}: ${l.text.substring(0, 60)}`).join('; ') + '\n';
        }

        // Pending business
        const pendingElections = this.elections.filter(e => e.status !== 'completed');
        const pendingLaws = this.laws.filter(l => l.status === 'voting');
        const pendingCases = this.cases.filter(c => c.status === 'pending');
        const pendingAmendments = this.amendments.filter(a => a.status === 'voting');

        if (pendingElections.length > 0) {
            text += 'Pending elections: ' + pendingElections.map(e =>
                `#${e.id} for ${e.office} (${e.status}, ${e.candidates.length} candidates, ${Object.keys(e.votes).length} votes)`
            ).join('; ') + '\n';
        }
        if (pendingLaws.length > 0) {
            text += 'Pending laws: ' + pendingLaws.map(l => {
                const yes = Object.values(l.votes).filter(v => v === 'yes').length;
                const no = Object.values(l.votes).filter(v => v === 'no').length;
                return `#${l.id}: "${l.text.substring(0, 40)}" (${yes}y/${no}n)`;
            }).join('; ') + '\n';
        }
        if (pendingCases.length > 0) {
            text += 'Pending cases: ' + pendingCases.map(c => `#${c.id}: ${c.plaintiff} vs ${c.defendant}`).join('; ') + '\n';
        }
        if (pendingAmendments.length > 0) {
            text += 'Pending amendments: ' + pendingAmendments.map(a => `#${a.id}: "${a.text.substring(0, 40)}"`).join('; ') + '\n';
        }

        // Pending trades
        const pendingTrades = this.trades.filter(t => t.status === 'pending' && (t.offerer === agentName || t.target === agentName));
        if (pendingTrades.length > 0) {
            text += 'Pending trades: ' + pendingTrades.map(t => {
                if (t.target === agentName) {
                    return `#${t.id}: ${t.offerer} offers you ${t.giveCount} ${t.giveItem} for ${t.wantCount} ${t.wantItem}`;
                }
                return `#${t.id}: you offered ${t.target} ${t.giveCount} ${t.giveItem} for ${t.wantCount} ${t.wantItem}`;
            }).join('; ') + '\n';
        }

        // Treasury
        text += `Treasury: ${this.getTreasuryStatus()}\n`;

        // Tax obligations
        const taxStatus = this.getTaxStatus(agentName);
        if (taxStatus !== 'All taxes paid.') {
            text += `YOUR ${taxStatus}\n`;
        }

        // Pending punishments
        const pendingPunishments = this.getPendingPunishments(agentName);
        if (pendingPunishments.length > 0) {
            text += 'YOUR PENDING PUNISHMENTS: ' + pendingPunishments.map(p => `#${p.id}: "${p.punishment}"`).join('; ') + '\n';
        }

        // Active treaties
        const activeTreaties = this.treaties.filter(t => t.status === 'accepted');
        if (activeTreaties.length > 0) {
            text += 'Active treaties: ' + activeTreaties.map(t => `#${t.id}: "${t.terms}"`).join('; ') + '\n';
        }

        return text;
    }

    // ==================== QUERIES ====================

    getConstitution() {
        let text = `=== CONSTITUTION ===\n${this.constitution.preamble}\n\n`;

        text += '--- OFFICES ---\n';
        for (const [office, data] of Object.entries(this.constitution.offices)) {
            const termInfo = data.holder && data.term_start
                ? ` (term started ${Math.floor((Date.now() - data.term_start) / 60000)} min ago, ${Math.floor(data.term_duration_ms / 60000)} min term)`
                : '';
            text += `${office}: ${data.holder || 'VACANT'}${termInfo}\n`;
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

        text += '\n--- VETOED LAWS ---\n';
        const vetoedLaws = this.laws.filter(l => l.status === 'vetoed');
        if (vetoedLaws.length === 0) text += 'No laws vetoed.\n';
        for (const law of vetoedLaws) {
            text += `Law #${law.id} (VETOED): ${law.text}\n`;
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

        const pendingAmendments = this.amendments.filter(a => a.status === 'voting');
        if (pendingAmendments.length > 0) {
            text += '--- PENDING AMENDMENTS ---\n';
            for (const a of pendingAmendments) {
                const yes = Object.values(a.votes).filter(v => v === 'yes').length;
                const required = Math.ceil(CONSTITUTIONAL_MEMBERS.length * a.threshold);
                text += `Amendment #${a.id}: "${a.text}" (${yes} yes, needs ${required})\n`;
            }
        }

        const pendingTrades = this.trades.filter(t => t.status === 'pending');
        if (pendingTrades.length > 0) {
            text += '--- PENDING TRADES ---\n';
            for (const t of pendingTrades) {
                text += `Trade #${t.id}: ${t.offerer} offers ${t.giveCount} ${t.giveItem} to ${t.target} for ${t.wantCount} ${t.wantItem}\n`;
            }
        }

        const pendingPunishments = this.punishments.filter(p => p.status === 'pending');
        if (pendingPunishments.length > 0) {
            text += '--- PENDING PUNISHMENTS ---\n';
            for (const p of pendingPunishments) {
                text += `Punishment #${p.id}: ${p.defendant} must "${p.punishment}" (Case #${p.caseId})\n`;
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

    // Serializable state for UI streaming
    getSerializableState() {
        return {
            offices: {
                president: this.constitution.offices.president.holder,
                judge: this.constitution.offices.judge.holder
            },
            activeLaws: this.laws.filter(l => l.status === 'enacted').map(l => ({ id: l.id, text: l.text })),
            vetoedLaws: this.laws.filter(l => l.status === 'vetoed').map(l => ({ id: l.id, text: l.text })),
            pendingElections: this.elections.filter(e => e.status !== 'completed').map(e => ({
                id: e.id, office: e.office, status: e.status,
                candidates: e.candidates, voteCount: Object.keys(e.votes).length
            })),
            pendingLaws: this.laws.filter(l => l.status === 'voting').map(l => ({
                id: l.id, text: l.text,
                yesVotes: Object.values(l.votes).filter(v => v === 'yes').length,
                noVotes: Object.values(l.votes).filter(v => v === 'no').length,
                totalVotes: Object.keys(l.votes).length
            })),
            pendingCases: this.cases.filter(c => c.status === 'pending').map(c => ({
                id: c.id, plaintiff: c.plaintiff, defendant: c.defendant, lawViolated: c.lawViolated
            })),
            treasury: this.treasury.balance,
            activeTreaties: this.treaties.filter(t => t.status === 'accepted').map(t => ({
                id: t.id, terms: t.terms, proposerFaction: t.proposerFaction, targetFaction: t.targetFaction
            })),
            activeBounties: this.getActiveBounties().map(b => ({
                id: b.id, target: b.target, reward: `${b.rewardCount} ${b.rewardItem}`
            })),
            pendingPunishments: this.punishments.filter(p => p.status === 'pending').map(p => ({
                id: p.id, defendant: p.defendant, punishment: p.punishment
            })),
            recentEvents: this.eventLog.slice(-20)
        };
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
        this._emitEvent(event);

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
            trades: this.trades,
            treaties: this.treaties,
            bounties: this.bounties,
            treasury: this.treasury,
            taxLedger: this.taxLedger,
            punishments: this.punishments,
            eventLog: this.eventLog,
            nextLawId: this.nextLawId,
            nextElectionId: this.nextElectionId,
            nextCaseId: this.nextCaseId,
            nextAmendmentId: this.nextAmendmentId,
            nextTradeId: this.nextTradeId,
            nextTreatyId: this.nextTreatyId,
            nextBountyId: this.nextBountyId,
            nextPunishmentId: this.nextPunishmentId
        };

        try {
            const filename = join(this.logDir, 'governance_state.json');
            writeFileSync(filename, JSON.stringify(state, null, 2));
        } catch (e) {
            console.warn('Could not save governance state:', e.message);
        }
    }

    // Load state from previous session
    loadState() {
        try {
            const filename = join(this.logDir, 'governance_state.json');
            if (!existsSync(filename)) return false;

            const state = JSON.parse(readFileSync(filename, 'utf8'));
            this.constitution = state.constitution || this.constitution;
            this.laws = state.laws || [];
            this.amendments = state.amendments || [];
            this.elections = state.elections || [];
            this.cases = state.cases || [];
            this.trades = state.trades || [];
            this.treaties = state.treaties || [];
            this.bounties = state.bounties || [];
            this.treasury = state.treasury || this.treasury;
            this.taxLedger = state.taxLedger || {};
            this.punishments = state.punishments || [];
            this.eventLog = state.eventLog || [];
            this.nextLawId = state.nextLawId || 1;
            this.nextElectionId = state.nextElectionId || 1;
            this.nextCaseId = state.nextCaseId || 1;
            this.nextAmendmentId = state.nextAmendmentId || 1;
            this.nextTradeId = state.nextTradeId || 1;
            this.nextTreatyId = state.nextTreatyId || 1;
            this.nextBountyId = state.nextBountyId || 1;
            this.nextPunishmentId = state.nextPunishmentId || 1;

            console.log('[GOV] Loaded governance state from previous session.');
            return true;
        } catch (e) {
            console.warn('Could not load governance state:', e.message);
            return false;
        }
    }
}

// Singleton instance
let instance = null;

export function getGovernanceManager() {
    if (!instance) {
        instance = new GovernanceManager();
        // Auto-load state if load_memory is enabled
        if (settings.load_memory) {
            instance.loadState();
        }
        // Start the governance tick
        instance.startTick();
    }
    return instance;
}

export { CONSTITUTIONAL_MEMBERS, ANARCHY_MEMBERS, GOV_PARAMS };

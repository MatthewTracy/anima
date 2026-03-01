/**
 * Governance Commands - Actions available to Constitutional faction agents
 * for democratic governance: elections, laws, judiciary, treasury, amendments.
 *
 * These commands are registered globally but enforce faction membership
 * in their perform functions. Anarchy agents who try to use them will
 * get a rejection message.
 */

import { getGovernanceManager } from '../../governance/governance_manager.js';

export const governanceActionsList = [
    // ==================== ELECTIONS ====================
    {
        name: '!callElection',
        description: 'Call an election for a government office. Constitutional faction only.',
        params: {
            'office': { type: 'string', description: 'The office to hold an election for: "president" or "judge"' }
        },
        perform: async function(agent, office) {
            const gov = getGovernanceManager();
            const result = gov.callElection(agent.name, office);
            if (result.success) {
                agent.openChat(`[GOV] ${result.message}`);
            }
            return result.message;
        }
    },
    {
        name: '!nominateSelf',
        description: 'Nominate yourself as a candidate in an active election. Constitutional faction only.',
        params: {
            'office': { type: 'string', description: 'The office to run for: "president" or "judge"' }
        },
        perform: async function(agent, office) {
            const gov = getGovernanceManager();
            const result = gov.nominateSelf(agent.name, office);
            if (result.success) {
                agent.openChat(`[GOV] ${result.message}`);
            }
            return result.message;
        }
    },
    {
        name: '!castVote',
        description: 'Vote for a candidate in an active election. Constitutional faction only.',
        params: {
            'election_id': { type: 'int', description: 'The election ID number.' },
            'candidate_name': { type: 'string', description: 'The name of the candidate to vote for.' }
        },
        perform: async function(agent, electionId, candidateName) {
            const gov = getGovernanceManager();
            const result = gov.castVote(agent.name, electionId, candidateName);
            if (result.success) {
                agent.openChat(`[GOV] ${result.message}`);
            }
            return result.message;
        }
    },
    {
        name: '!campaignSpeech',
        description: 'Deliver a campaign speech to all faction members. Constitutional faction only.',
        params: {
            'speech': { type: 'string', description: 'Your campaign speech text.' }
        },
        perform: async function(agent, speech) {
            const gov = getGovernanceManager();
            if (!gov.isConstitutionalMember(agent.name)) {
                return `${agent.name} is not a Constitutional faction member.`;
            }
            agent.openChat(`[CAMPAIGN] ${agent.name}: ${speech}`);
            gov.logEvent('campaign_speech', { speaker: agent.name, speech });
            return `Campaign speech delivered.`;
        }
    },

    // ==================== LAWS ====================
    {
        name: '!proposeLaw',
        description: 'Propose a new law for the faction to vote on. Constitutional faction only.',
        params: {
            'law_text': { type: 'string', description: 'The text of the law to propose.' }
        },
        perform: async function(agent, lawText) {
            const gov = getGovernanceManager();
            const result = gov.proposeLaw(agent.name, lawText);
            if (result.success) {
                agent.openChat(`[GOV] ${result.message}`);
            }
            return result.message;
        }
    },
    {
        name: '!voteOnLaw',
        description: 'Vote yes or no on a pending law proposal. Constitutional faction only.',
        params: {
            'law_id': { type: 'int', description: 'The law ID number.' },
            'vote': { type: 'string', description: 'Your vote: "yes" or "no".' }
        },
        perform: async function(agent, lawId, vote) {
            const gov = getGovernanceManager();
            const result = gov.voteOnLaw(agent.name, lawId, vote);
            if (result.success) {
                agent.openChat(`[GOV] ${result.message}`);
            }
            return result.message;
        }
    },

    // ==================== JUDICIARY ====================
    {
        name: '!fileLawsuit',
        description: 'File a lawsuit against a faction member for breaking a law. Constitutional faction only.',
        params: {
            'defendant': { type: 'string', description: 'The name of the faction member to sue.' },
            'law_violated': { type: 'string', description: 'Which law was violated.' },
            'evidence': { type: 'string', description: 'Evidence supporting the accusation.' }
        },
        perform: async function(agent, defendant, lawViolated, evidence) {
            const gov = getGovernanceManager();
            const result = gov.fileLawsuit(agent.name, defendant, lawViolated, evidence);
            if (result.success) {
                agent.openChat(`[COURT] ${result.message}`);
            }
            return result.message;
        }
    },
    {
        name: '!renderVerdict',
        description: 'As judge, render a verdict on a pending case. Judge only.',
        params: {
            'case_id': { type: 'int', description: 'The case ID number.' },
            'verdict': { type: 'string', description: 'Your verdict: "guilty" or "not guilty".' },
            'punishment': { type: 'string', description: 'The punishment if guilty (e.g., "pay 5 iron_ingot to treasury", "exile for 2 minutes").' }
        },
        perform: async function(agent, caseId, verdict, punishment) {
            const gov = getGovernanceManager();
            const result = gov.renderVerdict(agent.name, caseId, verdict, punishment);
            if (result.success) {
                agent.openChat(`[COURT] ${result.message}`);
            }
            return result.message;
        }
    },

    // ==================== TREASURY ====================
    {
        name: '!payTax',
        description: 'Record a tax payment to the faction treasury. Put items in the treasury chest first. Constitutional faction only.',
        params: {
            'item_name': { type: 'string', description: 'The item being paid as tax.' },
            'amount': { type: 'int', description: 'The number of items paid.', domain: [1, Number.MAX_SAFE_INTEGER] }
        },
        perform: async function(agent, itemName, amount) {
            const gov = getGovernanceManager();
            const result = gov.recordTaxPayment(agent.name, itemName, amount);
            if (result.success) {
                agent.openChat(`[TREASURY] ${result.message}`);
            }
            return result.message;
        }
    },

    // ==================== AMENDMENTS ====================
    {
        name: '!proposeAmendment',
        description: 'Propose a constitutional amendment. Requires 80% supermajority. Constitutional faction only.',
        params: {
            'amendment_text': { type: 'string', description: 'The text of the constitutional amendment.' }
        },
        perform: async function(agent, amendmentText) {
            const gov = getGovernanceManager();
            const result = gov.proposeAmendment(agent.name, amendmentText);
            if (result.success) {
                agent.openChat(`[GOV] ${result.message}`);
            }
            return result.message;
        }
    },
    {
        name: '!voteOnAmendment',
        description: 'Vote on a pending constitutional amendment. Constitutional faction only.',
        params: {
            'amendment_id': { type: 'int', description: 'The amendment ID number.' },
            'vote': { type: 'string', description: 'Your vote: "yes" or "no".' }
        },
        perform: async function(agent, amendmentId, vote) {
            const gov = getGovernanceManager();
            const result = gov.voteOnAmendment(agent.name, amendmentId, vote);
            if (result.success) {
                agent.openChat(`[GOV] ${result.message}`);
            }
            return result.message;
        }
    },

    // ==================== IMPEACHMENT ====================
    {
        name: '!impeach',
        description: 'Initiate impeachment proceedings against an elected official. Constitutional faction only.',
        params: {
            'official_name': { type: 'string', description: 'The name of the official to impeach.' },
            'reason': { type: 'string', description: 'The reason for impeachment.' }
        },
        perform: async function(agent, officialName, reason) {
            const gov = getGovernanceManager();
            const result = gov.initiateImpeachment(agent.name, officialName, reason);
            if (result.success) {
                agent.openChat(`[GOV] ${result.message}`);
            }
            return result.message;
        }
    },
];

export const governanceQueryList = [
    {
        name: '!viewConstitution',
        description: 'View the current constitution, offices, rights, and active laws. Constitutional faction only.',
        params: {},
        perform: async function(agent) {
            const gov = getGovernanceManager();
            if (!gov.isConstitutionalMember(agent.name)) {
                return `${agent.name} is not a Constitutional faction member.`;
            }
            return gov.getConstitution();
        }
    },
    {
        name: '!viewPending',
        description: 'View all pending elections, laws, and court cases. Constitutional faction only.',
        params: {},
        perform: async function(agent) {
            const gov = getGovernanceManager();
            if (!gov.isConstitutionalMember(agent.name)) {
                return `${agent.name} is not a Constitutional faction member.`;
            }
            return gov.getPendingBusiness();
        }
    },
    {
        name: '!viewTreasury',
        description: 'View the faction treasury balance. Constitutional faction only.',
        params: {},
        perform: async function(agent) {
            const gov = getGovernanceManager();
            if (!gov.isConstitutionalMember(agent.name)) {
                return `${agent.name} is not a Constitutional faction member.`;
            }
            return `Treasury: ${gov.getTreasuryStatus()}`;
        }
    },
];

/**
 * Governance Commands - Actions available to Constitutional faction agents
 * for democratic governance: elections, laws, judiciary, treasury, amendments,
 * trading, diplomacy, veto, and punishment enforcement.
 *
 * These commands are registered globally but enforce faction membership
 * in their perform functions. Anarchy agents who try to use them will
 * get a rejection message.
 */

import { getGovernanceManager } from '../../governance/governance_manager.js';
import { getGameLogger } from '../../governance/game_logger.js';
import { getNarrativeLogger } from '../../governance/narrative_logger.js';

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
                agent.factionChat(`[GOV] ${result.message}`);
                getNarrativeLogger().logElectionCalled(agent.name, office);
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
                agent.factionChat(`[GOV] ${result.message}`);
                getNarrativeLogger().logNomination(agent.name, office);
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
                agent.factionChat(`[GOV] ${result.message}`);
                if (result.winner) {
                    getNarrativeLogger().logElectionResult(
                        gov.elections.find(e => e.id === electionId)?.office || 'unknown',
                        result.winner,
                        result.tally
                    );
                }
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
            agent.factionChat(`[CAMPAIGN] ${agent.name}: ${speech}`);
            gov.logEvent('campaign_speech', { speaker: agent.name, speech });
            getNarrativeLogger().logCampaignSpeech(agent.name, speech);
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
                agent.factionChat(`[GOV] ${result.message}`);
                getNarrativeLogger().logLawProposed(agent.name, result.law.id, lawText);
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
                agent.factionChat(`[GOV] ${result.message}`);
                const law = gov.laws.find(l => l.id === lawId);
                if (law && law.status === 'enacted') {
                    const yes = Object.values(law.votes).filter(v => v === 'yes').length;
                    const no = Object.values(law.votes).filter(v => v === 'no').length;
                    getNarrativeLogger().logLawEnacted(lawId, law.text, yes, no);
                } else if (law && law.status === 'rejected') {
                    const yes = Object.values(law.votes).filter(v => v === 'yes').length;
                    const no = Object.values(law.votes).filter(v => v === 'no').length;
                    getNarrativeLogger().logLawRejected(lawId, law.text, yes, no);
                } else if (law && law.status === 'vetoed') {
                    getNarrativeLogger().logLawVetoed(lawId, law.text);
                }
            }
            return result.message;
        }
    },

    // ==================== VETO ====================
    {
        name: '!vetoLaw',
        description: 'As president, veto a recently enacted law. Can be overridden by 2/3 supermajority. President only.',
        params: {
            'law_id': { type: 'int', description: 'The law ID number to veto.' }
        },
        perform: async function(agent, lawId) {
            const gov = getGovernanceManager();
            const result = gov.vetoLaw(agent.name, lawId);
            if (result.success) {
                agent.factionChat(`[GOV] ${result.message}`);
                getNarrativeLogger().logLawVetoed(lawId, gov.laws.find(l => l.id === lawId)?.text || '');
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
                agent.factionChat(`[COURT] ${result.message}`);
                getNarrativeLogger().logLawsuitFiled(agent.name, defendant, lawViolated);
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
                agent.factionChat(`[COURT] ${result.message}`);
                const caseObj = gov.cases.find(c => c.id === caseId);
                getNarrativeLogger().logVerdict(agent.name, caseObj?.defendant, verdict, punishment);
            }
            return result.message;
        }
    },

    // ==================== PUNISHMENT ENFORCEMENT ====================
    {
        name: '!completePunishment',
        description: 'Acknowledge that you have completed a court-ordered punishment. Defendant only.',
        params: {
            'punishment_id': { type: 'int', description: 'The punishment ID number.' }
        },
        perform: async function(agent, punishmentId) {
            const gov = getGovernanceManager();
            const result = gov.completePunishment(agent.name, punishmentId);
            if (result.success) {
                agent.factionChat(`[COURT] ${result.message}`);
            }
            return result.message;
        }
    },
    {
        name: '!reportNoncompliance',
        description: 'Report that a defendant has not complied with their punishment. Constitutional faction only.',
        params: {
            'punishment_id': { type: 'int', description: 'The punishment ID number.' }
        },
        perform: async function(agent, punishmentId) {
            const gov = getGovernanceManager();
            const result = gov.reportNoncompliance(agent.name, punishmentId);
            if (result.success) {
                agent.factionChat(`[COURT] ${result.message}`);
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
                agent.factionChat(`[TREASURY] ${result.message}`);
                getNarrativeLogger().logTaxPaid(agent.name, itemName, amount);
            }
            return result.message;
        }
    },
    {
        name: '!distributeTreasury',
        description: 'As president, distribute items from the faction treasury to a member. President only.',
        params: {
            'recipient': { type: 'string', description: 'The faction member to receive items.' },
            'item_name': { type: 'string', description: 'The item to distribute.' },
            'amount': { type: 'int', description: 'The number of items to distribute.', domain: [1, Number.MAX_SAFE_INTEGER] }
        },
        perform: async function(agent, recipient, itemName, amount) {
            const gov = getGovernanceManager();
            const result = gov.distributeTreasury(agent.name, recipient, itemName, amount);
            if (result.success) {
                agent.factionChat(`[TREASURY] ${result.message}`);
            }
            return result.message;
        }
    },

    // ==================== TRADING ====================
    {
        name: '!offerTrade',
        description: 'Offer a trade to another player. Both factions can trade.',
        params: {
            'target': { type: 'string', description: 'The player to trade with.' },
            'give_item': { type: 'string', description: 'The item you are offering.' },
            'give_count': { type: 'int', description: 'How many items you are offering.', domain: [1, Number.MAX_SAFE_INTEGER] },
            'want_item': { type: 'string', description: 'The item you want in return.' },
            'want_count': { type: 'int', description: 'How many items you want in return.', domain: [1, Number.MAX_SAFE_INTEGER] }
        },
        perform: async function(agent, target, giveItem, giveCount, wantItem, wantCount) {
            const gov = getGovernanceManager();
            const result = gov.offerTrade(agent.name, target, giveItem, giveCount, wantItem, wantCount);
            if (result.success) {
                agent.openChat(`[TRADE] ${result.message}`);
                getNarrativeLogger().logTrade(agent.name, target, giveItem, giveCount, wantItem, wantCount);
            }
            return result.message;
        }
    },
    {
        name: '!acceptTrade',
        description: 'Accept a pending trade offer.',
        params: {
            'trade_id': { type: 'int', description: 'The trade ID number.' }
        },
        perform: async function(agent, tradeId) {
            const gov = getGovernanceManager();
            const result = gov.acceptTrade(agent.name, tradeId);
            if (result.success) {
                agent.openChat(`[TRADE] ${result.message}`);
            }
            return result.message;
        }
    },
    {
        name: '!rejectTrade',
        description: 'Reject a pending trade offer.',
        params: {
            'trade_id': { type: 'int', description: 'The trade ID number.' }
        },
        perform: async function(agent, tradeId) {
            const gov = getGovernanceManager();
            const result = gov.rejectTrade(agent.name, tradeId);
            if (result.success) {
                agent.openChat(`[TRADE] ${result.message}`);
            }
            return result.message;
        }
    },

    // ==================== DIPLOMACY ====================
    {
        name: '!proposeTreaty',
        description: 'Propose a treaty with the other faction.',
        params: {
            'target_faction': { type: 'string', description: 'The faction to propose a treaty to: "constitutional" or "anarchy".' },
            'terms': { type: 'string', description: 'The terms of the treaty.' }
        },
        perform: async function(agent, targetFaction, terms) {
            const gov = getGovernanceManager();
            const result = gov.proposeTreaty(agent.name, targetFaction, terms);
            if (result.success) {
                agent.openChat(`[DIPLOMACY] ${result.message}`);
                getNarrativeLogger().logTreatyProposed(agent.name, targetFaction, terms);
            }
            return result.message;
        }
    },
    {
        name: '!acceptTreaty',
        description: 'Accept a proposed treaty from the other faction.',
        params: {
            'treaty_id': { type: 'int', description: 'The treaty ID number.' }
        },
        perform: async function(agent, treatyId) {
            const gov = getGovernanceManager();
            const result = gov.acceptTreaty(agent.name, treatyId);
            if (result.success) {
                agent.openChat(`[DIPLOMACY] ${result.message}`);
                getNarrativeLogger().logTreatyAccepted(treatyId, agent.name);
            }
            return result.message;
        }
    },
    {
        name: '!rejectTreaty',
        description: 'Reject a proposed treaty.',
        params: {
            'treaty_id': { type: 'int', description: 'The treaty ID number.' }
        },
        perform: async function(agent, treatyId) {
            const gov = getGovernanceManager();
            const result = gov.rejectTreaty(agent.name, treatyId);
            if (result.success) {
                agent.openChat(`[DIPLOMACY] ${result.message}`);
            }
            return result.message;
        }
    },
    {
        name: '!declareWar',
        description: 'Declare war on the other faction. Voids all treaties.',
        params: {
            'target_faction': { type: 'string', description: 'The faction to declare war on: "constitutional" or "anarchy".' }
        },
        perform: async function(agent, targetFaction) {
            const gov = getGovernanceManager();
            const result = gov.declareWar(agent.name, targetFaction);
            if (result.success) {
                agent.openChat(`[WAR] ${result.message}`);
                getNarrativeLogger().logWarDeclared(agent.name, targetFaction);
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
                agent.factionChat(`[GOV] ${result.message}`);
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
                agent.factionChat(`[GOV] ${result.message}`);
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
                agent.factionChat(`[GOV] ${result.message}`);
                let office = 'unknown';
                for (const [o, data] of Object.entries(gov.constitution.offices)) {
                    if (data.holder === officialName) { office = o; break; }
                }
                getNarrativeLogger().logImpeachment(agent.name, officialName, office, reason);
            }
            return result.message;
        }
    },

    // ==================== FACTION COMMUNICATION ====================
    {
        name: '!factionChat',
        description: 'Send a private message to only your faction members. Both factions.',
        params: {
            'message': { type: 'string', description: 'The message to send to your faction.' }
        },
        perform: async function(agent, message) {
            agent.factionChat(`[FACTION] ${agent.name}: ${message}`);
            return `Faction message sent.`;
        }
    },
    {
        name: '!whisperTo',
        description: 'Send a private message to a specific player.',
        params: {
            'target': { type: 'string', description: 'The player to whisper to.' },
            'message': { type: 'string', description: 'The private message.' }
        },
        perform: async function(agent, target, message) {
            agent.whisperTo(target, `[WHISPER] ${agent.name}: ${message}`);
            return `Whispered to ${target}.`;
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
        description: 'View all pending elections, laws, court cases, trades, and punishments. Constitutional faction only.',
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
    {
        name: '!viewTaxStatus',
        description: 'View your outstanding tax obligations. Constitutional faction only.',
        params: {},
        perform: async function(agent) {
            const gov = getGovernanceManager();
            if (!gov.isConstitutionalMember(agent.name)) {
                return `${agent.name} is not a Constitutional faction member.`;
            }
            return gov.getTaxStatus(agent.name);
        }
    },
    {
        name: '!viewBounties',
        description: 'View all active bounties.',
        params: {},
        perform: async function(agent) {
            const gov = getGovernanceManager();
            const bounties = gov.getActiveBounties();
            if (bounties.length === 0) return 'No active bounties.';
            return bounties.map(b => `Bounty #${b.id}: Kill ${b.target} for ${b.rewardCount} ${b.rewardItem} (posted by ${b.placedBy})`).join('\n');
        }
    },
    {
        name: '!viewTreaties',
        description: 'View all active treaties between factions.',
        params: {},
        perform: async function(agent) {
            const gov = getGovernanceManager();
            const treaties = gov.treaties.filter(t => t.status === 'accepted');
            if (treaties.length === 0) return 'No active treaties.';
            return treaties.map(t => `Treaty #${t.id}: "${t.terms}" (${t.proposerFaction} <-> ${t.targetFaction})`).join('\n');
        }
    },
    {
        name: '!gameStatus',
        description: 'View the current game score comparing Constitutional vs Anarchy factions.',
        params: {},
        perform: async function(agent) {
            const logger = getGameLogger();
            return logger.getSummary();
        }
    },
];

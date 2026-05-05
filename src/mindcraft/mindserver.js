import { Server } from 'socket.io';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import * as mindcraft from './mindcraft.js';
import { readFileSync } from 'fs';
import { getGovernanceManager } from '../governance/governance_manager.js';
import { getGameLogger } from '../governance/game_logger.js';
import { getBudgetGuard } from '../governance/budget_guard.js';
import { getNarrativeLogger } from '../governance/narrative_logger.js';
import { getGameClock } from '../governance/game_clock.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Mindserver is:
// - central hub for communication between all agent processes
// - api to control from other languages and remote users 
// - host for webapp

let io;
let server;
const agent_connections = {};
const agent_listeners = [];

const settings_spec = JSON.parse(readFileSync(path.join(__dirname, 'public/settings_spec.json'), 'utf8'));

class AgentConnection {
    constructor(settings, viewer_port) {
        this.socket = null;
        this.settings = settings;
        this.in_game = false;
        this.full_state = null;
        this.viewer_port = viewer_port;
    }
    setSettings(settings) {
        this.settings = settings;
    }
}

export function registerAgent(settings, viewer_port) {
    let agentConnection = new AgentConnection(settings, viewer_port);
    agent_connections[settings.profile.name] = agentConnection;
}

export function logoutAgent(agentName) {
    if (agent_connections[agentName]) {
        agent_connections[agentName].in_game = false;
        agentsStatusUpdate();
    }
}

// Initialize the server
export function createMindServer(host_public = false, port = 8080) {
    const app = express();
    server = http.createServer(app);
    io = new Server(server);

    // Serve static files
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    app.use(express.static(path.join(__dirname, 'public')));

    // N4: HTTP endpoints for OBS browser-source overlays
    app.get('/governance/scores', async (req, res) => {
        try {
            const m = await import('../governance/game_logger.js');
            res.json(m.getGameLogger().calculateScores());
        } catch (e) { res.status(500).json({ error: e.message }); }
    });
    app.get('/governance/state', async (req, res) => {
        try {
            const m = await import('../governance/governance_manager.js');
            res.json(m.getGovernanceManager().getSerializableState());
        } catch (e) { res.status(500).json({ error: e.message }); }
    });
    app.get('/governance/clock', async (req, res) => {
        try {
            const m = await import('../governance/game_clock.js');
            res.json(m.getGameClock().getStatus());
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // Socket.io connection handling
    io.on('connection', (socket) => {
        let curAgentName = null;
        console.log('Client connected');

        agentsStatusUpdate(socket);

        socket.on('create-agent', async (settings, callback) => {
            console.log('API create agent...');
            for (let key in settings_spec) {
                if (!(key in settings)) {
                    if (settings_spec[key].required) {
                        callback({ success: false, error: `Setting ${key} is required` });
                        return;
                    }
                    else {
                        settings[key] = settings_spec[key].default;
                    }
                }
            }
            for (let key in settings) {
                if (!(key in settings_spec)) {
                    delete settings[key];
                }
            }
            if (settings.profile?.name) {
                if (settings.profile.name in agent_connections) {
                    callback({ success: false, error: 'Agent already exists' });
                    return;
                }
                let returned = await mindcraft.createAgent(settings);
                callback({ success: returned.success, error: returned.error });
                let name = settings.profile.name;
                if (!returned.success && agent_connections[name]) {
                    mindcraft.destroyAgent(name);
                    delete agent_connections[name];
                }
                agentsStatusUpdate();
            }
            else {
                console.error('Agent name is required in profile');
                callback({ success: false, error: 'Agent name is required in profile' });
            }
        });

        socket.on('get-settings', (agentName, callback) => {
            if (agent_connections[agentName]) {
                callback({ settings: agent_connections[agentName].settings });
            } else {
                callback({ error: `Agent '${agentName}' not found.` });
            }
        });

        socket.on('connect-agent-process', (agentName) => {
            if (agent_connections[agentName]) {
                agent_connections[agentName].socket = socket;
                agentsStatusUpdate();
            }
        });

        socket.on('login-agent', (agentName) => {
            if (agent_connections[agentName]) {
                agent_connections[agentName].socket = socket;
                agent_connections[agentName].in_game = true;
                curAgentName = agentName;
                agentsStatusUpdate();
            }
            else {
                console.warn(`Unregistered agent ${agentName} tried to login`);
            }
        });

        socket.on('disconnect', () => {
            if (agent_connections[curAgentName]) {
                console.log(`Agent ${curAgentName} disconnected`);
                agent_connections[curAgentName].in_game = false;
                agent_connections[curAgentName].socket = null;
                agentsStatusUpdate();
            }
            if (agent_listeners.includes(socket)) {
                removeListener(socket);
            }
        });

        socket.on('chat-message', (agentName, json) => {
            if (!agent_connections[agentName]) {
                console.warn(`Agent ${agentName} tried to send a message but is not logged in`);
                return;
            }
            console.log(`${curAgentName} sending message to ${agentName}: ${json.message}`);
            agent_connections[agentName].socket.emit('chat-message', curAgentName, json);
        });

        socket.on('set-agent-settings', (agentName, settings) => {
            const agent = agent_connections[agentName];
            if (agent) {
                agent.setSettings(settings);
                agent.socket.emit('restart-agent');
            }
        });

        socket.on('restart-agent', (agentName) => {
            console.log(`Restarting agent: ${agentName}`);
            agent_connections[agentName].socket.emit('restart-agent');
        });

        socket.on('stop-agent', (agentName) => {
            mindcraft.stopAgent(agentName);
        });

        socket.on('start-agent', (agentName) => {
            mindcraft.startAgent(agentName);
        });

        socket.on('destroy-agent', (agentName) => {
            if (agent_connections[agentName]) {
                mindcraft.destroyAgent(agentName);
                delete agent_connections[agentName];
            }
            agentsStatusUpdate();
        });

        socket.on('stop-all-agents', () => {
            console.log('Killing all agents');
            for (let agentName in agent_connections) {
                mindcraft.stopAgent(agentName);
            }
        });

        socket.on('shutdown', () => {
            console.log('Shutting down');
            for (let agentName in agent_connections) {
                mindcraft.stopAgent(agentName);
            }
            // wait 2 seconds
            setTimeout(() => {
                console.log('Exiting MindServer');
                process.exit(0);
            }, 2000);
            
        });

		socket.on('send-message', (agentName, data) => {
			if (!agent_connections[agentName]) {
				console.warn(`Agent ${agentName} not in game, cannot send message via MindServer.`);
				return
			}
			try {
				agent_connections[agentName].socket.emit('send-message', data)
			} catch (error) {
				console.error('Error: ', error);
			}
		});

        socket.on('bot-output', (agentName, message) => {
            io.emit('bot-output', agentName, message);
        });

        socket.on('listen-to-agents', () => {
            addListener(socket);
        });

        // G1: agents forward log events to mindserver's GameLogger so we have
        // ONE consolidated game log instead of one per child process.
        socket.on('agent-log-event', (eventType, data) => {
            try {
                const logger = getGameLogger();
                if (!logger) return;
                if (typeof logger[eventType] === 'function') {
                    // Convenience methods like logCombatKill, logCombatDeath, etc.
                    logger[eventType](...(data?.args || []));
                } else {
                    // Generic logEvent fallthrough
                    logger.logEvent(eventType, data || {});
                }
            } catch (e) {
                console.warn('[mindserver] agent-log-event error:', e.message);
            }
        });

        // G1.5: agents forward governance method calls to mindserver's
        // GovernanceManager so all agents share one canonical state.
        socket.on('agent-gov-action', (method, args, ack) => {
            try {
                const gov = getGovernanceManager();
                if (typeof gov[method] !== 'function') {
                    return ack?.({ success: false, message: `Unknown governance method: ${method}` });
                }
                const result = gov[method](...(args || []));
                ack?.(result);
                // Re-broadcast updated state so all agents (and dashboard) see it
                io.emit('governance-state', gov.getSerializableState());
            } catch (e) {
                console.warn('[mindserver] agent-gov-action error:', e.message);
                ack?.({ success: false, message: e.message });
            }
        });

        // G3: agents record LLM token usage against mindserver's budget so
        // the cap is enforced across all 6 child processes, not per-process.
        socket.on('agent-budget-record', (model, inputTokens, outputTokens, ack) => {
            try {
                const result = getBudgetGuard().recordUsage(model, inputTokens || 0, outputTokens || 0);
                ack?.(result);
            } catch (e) {
                ack?.({ allowed: true, message: e.message });
            }
        });
        socket.on('agent-budget-status', (ack) => {
            try {
                ack?.(getBudgetGuard().getStatus());
            } catch (e) {
                ack?.({ percentUsed: 0, sessionCost: 0, sessionCap: 0 });
            }
        });

        // G1.5: read-only governance queries from agents (sync via ack)
        socket.on('agent-gov-query', (method, args, ack) => {
            try {
                const gov = getGovernanceManager();
                if (typeof gov[method] !== 'function') {
                    return ack?.({ result: null, error: `Unknown method: ${method}` });
                }
                const result = gov[method](...(args || []));
                ack?.({ result });
            } catch (e) {
                ack?.({ result: null, error: e.message });
            }
        });
    });

    // Stream governance events and narrative entries to UI
    try {
        const gov = getGovernanceManager();
        gov.onEvent((event) => {
            io.emit('governance-event', event);
        });

        const narrative = getNarrativeLogger();
        narrative.onEntry((entry) => {
            io.emit('narrative-entry', entry);
        });

        // P3: rolling time-series of faction stats for live charts
        const timeseries = { points: [] };  // { t, c_res, a_res, c_kills, a_kills, c_gini, a_gini }

        // Periodically send governance state, game clock, and time-series to UI
        setInterval(async () => {
            try {
                const govState = getGovernanceManager().getSerializableState();
                io.emit('governance-state', govState);

                const clock = getGameClock();
                if (clock.isRunning) {
                    io.emit('game-clock', clock.getStatus());
                }

                // P3: append a sample to the rolling window (max 60 points = 5 min @ 5s)
                try {
                    const m = await import('../governance/game_logger.js');
                    const scores = m.getGameLogger().calculateScores();
                    const point = {
                        t: clock?.isRunning ? parseFloat(clock.getElapsedMinutes().toFixed(2)) : 0,
                        c_res: scores.constitutional?.totalResources || 0,
                        a_res: scores.anarchy?.totalResources || 0,
                        c_kills: scores.constitutional?.kills || 0,
                        a_kills: scores.anarchy?.kills || 0,
                        c_gini: scores.constitutional?.giniCoefficient || 0,
                        a_gini: scores.anarchy?.giniCoefficient || 0
                    };
                    timeseries.points.push(point);
                    if (timeseries.points.length > 120) timeseries.points.shift(); // keep last 10 min
                    io.emit('timeseries', timeseries);
                } catch (e) { /* ignore */ }
            } catch (e) { /* ignore */ }
        }, 5000);
    } catch (e) {
        console.warn('Could not set up governance streaming:', e.message);
    }

    let host = host_public ? '0.0.0.0' : 'localhost';
    server.listen(port, host, () => {
        console.log(`MindServer running on port ${port}`);
    });

    return server;
}

function agentsStatusUpdate(socket) {
    if (!socket) {
        socket = io;
    }
    let agents = [];
    for (let agentName in agent_connections) {
        const conn = agent_connections[agentName];
        agents.push({
            name: agentName, 
            in_game: conn.in_game,
            viewerPort: conn.viewer_port,
            socket_connected: !!conn.socket
        });
    };
    socket.emit('agents-status', agents);
}


let listenerInterval = null;
function addListener(listener_socket) {
    agent_listeners.push(listener_socket);
    if (agent_listeners.length === 1) {
        listenerInterval = setInterval(async () => {
            const states = {};
            for (let agentName in agent_connections) {
                let agent = agent_connections[agentName];
                if (agent.in_game) {
                    try {
                        const state = await new Promise((resolve) => {
                            agent.socket.emit('get-full-state', (s) => resolve(s));
                        });
                        states[agentName] = state;
                    } catch (e) {
                        states[agentName] = { error: String(e) };
                    }
                }
            }
            for (let listener of agent_listeners) {
                listener.emit('state-update', states);
            }
        }, 1000);
    }
}

function removeListener(listener_socket) {
    agent_listeners.splice(agent_listeners.indexOf(listener_socket), 1);
    if (agent_listeners.length === 0) {
        clearInterval(listenerInterval);
        listenerInterval = null;
    }
}

// Optional: export these if you need access to them from other files
export const getIO = () => io;
export const getServer = () => server;
export const numStateListeners = () => agent_listeners.length;
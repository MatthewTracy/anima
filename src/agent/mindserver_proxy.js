import { io } from 'socket.io-client';
import convoManager from './conversation.js';
import { setSettings } from './settings.js';
import { getFullState } from './library/full_state.js';

// agent's individual connection to the mindserver
// always connect to localhost

class MindServerProxy {
    constructor() {
        if (MindServerProxy.instance) {
            return MindServerProxy.instance;
        }
        
        this.socket = null;
        this.connected = false;
        this.agents = [];
        MindServerProxy.instance = this;
    }

    async connect(name, port) {
        if (this.connected) return;
        
        this.name = name;
        this.socket = io(`http://localhost:${port}`);

        await new Promise((resolve, reject) => {
            this.socket.on('connect', resolve);
            this.socket.on('connect_error', (err) => {
                console.error('Connection failed:', err);
                reject(err);
            });
        });

        this.connected = true;
        console.log(name, 'connected to MindServer');

        this.socket.on('disconnect', () => {
            console.log('Disconnected from MindServer');
            this.connected = false;
            if (this.agent) {
                this.agent.cleanKill('Disconnected from MindServer. Killing agent process.');
            }
        });

        this.socket.on('chat-message', (agentName, json) => {
            convoManager.receiveFromBot(agentName, json);
        });

        this.socket.on('agents-status', (agents) => {
            this.agents = agents;
            convoManager.updateAgents(agents);
            if (this.agent?.task) {
                console.log(this.agent.name, 'updating available agents');
                this.agent.task.updateAvailableAgents(agents);
            }
        });

        this.socket.on('restart-agent', (agentName) => {
            console.log(`Restarting agent: ${agentName}`);
            this.agent.cleanKill();
        });
		
        this.socket.on('send-message', (data) => {
            try {
                this.agent.respondFunc(data.from, data.message);
            } catch (error) {
                console.error('Error: ', JSON.stringify(error, Object.getOwnPropertyNames(error)));
            }
        });

        this.socket.on('get-full-state', (callback) => {
            try {
                const state = getFullState(this.agent);
                callback(state);
            } catch (error) {
                console.error('Error getting full state:', error);
                callback(null);
            }
        });

        // Request settings and wait for response
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Settings request timed out after 5 seconds'));
            }, 5000);

            this.socket.emit('get-settings', name, (response) => {
                clearTimeout(timeout);
                if (response.error) {
                    return reject(new Error(response.error));
                }
                setSettings(response.settings);
                this.socket.emit('connect-agent-process', name);
                resolve();
            });
        });
    }

    setAgent(agent) {
        this.agent = agent;
    }

    getAgents() {
        return this.agents;
    }

    getNumOtherAgents() {
        return this.agents.length - 1;
    }

    login() {
        this.socket.emit('login-agent', this.agent.name);
    }

    shutdown() {
        this.socket.emit('shutdown');
    }

    getSocket() {
        return this.socket;
    }
}

// Create and export a singleton instance
export const serverProxy = new MindServerProxy();

// for chatting with other bots
export function sendBotChatToServer(agentName, json) {
    serverProxy.getSocket().emit('chat-message', agentName, json);
}

// for sending general output to server for display
export function sendOutputToServer(agentName, message) {
    serverProxy.getSocket().emit('bot-output', agentName, message);
}

// G1: log a game event via mindserver so all agents share one log
export function logEventToMindserver(eventType, dataOrArgs) {
    try {
        const sock = serverProxy.getSocket();
        if (!sock || !sock.connected) return;
        sock.emit('agent-log-event', eventType, dataOrArgs);
    } catch (e) { /* ignore — best-effort */ }
}

// G1.5: invoke a governance method on mindserver's singleton.
// Returns a Promise resolving to the method's result. Falls back to a
// not-connected response if the socket is down.
export function callGovernanceOnMindserver(method, args) {
    return new Promise((resolve) => {
        try {
            const sock = serverProxy.getSocket();
            if (!sock || !sock.connected) {
                return resolve({ success: false, message: 'Mindserver not connected.' });
            }
            // Timeout safety: 5s
            const timer = setTimeout(() => resolve({ success: false, message: 'Governance call timed out.' }), 5000);
            sock.emit('agent-gov-action', method, args || [], (result) => {
                clearTimeout(timer);
                resolve(result || { success: false, message: 'No response.' });
            });
        } catch (e) {
            resolve({ success: false, message: e.message });
        }
    });
}

// G1.5: read-only query
export function queryGovernanceOnMindserver(method, args) {
    return new Promise((resolve) => {
        try {
            const sock = serverProxy.getSocket();
            if (!sock || !sock.connected) return resolve(null);
            const timer = setTimeout(() => resolve(null), 5000);
            sock.emit('agent-gov-query', method, args || [], (response) => {
                clearTimeout(timer);
                resolve(response?.result ?? null);
            });
        } catch (e) {
            resolve(null);
        }
    });
}

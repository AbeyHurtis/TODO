import * as http from 'http';
import { ServerResponse } from 'http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'crypto';
import { ITodoStore, registerTodoTools } from './todoTools';
import { McpLogger } from './logger';

type SessionEntry = {
    server: McpServer;
    transport: StreamableHTTPServerTransport;
    lastAccessed: number;
};

export class TodoMcpServer {
    private httpServer: http.Server | undefined;
    private httpPort: number = 0;
    /** Session ID -> { server, transport, lastAccessed } */
    private sessions = new Map<string, SessionEntry>();
    private cleanupTimer: NodeJS.Timeout | undefined;
    private readonly SESSION_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes of inactivity
    private readonly MAX_SESSIONS = 50;

    constructor(private provider: ITodoStore) {
        this.cleanupTimer = setInterval(() => this.pruneInactiveSessions(), 60 * 1000);
    }

    /** Creates a response wrapper that captures mcp-session-id and stores the session for future requests. */
    private captureSessionIdRes(res: ServerResponse, entry: SessionEntry): ServerResponse {
        const origSetHeader = res.setHeader.bind(res);
        const origWriteHead = res.writeHead.bind(res);

        res.setHeader = (name: string | string[], value: string | number | string[]): ServerResponse => {
            if (typeof name === 'string' && name.toLowerCase() === 'mcp-session-id') {
                const id = Array.isArray(value) ? value[0] : value;
                if (typeof id === 'string') {
                    entry.lastAccessed = Date.now();
                    this.sessions.set(id, entry);
                    McpLogger.log(`Captured MCP Session ID: ${id}`);
                }
            }
            return (origSetHeader as (n: string | string[], v: string | number | string[]) => ServerResponse)(name, value);
        };

        res.writeHead = (statusCode: number, ...args: unknown[]): ServerResponse => {
            const headers = args.find((a): a is Record<string, string | string[] | number | undefined> =>
                typeof a === 'object' && a !== null && !Array.isArray(a)) as Record<string, string | string[] | number | undefined> | undefined;
            const sid = headers?.['mcp-session-id'];
            if (typeof sid === 'string') {
                entry.lastAccessed = Date.now();
                this.sessions.set(sid, entry);
                McpLogger.log(`Captured MCP Session ID: ${sid}`);
            } else if (Array.isArray(sid) && sid[0]) {
                entry.lastAccessed = Date.now();
                this.sessions.set(String(sid[0]), entry);
                McpLogger.log(`Captured MCP Session ID: ${sid[0]}`);
            }
            return origWriteHead(statusCode, ...(args as [string?, Record<string, string | string[] | number | undefined>?]));
        };

        return res;
    }

    /** Creates a new MCP server + transport pair for one client session. */
    private createSession(): SessionEntry {
        if (this.sessions.size >= this.MAX_SESSIONS) {
            this.pruneInactiveSessions(true);
        }

        const server = new McpServer({
            name: 'TODO_Extension',
            version: '2.0.0',
        });
        registerTodoTools(server, this.provider);

        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
        });
        server.connect(transport);
        McpLogger.log(`Created new MCP server session.`);

        return { server, transport, lastAccessed: Date.now() };
    }

    private pruneInactiveSessions(forceOldestIfFull: boolean = false) {
        const now = Date.now();
        for (const [id, entry] of this.sessions.entries()) {
            if (now - entry.lastAccessed > this.SESSION_TIMEOUT_MS) {
                entry.server.close().catch(() => { });
                this.sessions.delete(id);
                McpLogger.log(`Pruned inactive session ${id}.`);
            }
        }

        if (forceOldestIfFull && this.sessions.size >= this.MAX_SESSIONS) {
            let oldestId: string | undefined;
            let oldestTime = Infinity;
            for (const [id, entry] of this.sessions.entries()) {
                if (entry.lastAccessed < oldestTime) {
                    oldestTime = entry.lastAccessed;
                    oldestId = id;
                }
            }
            if (oldestId) {
                const entry = this.sessions.get(oldestId);
                entry?.server.close().catch(() => { });
                this.sessions.delete(oldestId);
                McpLogger.log(`Evicted oldest session ${oldestId} due to capacity limit.`);
            }
        }
    }

    public async start(desiredPort: number = 0): Promise<string> {
        if (this.httpServer) {
            return `http://127.0.0.1:${this.httpPort}/mcp`;
        }

        return new Promise((resolve, reject) => {
            const server = http.createServer(async (req, res) => {
                if (req.url !== "/mcp") {
                    res.writeHead(404).end("Not Found");
                    return;
                }

                try {
                    const sessionId = req.headers['mcp-session-id'];
                    const existing = typeof sessionId === 'string' ? this.sessions.get(sessionId) : undefined;

                    McpLogger.log(`HTTP ${req.method} /mcp received. Session header: ${sessionId || 'none'}. Existing session: ${!!existing}`);

                    if (existing) {
                        existing.lastAccessed = Date.now();
                        await existing.transport.handleRequest(req, res);
                        return;
                    }

                    // New client: create dedicated server + transport
                    const entry = this.createSession();
                    this.captureSessionIdRes(res, entry);
                    await entry.transport.handleRequest(req, res);
                } catch (err) {
                    McpLogger.error('Request processing error in HTTP MCP server', err);
                    if (!res.headersSent) {
                        res.writeHead(500).end("Internal Server Error");
                    }
                }
            });

            server.once('error', (err) => {
                McpLogger.error('HTTP MCP Server error', err);
                reject(err);
            });

            server.listen(desiredPort, '127.0.0.1', () => {
                this.httpServer = server;
                const addr = server.address();
                if (addr && typeof addr === 'object') {
                    this.httpPort = addr.port;
                    McpLogger.log(`Server listening on http://127.0.0.1:${this.httpPort}`);
                    resolve(`http://127.0.0.1:${this.httpPort}/mcp`);
                } else {
                    reject(new Error("Unable to determine server port"));
                }
            });
        });
    }

    public async stop(): Promise<void> {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = undefined;
        }

        for (const { server } of this.sessions.values()) {
            try {
                await server.close();
            } catch (e) {
                // Ignore closing errors
            }
        }
        this.sessions.clear();

        if (this.httpServer) {
            await new Promise<void>((resolve) => {
                this.httpServer?.close(() => resolve());
                this.httpServer = undefined;
            });
            McpLogger.log('HTTP MCP Server stopped.');
        }
    }

    public getPort(): number {
        return this.httpPort;
    }

    public isRunning(): boolean {
        return !!this.httpServer;
    }
}

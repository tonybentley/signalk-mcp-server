import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { SignalKClient } from './signalk-client.js';
import type { MCPToolResponse } from './types/index.js';

export interface SignalKMCPServerOptions {
  serverName?: string;
  serverVersion?: string;
  signalkClient?: SignalKClient;
}

export class SignalKMCPServer {
  private signalkClient: SignalKClient;
  private server: Server;
  private serverName: string;
  private serverVersion: string;

  constructor(options: SignalKMCPServerOptions = {}) {
    this.serverName = options.serverName || process.env.SERVER_NAME || 'signalk-mcp-server';
    this.serverVersion = options.serverVersion || process.env.SERVER_VERSION || '1.0.0';
    
    this.signalkClient = options.signalkClient || new SignalKClient();
    this.server = new Server(
      {
        name: this.serverName,
        version: this.serverVersion,
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    this.setupToolHandlers();
    
    // Handle SignalK connection errors gracefully
    this.signalkClient.on('error', (error) => {
      console.error('SignalK connection error:', error.message || error);
      // Don't crash the server on SignalK connection errors
    });
    
    // Connect to SignalK asynchronously
    this.connectToSignalK().catch((error) => {
      console.error('SignalK connection failed during startup:', error.message || error);
    });
  }

  async connectToSignalK(): Promise<void> {
    try {
      await this.signalkClient.connect();
      console.error('SignalK client connected successfully');
    } catch (error: any) {
      console.error('Failed to connect to SignalK:', error.message || error);
      // Continue running the MCP server even if SignalK is unavailable
    }
  }

  setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'get_vessel_state',
          description: 'Get current vessel navigation data (position, heading, speed, wind)',
          inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
          },
        },
        {
          name: 'get_ais_targets',
          description: 'Get nearby AIS targets with position and course data',
          inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
          },
        },
        {
          name: 'get_active_alarms',
          description: 'Get current system notifications and alerts',
          inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
          },
        },
        {
          name: 'list_available_paths',
          description: 'Discover available SignalK data paths',
          inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
          },
        },
        {
          name: 'get_path_value',
          description: 'Get latest value for a specific SignalK path',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'SignalK data path (e.g., navigation.position)',
              },
            },
            required: ['path'],
            additionalProperties: false,
          },
        },
        {
          name: 'get_connection_status',
          description: 'Get SignalK WebSocket connection status and health',
          inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request: any): Promise<any> => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'get_vessel_state':
            return await this.getVesselState();
          case 'get_ais_targets':
            return await this.getAISTargets();
          case 'get_active_alarms':
            return await this.getActiveAlarms();
          case 'list_available_paths':
            return await this.listAvailablePaths();
          case 'get_path_value':
            return await this.getPathValue(args.path);
          case 'get_connection_status':
            return await this.getConnectionStatus();
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error: any) {
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error.message}`
        );
      }
    });
  }

  async getVesselState(): Promise<MCPToolResponse> {
    const data = this.signalkClient.getVesselState();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  async getAISTargets(): Promise<MCPToolResponse> {
    const data = this.signalkClient.getAISTargets();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  async getActiveAlarms(): Promise<MCPToolResponse> {
    const data = this.signalkClient.getActiveAlarms();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  async listAvailablePaths(): Promise<MCPToolResponse> {
    const data = await this.signalkClient.listAvailablePaths();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  async getPathValue(path: string): Promise<MCPToolResponse> {
    const data = await this.signalkClient.getPathValue(path);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  async getConnectionStatus(): Promise<MCPToolResponse> {
    const data = this.signalkClient.getConnectionStatus();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error(`${this.serverName} v${this.serverVersion} running on stdio`);
  }

  // Getters for testing
  get mcpServer(): Server {
    return this.server;
  }

  get signalkClientInstance(): SignalKClient {
    return this.signalkClient;
  }
}
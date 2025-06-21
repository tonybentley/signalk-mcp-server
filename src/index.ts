#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';
import { SignalKClient } from './signalk-client.js';
import type { MCPToolResponse, MCPServerInfo } from './types';

dotenv.config();

const SERVER_NAME = process.env.SERVER_NAME || 'signalk-mcp-server';
const SERVER_VERSION = process.env.SERVER_VERSION || '1.0.0';

class SignalKMCPServer {
  private signalkClient: SignalKClient;
  private server: any;

  constructor() {
    this.signalkClient = new SignalKClient();
    this.server = new Server(
      {
        name: SERVER_NAME,
        version: SERVER_VERSION,
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    this.setupToolHandlers();
    this.connectToSignalK();
  }

  async connectToSignalK(): Promise<void> {
    try {
      await this.signalkClient.connect();
      console.error('SignalK client connected successfully');
    } catch (error: any) {
      console.error('Failed to connect to SignalK:', error.message);
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

    this.server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
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
    console.error(`${SERVER_NAME} running on stdio`);
  }
}

const server = new SignalKMCPServer();
server.run().catch(console.error);
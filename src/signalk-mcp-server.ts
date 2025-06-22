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

/**
 * SignalK MCP Server - Provides AI agents with access to marine vessel data via Model Context Protocol
 * 
 * This server bridges SignalK marine data systems with AI agents by exposing vessel navigation,
 * AIS targets, alarms, and sensor data through standardized MCP tools. It maintains a persistent
 * connection to a SignalK server and provides real-time access to marine data.
 * 
 * Features:
 * - Real-time vessel state (position, heading, speed, wind)
 * - AIS target tracking (nearby vessels)
 * - System alarm monitoring
 * - Dynamic path discovery
 * - Connection status monitoring
 * - Graceful error handling with continued operation
 * 
 * @example
 * // Basic usage
 * const server = new SignalKMCPServer({
 *   serverName: 'my-signalk-mcp',
 *   serverVersion: '1.0.0'
 * });
 * await server.run();
 * 
 * // With custom SignalK client
 * const client = new SignalKClient({ hostname: '192.168.1.100', port: 3000 });
 * const server = new SignalKMCPServer({ signalkClient: client });
 * await server.run();
 */
export class SignalKMCPServer {
  private signalkClient: SignalKClient;
  private server: Server;
  private serverName: string;
  private serverVersion: string;

  /**
   * Creates a new SignalK MCP Server instance with configuration from options or environment variables
   * 
   * Configuration priority:
   * 1. Constructor options
   * 2. Environment variables (SERVER_NAME, SERVER_VERSION)
   * 3. Default values
   * 
   * Server capabilities:
   * - Registers 6 MCP tools for vessel data access
   * - Sets up error handling for SignalK connection failures
   * - Initiates asynchronous connection to SignalK server
   * - Continues operation even if SignalK is unavailable
   * 
   * @param options - Server configuration options
   * @param options.serverName - MCP server identifier (default: 'signalk-mcp-server')
   * @param options.serverVersion - Version string (default: '1.0.0')
   * @param options.signalkClient - Custom SignalK client instance (optional)
   * 
   * @example
   * // Default configuration
   * const server = new SignalKMCPServer();
   * 
   * // Custom configuration
   * const server = new SignalKMCPServer({
   *   serverName: 'my-boat-mcp',
   *   serverVersion: '2.1.0'
   * });
   * 
   * // With environment variables
   * // SERVER_NAME=production-signalk-mcp
   * // SERVER_VERSION=1.5.0
   * const server = new SignalKMCPServer();
   */
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

  /**
   * Establishes connection to SignalK server with graceful error handling
   * 
   * Connection behavior:
   * - Attempts to connect to SignalK server using client configuration
   * - Logs success/failure without throwing errors
   * - Allows MCP server to continue operating even if SignalK is unavailable
   * - Called automatically during server initialization
   * 
   * @returns Promise that always resolves (never rejects)
   * 
   * @example
   * // Manual reconnection attempt
   * await server.connectToSignalK();
   * 
   * // Connection is also attempted automatically during construction
   * const server = new SignalKMCPServer();
   * // connectToSignalK() is called internally
   */
  async connectToSignalK(): Promise<void> {
    try {
      await this.signalkClient.connect();
      console.error('SignalK client connected successfully');
    } catch (error: any) {
      console.error('Failed to connect to SignalK:', error.message || error);
      // Continue running the MCP server even if SignalK is unavailable
    }
  }

  /**
   * Registers MCP tool handlers and defines the available tools for AI agents
   * 
   * Registered tools:
   * - get_vessel_state: Current vessel navigation data
   * - get_ais_targets: Nearby vessels from AIS
   * - get_active_alarms: System notifications and alerts
   * - list_available_paths: Discover available SignalK data paths
   * - get_path_value: Get latest value for specific path
   * - get_connection_status: WebSocket connection health
   * 
   * Handler features:
   * - JSON Schema validation for tool inputs
   * - Standardized error handling with MCP error codes
   * - Automatic request routing to appropriate methods
   * - Graceful error responses for tool execution failures
   * 
   * @example
   * // Tools are registered automatically during construction
   * const server = new SignalKMCPServer();
   * // setupToolHandlers() is called internally
   * 
   * // AI agents can then call tools like:
   * // - get_vessel_state()
   * // - get_ais_targets()
   * // - get_path_value({"path": "navigation.position"})
   */
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

  /**
   * MCP tool handler that returns current vessel state with all available sensor data
   * 
   * Response format:
   * - JSON text content with vessel navigation and sensor data
   * - Includes connection status, context, and timestamp
   * - Dynamic data structure based on available SignalK paths
   * - Formatted with 2-space indentation for readability
   * 
   * @returns MCPToolResponse with vessel state as formatted JSON text
   * 
   * @example
   * // Called by AI agents via MCP protocol:
   * // Tool: get_vessel_state
   * // Arguments: {}
   * 
   * // Response content:
   * // {
   * //   "connected": true,
   * //   "context": "vessels.self",
   * //   "timestamp": "2023-06-22T10:30:15.123Z",
   * //   "data": {
   * //     "navigation.position": {
   * //       "value": {"latitude": 37.8199, "longitude": -122.4783},
   * //       "timestamp": "2023-06-22T10:30:15.000Z"
   * //     },
   * //     "navigation.speedOverGround": {
   * //       "value": 5.2,
   * //       "timestamp": "2023-06-22T10:30:15.000Z"
   * //     }
   * //   }
   * // }
   */
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

  /**
   * MCP tool handler that returns nearby AIS targets (other vessels) with position and navigation data
   * 
   * Response format:
   * - JSON text content with AIS target array
   * - Filtered to targets updated within last 5 minutes
   * - Limited to 50 targets to prevent overwhelming responses
   * - Includes MMSI, position, course, speed, and vessel identification
   * 
   * @returns MCPToolResponse with AIS targets as formatted JSON text
   * 
   * @example
   * // Called by AI agents via MCP protocol:
   * // Tool: get_ais_targets
   * // Arguments: {}
   * 
   * // Response content:
   * // {
   * //   "connected": true,
   * //   "count": 2,
   * //   "timestamp": "2023-06-22T10:30:15.123Z",
   * //   "targets": [
   * //     {
   * //       "mmsi": "123456789",
   * //       "navigation.position": {"latitude": 37.8200, "longitude": -122.4800},
   * //       "navigation.courseOverGround": 45.0,
   * //       "navigation.speedOverGround": 8.5,
   * //       "lastUpdate": "2023-06-22T10:29:45.000Z"
   * //     }
   * //   ]
   * // }
   */
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

  /**
   * MCP tool handler that returns current active alarms and system notifications
   * 
   * Response format:
   * - JSON text content with active alarm array
   * - Includes alarm state (alert, warn, alarm, emergency)
   * - Contains alarm message, path, and timestamp
   * - Only returns alarms with non-normal states
   * 
   * Alarm states:
   * - alert: General warning condition
   * - warn: Warning requiring attention
   * - alarm: Alarm requiring immediate attention
   * - emergency: Emergency requiring immediate action
   * 
   * @returns MCPToolResponse with active alarms as formatted JSON text
   * 
   * @example
   * // Called by AI agents via MCP protocol:
   * // Tool: get_active_alarms
   * // Arguments: {}
   * 
   * // Response content:
   * // {
   * //   "connected": true,
   * //   "count": 1,
   * //   "timestamp": "2023-06-22T10:30:15.123Z",
   * //   "alarms": [
   * //     {
   * //       "path": "notifications.engines.temperature",
   * //       "state": "alert",
   * //       "message": "Engine temperature high",
   * //       "timestamp": "2023-06-22T10:25:30.000Z"
   * //     }
   * //   ]
   * // }
   */
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

  /**
   * MCP tool handler that discovers and returns all available SignalK data paths
   * 
   * Response format:
   * - JSON text content with sorted array of available paths
   * - Uses HTTP REST API for complete path discovery
   * - Falls back to WebSocket-discovered paths if HTTP fails
   * - Filters out metadata fields and internal paths
   * 
   * Path discovery methods:
   * 1. Primary: HTTP REST API query to SignalK server
   * 2. Fallback: WebSocket-cached paths from live data
   * 
   * @returns MCPToolResponse with available paths as formatted JSON text
   * 
   * @example
   * // Called by AI agents via MCP protocol:
   * // Tool: list_available_paths
   * // Arguments: {}
   * 
   * // Response content:
   * // {
   * //   "connected": true,
   * //   "count": 25,
   * //   "timestamp": "2023-06-22T10:30:15.123Z",
   * //   "paths": [
   * //     "electrical.batteries.house.voltage",
   * //     "environment.wind.speedApparent",
   * //     "navigation.courseOverGround",
   * //     "navigation.position",
   * //     "navigation.speedOverGround",
   * //     "propulsion.main.temperature"
   * //   ]
   * // }
   */
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

  /**
   * MCP tool handler that gets the latest value for a specific SignalK data path
   * 
   * Response format:
   * - JSON text content with path value and metadata
   * - Uses HTTP REST API for real-time data from server
   * - Falls back to WebSocket-cached value if HTTP fails
   * - Includes timestamps, source information, and error details
   * 
   * Value retrieval methods:
   * 1. Primary: HTTP REST API query for specific path
   * 2. Fallback: WebSocket-cached value from live data
   * 
   * @param path - SignalK data path in dot notation (e.g., 'navigation.position')
   * @returns MCPToolResponse with path value as formatted JSON text
   * 
   * @example
   * // Called by AI agents via MCP protocol:
   * // Tool: get_path_value
   * // Arguments: {"path": "navigation.position"}
   * 
   * // Response content:
   * // {
   * //   "connected": true,
   * //   "path": "navigation.position",
   * //   "timestamp": "2023-06-22T10:30:15.123Z",
   * //   "data": {
   * //     "value": {
   * //       "latitude": 37.8199,
   * //       "longitude": -122.4783
   * //     },
   * //     "timestamp": "2023-06-22T10:30:15.000Z",
   * //     "source": {
   * //       "label": "GPS1",
   * //       "type": "NMEA0183"
   * //     }
   * //   }
   * // }
   */
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

  /**
   * MCP tool handler that returns comprehensive SignalK connection status and health information
   * 
   * Response format:
   * - JSON text content with detailed connection information
   * - WebSocket and HTTP URLs for debugging
   * - Server configuration details (hostname, port, TLS)
   * - Data cache statistics (paths, AIS targets, alarms)
   * - Current vessel context being monitored
   * 
   * Status information includes:
   * - Connection state and server URLs
   * - Configuration parameters
   * - Data cache statistics
   * - Timestamp of status check
   * 
   * @returns MCPToolResponse with connection status as formatted JSON text
   * 
   * @example
   * // Called by AI agents via MCP protocol:
   * // Tool: get_connection_status
   * // Arguments: {}
   * 
   * // Response content:
   * // {
   * //   "connected": true,
   * //   "url": "ws://localhost:3000",
   * //   "wsUrl": "ws://localhost:3000",
   * //   "httpUrl": "http://localhost:3000",
   * //   "hostname": "localhost",
   * //   "port": 3000,
   * //   "useTLS": false,
   * //   "context": "vessels.self",
   * //   "pathCount": 25,
   * //   "aisTargetCount": 3,
   * //   "activeAlarmCount": 1,
   * //   "timestamp": "2023-06-22T10:30:15.123Z"
   * // }
   */
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

  /**
   * Starts the MCP server and begins listening for requests via stdio transport
   * 
   * Server startup:
   * - Establishes stdio transport for MCP communication
   * - Connects MCP server to transport layer
   * - Logs server startup information to stderr
   * - Begins processing MCP requests from AI agents
   * 
   * Transport details:
   * - Uses stdio (stdin/stdout) for MCP protocol communication
   * - Stderr used for logging to avoid interfering with MCP protocol
   * - Server runs indefinitely until process termination
   * 
   * @returns Promise that resolves when server is running
   * 
   * @example
   * // Start the MCP server
   * const server = new SignalKMCPServer();
   * await server.run();
   * // Server is now running and accepting MCP requests
   * 
   * // Server logs will appear on stderr:
   * // "signalk-mcp-server v1.0.0 running on stdio"
   */
  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error(`${this.serverName} v${this.serverVersion} running on stdio`);
  }

  /**
   * Gets the underlying MCP Server instance for testing and advanced usage
   * 
   * Testing usage:
   * - Allows direct access to MCP server internals
   * - Enables testing of request handlers and server configuration
   * - Provides access to server capabilities and metadata
   * 
   * @returns The MCP Server instance
   * 
   * @example
   * // Testing server configuration
   * const server = new SignalKMCPServer();
   * const mcpServer = server.mcpServer;
   * console.log('Server name:', mcpServer.name);
   * console.log('Server version:', mcpServer.version);
   * 
   * // Testing tool handlers
   * const tools = await mcpServer.request({method: 'tools/list'});
   * console.log('Available tools:', tools.tools.length);
   */
  get mcpServer(): Server {
    return this.server;
  }

  /**
   * Gets the SignalK client instance for testing and direct access
   * 
   * Testing usage:
   * - Allows direct access to SignalK client methods
   * - Enables testing of SignalK connection and data processing
   * - Provides access to cached vessel data and connection state
   * 
   * @returns The SignalK client instance
   * 
   * @example
   * // Testing SignalK connection
   * const server = new SignalKMCPServer();
   * const client = server.signalkClientInstance;
   * console.log('Connected:', client.connected);
   * console.log('Available paths:', client.availablePaths.size);
   * 
   * // Direct access to vessel data
   * const vesselState = client.getVesselState();
   * console.log('Vessel data:', vesselState.data);
   * 
   * // Testing event handling
   * client.on('delta', (delta) => {
   *   console.log('Received delta:', delta);
   * });
   */
  get signalkClientInstance(): SignalKClient {
    return this.signalkClient;
  }
}
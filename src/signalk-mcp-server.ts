import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { SignalKClient } from './signalk-client.js';
import type { MCPToolResponse, MCPResource } from './types/index.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getCurrentDirname } from './utils/path-utils.js';

// Get __dirname equivalent for ES modules
const currentDirname = getCurrentDirname();

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
  private resources: Map<string, any> = new Map();
  private resourcesDir: string;

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
    this.serverName =
      options.serverName || process.env.SERVER_NAME || 'signalk-mcp-server';
    this.serverVersion =
      options.serverVersion || process.env.SERVER_VERSION || '1.0.0';

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
      },
    );

    // Setup resources directory
    // Use currentDirname to find the resources directory relative to this file
    // When compiled, this file is at dist/src/signalk-mcp-server.js
    // Resources are at project-root/resources
    if (currentDirname.includes('dist')) {
      // Running from built dist directory - go up 2 levels from dist/src
      this.resourcesDir = path.join(currentDirname, '..', '..', 'resources');
    } else {
      // Running from source directory - go up 1 level from src
      this.resourcesDir = path.join(currentDirname, '..', 'resources');
    }

    this.setupToolHandlers();
    this.setupResourceHandlers();

    // Load resources
    this.loadResources().catch((error) => {
      console.error('Failed to load resources:', error.message || error);
    });

    // Handle SignalK connection errors gracefully
    this.signalkClient.on('error', (error) => {
      console.error('SignalK connection error:', error.message || error);
      // Don't crash the server on SignalK connection errors
    });

    // Connect to SignalK asynchronously
    this.connectToSignalK().catch((error) => {
      console.error(
        'SignalK connection failed during startup:',
        error.message || error,
      );
    });
  }

  /**
   * Loads resources from the filesystem
   */
  async loadResources(): Promise<void> {
    try {
      const resourceFiles = [
        'signalk-overview.json',
        'data-model-reference.json',
        'path-categories-guide.json',
        'mcp-tool-reference.json',
      ];

      for (const file of resourceFiles) {
        try {
          const filePath = path.join(this.resourcesDir, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const resourceName = file.replace('.json', '').replace(/-/g, '_');
          this.resources.set(`signalk://${resourceName}`, JSON.parse(content));
        } catch (error: any) {
          console.error(`Failed to load resource ${file}:`, error.message);
        }
      }
    } catch (error: any) {
      console.error('Failed to load resources directory:', error.message);
    }
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
    this.server.setRequestHandler(ListToolsRequestSchema, () => ({
      tools: [
        {
          name: 'get_vessel_state',
          description:
            'Get current vessel navigation data (position, heading, speed, wind, vessel identity)',
          inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
          },
        },
        {
          name: 'get_ais_targets',
          description: 'Get nearby AIS targets sorted by distance from self vessel (closest first). Includes distance in meters, position, course, and speed data.',
          inputSchema: {
            type: 'object',
            properties: {
              page: {
                type: 'number',
                description: 'Page number (1-based, default: 1)',
                minimum: 1,
              },
              pageSize: {
                type: 'number',
                description: 'Number of targets per page (default: 10, max: 50)',
                minimum: 1,
                maximum: 50,
              },
            },
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
        {
          name: 'get_initial_context',
          description:
            'Get comprehensive SignalK context and documentation to understand available data and usage patterns',
          inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
          },
        },
      ],
    }));

    this.server.setRequestHandler(
      CallToolRequestSchema,
      async (request: any): Promise<any> => {
        const { name, arguments: args } = request.params;

        try {
          switch (name) {
            case 'get_vessel_state':
              return await this.getVesselState();
            case 'get_ais_targets':
              return await this.getAISTargets(args.page, args.pageSize);
            case 'get_active_alarms':
              return await this.getActiveAlarms();
            case 'list_available_paths':
              return await this.listAvailablePaths();
            case 'get_path_value':
              return await this.getPathValue(args.path);
            case 'get_connection_status':
              return this.getConnectionStatus();
            case 'get_initial_context':
              return this.getInitialContext();
            default:
              throw new McpError(
                ErrorCode.MethodNotFound,
                `Unknown tool: ${name}`,
              );
          }
        } catch (error: any) {
          throw new McpError(
            ErrorCode.InternalError,
            `Tool execution failed: ${error.message}`,
          );
        }
      },
    );
  }

  /**
   * Sets up MCP resource handlers for listing and reading reference resources
   *
   * Provides reference resources:
   * - SignalK overview and documentation
   * - Data model reference
   * - Path categories guide
   * - MCP tool reference
   */
  setupResourceHandlers(): void {
    this.server.setRequestHandler(ListResourcesRequestSchema, () => {
      const resources: MCPResource[] = [
        // Reference resources
        {
          uri: 'signalk://signalk_overview',
          name: 'SignalK Overview',
          description: 'Core concepts and data model structure of SignalK',
          mimeType: 'application/json',
        },
        {
          uri: 'signalk://data_model_reference',
          name: 'SignalK Data Model Reference',
          description:
            'Comprehensive reference of SignalK paths and their meanings',
          mimeType: 'application/json',
        },
        {
          uri: 'signalk://path_categories_guide',
          name: 'SignalK Path Categories Guide',
          description: 'Guide to understanding and categorizing SignalK paths',
          mimeType: 'application/json',
        },
        {
          uri: 'signalk://mcp_tool_reference',
          name: 'MCP Tool Reference',
          description:
            'Reference guide for available MCP tools and their usage patterns',
          mimeType: 'application/json',
        },
      ];

      return { resources };
    });

    this.server.setRequestHandler(
      ReadResourceRequestSchema,
      (request: any): any => {
        const { uri } = request.params;

        try {
          // Check if it's a resource
          const resourceContent = this.resources.get(uri);
          if (resourceContent) {
            return {
              contents: [
                {
                  uri,
                  mimeType: 'application/json',
                  text: JSON.stringify(resourceContent, null, 2),
                },
              ],
            };
          }

          // Unknown resource
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Unknown resource: ${uri}`,
          );
        } catch (error: any) {
          throw new McpError(
            ErrorCode.InternalError,
            `Resource read failed: ${error.message}`,
          );
        }
      },
    );
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
    const data = await this.signalkClient.getVesselState();
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
   * - JSON text content with AIS target array sorted by distance
   * - Includes distance in meters from self vessel when positions available
   * - Supports pagination with configurable page size
   * - Filtered to targets updated within last 5 minutes
   * - Maximum 50 targets per page
   * - Includes MMSI, position, course, speed, and vessel identification
   *
   * @param page - Page number (1-based, default: 1)
   * @param pageSize - Number of targets per page (default: 10, max: 50)
   * @returns MCPToolResponse with AIS targets as formatted JSON text
   *
   * @example
   * // Called by AI agents via MCP protocol:
   * // Tool: get_ais_targets
   * // Arguments: {"page": 1, "pageSize": 10}
   *
   * // Response content:
   * // {
   * //   "connected": true,
   * //   "count": 2,
   * //   "timestamp": "2023-06-22T10:30:15.123Z",
   * //   "targets": [
   * //     {
   * //       "mmsi": "123456789",
   * //       "distanceMeters": 1852.5,
   * //       "navigation.position": {"latitude": 37.8200, "longitude": -122.4800},
   * //       "navigation.courseOverGround": 45.0,
   * //       "navigation.speedOverGround": 8.5,
   * //       "lastUpdate": "2023-06-22T10:29:45.000Z"
   * //     }
   * //   ],
   * //   "pagination": {
   * //     "page": 1,
   * //     "pageSize": 10,
   * //     "totalCount": 15,
   * //     "totalPages": 2,
   * //     "hasNextPage": true,
   * //     "hasPreviousPage": false
   * //   }
   * // }
   */
  async getAISTargets(page?: number, pageSize?: number): Promise<MCPToolResponse> {
    const data = await this.signalkClient.getAISTargets(page, pageSize);
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
    const data = await this.signalkClient.getActiveAlarms();
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
  getConnectionStatus(): MCPToolResponse {
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
   * MCP tool handler that returns comprehensive SignalK context and documentation
   *
   * This tool provides AI agents with essential context about:
   * - SignalK overview and core concepts
   * - Complete data model reference with path meanings
   * - Path categorization guide for understanding data organization
   * - MCP tool reference with usage patterns and examples
   *
   * Response format:
   * - JSON text content with all reference materials combined
   * - Structured sections for each type of documentation
   * - Comprehensive guide for AI agents to understand and utilize SignalK data
   *
   * Usage:
   * - Call this tool first to understand the SignalK system
   * - Use the returned context to make informed decisions about other tool calls
   * - Reference the path categories and data model when interpreting vessel data
   *
   * @returns MCPToolResponse with comprehensive SignalK context as formatted JSON text
   *
   * @example
   * // Called by AI agents via MCP protocol:
   * // Tool: get_initial_context
   * // Arguments: {}
   *
   * // Response content:
   * // {
   * //   "signalk_overview": {...},
   * //   "data_model_reference": {...},
   * //   "path_categories_guide": {...},
   * //   "mcp_tool_reference": {...},
   * //   "server_info": {
   * //     "name": "signalk-mcp-server",
   * //     "version": "1.0.0",
   * //     "loaded_at": "2023-06-22T10:30:15.123Z"
   * //   }
   * // }
   */
  getInitialContext(): MCPToolResponse {
    const contextData: Record<string, any> = {
      server_info: {
        name: this.serverName,
        version: this.serverVersion,
        loaded_at: new Date().toISOString(),
        description:
          'SignalK MCP Server - Provides AI agents with access to marine vessel data',
      },
    };

    // Load all available resources
    for (const [uri, content] of this.resources.entries()) {
      const resourceKey = uri.replace('signalk://', '');
      contextData[resourceKey] = content;
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(contextData, null, 2),
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

  /**
   * Cleans up resources when shutting down the server
   *
   * - Clears automatic update intervals
   * - Disconnects from SignalK server
   * - Releases any held resources
   *
   * @example
   * // Graceful shutdown
   * const server = new SignalKMCPServer();
   * await server.run();
   *
   * // On shutdown signal
   * process.on('SIGINT', async () => {
   *   await server.cleanup();
   *   process.exit(0);
   * });
   */
  cleanup(): void {
    if (this.signalkClient.connected) {
      this.signalkClient.disconnect();
    }
  }
}

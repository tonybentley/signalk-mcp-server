/**
 * SignalKMCPServer Unit Tests
 *
 * Comprehensive tests for the MCP server functionality including:
 * - Server initialization and configuration
 * - Tool handler setup and execution
 * - SignalK client integration
 * - Error handling and edge cases
 */

import {
  describe,
  test,
  expect,
  jest,
  beforeEach,
  afterEach,
} from '@jest/globals';
// Mock import.meta.url for Jest
jest.mock('url', () => ({
  fileURLToPath: jest.fn(() => '/mocked/path/src/signalk-mcp-server.ts'),
}));

// Mock path module  
jest.mock('path', () => ({
  dirname: jest.fn((p: string) => p.replace(/\/[^/]+$/, '')),
  join: jest.fn((...args: string[]) => args.join('/')),
}));

// Mock fs/promises
jest.mock('fs/promises', () => ({
  readFile: jest.fn(() => Promise.resolve(JSON.stringify({ test: 'data' }))),
}));

import { SignalKMCPServer } from './signalk-mcp-server';
import { SignalKClient } from './signalk-client';
import type { SignalKMCPServerOptions } from './signalk-mcp-server';

// Mock the SignalK client
jest.mock('./signalk-client', () => ({
  SignalKClient: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    connect: jest.fn().mockImplementation(() => Promise.resolve()), // Returns Promise<void>
    getVesselState: jest.fn(),
    getAISTargets: jest.fn(),
    getActiveAlarms: jest.fn(),
    listAvailablePaths: jest.fn(),
    getPathValue: jest.fn(),
    getConnectionStatus: jest.fn(),
    disconnect: jest.fn(),
    buildWebSocketUrl: jest.fn(),
    buildHttpUrl: jest.fn(),
    buildRestApiUrl: jest.fn(),
    handleDelta: jest.fn(),
    setupEventHandlers: jest.fn(),
    setSignalKConfig: jest.fn(),
    client: jest.fn(),
  })),
}));
const MockedSignalKClient = jest.mocked(SignalKClient);

// Mock the MCP SDK components
const mockServer = {
  setRequestHandler: jest.fn(),
  connect: jest.fn(),
};

const mockStdioTransport = {};

jest.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: jest.fn().mockImplementation(() => mockServer),
}));

jest.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: jest.fn().mockImplementation(() => mockStdioTransport),
}));

jest.mock('@modelcontextprotocol/sdk/types.js', () => ({
  CallToolRequestSchema: 'CallToolRequestSchema',
  ListToolsRequestSchema: 'ListToolsRequestSchema',
  ErrorCode: {
    MethodNotFound: -32601,
    InternalError: -32603,
  },
  McpError: jest.fn().mockImplementation((...args: any[]) => {
    const [code, message] = args;
    const error = new Error(message);
    (error as any).code = code;
    return error;
  }),
}));

describe('SignalKMCPServer', () => {
  let mockSignalKClient: jest.Mocked<SignalKClient>;
  let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset the mock to always return the same instance
    mockSignalKClient = {
      on: jest.fn(),
      connect: jest.fn().mockImplementation(() => Promise.resolve()),
      getVesselState: jest.fn(),
      getAISTargets: jest.fn(),
      getActiveAlarms: jest.fn(),
      listAvailablePaths: jest.fn(),
      getPathValue: jest.fn(),
      getConnectionStatus: jest.fn(),
      disconnect: jest.fn(),
      buildWebSocketUrl: jest.fn(),
      buildHttpUrl: jest.fn(),
      buildRestApiUrl: jest.fn(),
      handleDelta: jest.fn(),
      setupEventHandlers: jest.fn(),
      setSignalKConfig: jest.fn(),
      client: jest.fn(),
    } as any;

    // Make the constructor always return our specific mock instance
    MockedSignalKClient.mockImplementation(() => mockSignalKClient);

    // Spy on console.error
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('Constructor', () => {
    test('should initialize with default options', () => {
      new SignalKMCPServer();

      expect(MockedSignalKClient).toHaveBeenCalledWith();
      expect(mockServer.setRequestHandler).toHaveBeenCalledTimes(4); // 2 for tools + 2 for resources
      expect(mockSignalKClient.on).toHaveBeenCalledWith(
        'error',
        expect.any(Function),
      );
    });

    test('should initialize with custom options', () => {
      const options: SignalKMCPServerOptions = {
        serverName: 'custom-server',
        serverVersion: '2.0.0',
        signalkClient: mockSignalKClient,
      };

      const server = new SignalKMCPServer(options);

      expect(MockedSignalKClient).not.toHaveBeenCalled();
      expect(server.signalkClientInstance).toBe(mockSignalKClient);
    });

    test('should use environment variables when no options provided', () => {
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        SERVER_NAME: 'env-server',
        SERVER_VERSION: '3.0.0',
      };

      const server = new SignalKMCPServer();

      expect(server).toBeDefined();

      process.env = originalEnv;
    });

    test('should set up error handler for SignalK client', () => {
      new SignalKMCPServer();

      expect(mockSignalKClient.on).toHaveBeenCalledWith(
        'error',
        expect.any(Function),
      );

      // Test the error handler
      const errorHandler = mockSignalKClient.on.mock.calls[0][1];
      const testError = new Error('Test error');
      errorHandler(testError);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'SignalK connection error:',
        'Test error',
      );
    });

    test('should attempt SignalK connection during initialization', () => {
      mockSignalKClient.connect.mockResolvedValue(undefined);

      new SignalKMCPServer();

      expect(mockSignalKClient.connect).toHaveBeenCalled();
    });
  });

  describe('connectToSignalK', () => {
    test('should connect successfully and log success', async () => {
      mockSignalKClient.connect.mockResolvedValue(undefined);
      const server = new SignalKMCPServer();

      await server.connectToSignalK();

      expect(mockSignalKClient.connect).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'SignalK client connected successfully',
      );
    });

    test('should handle connection failure gracefully', async () => {
      const connectionError = new Error('Connection failed');
      mockSignalKClient.connect.mockRejectedValue(connectionError);
      const server = new SignalKMCPServer();

      await server.connectToSignalK();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to connect to SignalK:',
        'Connection failed',
      );
    });

    test('should handle connection failure with non-Error object', async () => {
      mockSignalKClient.connect.mockRejectedValue('String error');
      const server = new SignalKMCPServer();

      await server.connectToSignalK();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to connect to SignalK:',
        'String error',
      );
    });
  });

  describe('setupToolHandlers', () => {
    test('should register list tools handler', () => {
      new SignalKMCPServer();

      expect(mockServer.setRequestHandler).toHaveBeenCalledWith(
        'ListToolsRequestSchema',
        expect.any(Function),
      );
    });

    test('should register call tool handler', () => {
      new SignalKMCPServer();

      expect(mockServer.setRequestHandler).toHaveBeenCalledWith(
        'CallToolRequestSchema',
        expect.any(Function),
      );
    });

    test('should return correct tools list', async () => {
      new SignalKMCPServer();

      const listToolsHandler = mockServer.setRequestHandler.mock
        .calls[0][1] as Function;
      const result = await listToolsHandler();

      expect(result.tools).toHaveLength(7);
      expect(result.tools.map((tool: any) => tool.name)).toEqual([
        'get_vessel_state',
        'get_ais_targets',
        'get_active_alarms',
        'list_available_paths',
        'get_path_value',
        'get_connection_status',
        'get_initial_context',
      ]);
      
      // Verify get_ais_targets has pagination parameters
      const aisTargetsTool = result.tools.find((tool: any) => tool.name === 'get_ais_targets');
      expect(aisTargetsTool.inputSchema.properties).toHaveProperty('page');
      expect(aisTargetsTool.inputSchema.properties).toHaveProperty('pageSize');
      expect(aisTargetsTool.inputSchema.properties.page.type).toBe('number');
      expect(aisTargetsTool.inputSchema.properties.pageSize.type).toBe('number');
      expect(aisTargetsTool.inputSchema.properties.pageSize.maximum).toBe(50);
    });
  });

  describe('Tool execution', () => {
    let callToolHandler: Function;

    beforeEach(() => {
      new SignalKMCPServer();
      callToolHandler = mockServer.setRequestHandler.mock
        .calls[1][1] as Function;
    });

    test('should execute get_vessel_state tool', async () => {
      const mockData = {
        connected: true,
        context: 'vessels.self',
        data: { position: 'test' },
        timestamp: '2025-06-21T10:00:00.000Z',
      };
      mockSignalKClient.getVesselState.mockResolvedValue(mockData);

      const request = {
        params: { name: 'get_vessel_state', arguments: {} },
      };

      const result = await callToolHandler(request);

      expect(mockSignalKClient.getVesselState).toHaveBeenCalled();
      expect(result.content[0].type).toBe('text');
      expect(JSON.parse(result.content[0].text)).toEqual(mockData);
    });

    test('should execute get_ais_targets tool', async () => {
      const mockData = {
        connected: true,
        targets: [],
        count: 0,
        timestamp: '2025-06-21T10:00:00.000Z',
        pagination: {
          page: 1,
          pageSize: 10,
          totalCount: 0,
          totalPages: 0,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      };
      mockSignalKClient.getAISTargets.mockResolvedValue(mockData);

      const request = {
        params: { name: 'get_ais_targets', arguments: {} },
      };

      const result = await callToolHandler(request);

      expect(mockSignalKClient.getAISTargets).toHaveBeenCalledWith(undefined, undefined);
      expect(JSON.parse(result.content[0].text)).toEqual(mockData);
    });

    test('should execute get_ais_targets tool with pagination', async () => {
      const mockData = {
        connected: true,
        targets: [
          { mmsi: '123456789', distanceMeters: 1000, lastUpdate: '2025-06-21T10:00:00.000Z' },
        ],
        count: 1,
        timestamp: '2025-06-21T10:00:00.000Z',
        pagination: {
          page: 2,
          pageSize: 5,
          totalCount: 10,
          totalPages: 2,
          hasNextPage: false,
          hasPreviousPage: true,
        },
      };
      mockSignalKClient.getAISTargets.mockResolvedValue(mockData);

      const request = {
        params: { name: 'get_ais_targets', arguments: { page: 2, pageSize: 5 } },
      };

      const result = await callToolHandler(request);

      expect(mockSignalKClient.getAISTargets).toHaveBeenCalledWith(2, 5);
      expect(JSON.parse(result.content[0].text)).toEqual(mockData);
    });

    test('should execute get_active_alarms tool', async () => {
      const mockData = {
        connected: true,
        alarms: [],
        count: 0,
        timestamp: '2025-06-21T10:00:00.000Z',
      };
      mockSignalKClient.getActiveAlarms.mockResolvedValue(mockData);

      const request = {
        params: { name: 'get_active_alarms', arguments: {} },
      };

      const result = await callToolHandler(request);

      expect(mockSignalKClient.getActiveAlarms).toHaveBeenCalled();
      expect(JSON.parse(result.content[0].text)).toEqual(mockData);
    });

    test('should execute list_available_paths tool', async () => {
      const mockData = {
        connected: true,
        paths: ['navigation.position'],
        count: 1,
        timestamp: '2025-06-21T10:00:00.000Z',
      };
      mockSignalKClient.listAvailablePaths.mockResolvedValue(mockData);

      const request = {
        params: { name: 'list_available_paths', arguments: {} },
      };

      const result = await callToolHandler(request);

      expect(mockSignalKClient.listAvailablePaths).toHaveBeenCalled();
      expect(JSON.parse(result.content[0].text)).toEqual(mockData);
    });

    test('should execute get_path_value tool', async () => {
      const mockData = {
        connected: true,
        path: 'navigation.position',
        data: { value: 'test' },
        timestamp: '2025-06-21T10:00:00.000Z',
      };
      mockSignalKClient.getPathValue.mockResolvedValue(mockData);

      const request = {
        params: {
          name: 'get_path_value',
          arguments: { path: 'navigation.position' },
        },
      };

      const result = await callToolHandler(request);

      expect(mockSignalKClient.getPathValue).toHaveBeenCalledWith(
        'navigation.position',
      );
      expect(JSON.parse(result.content[0].text)).toEqual(mockData);
    });

    test('should execute get_connection_status tool', async () => {
      const mockData = {
        connected: false,
        hostname: 'localhost',
        port: 3000,
        url: 'localhost:3000',
        wsUrl: 'ws://localhost:3000',
        httpUrl: 'http://localhost:3000',
        useTLS: false,
        context: 'vessels.self',
        timestamp: '2025-06-21T10:00:00.000Z',
        pathCount: 0,
        aisTargetCount: 0,
        activeAlarmCount: 0,
      };
      mockSignalKClient.getConnectionStatus.mockReturnValue(mockData);

      const request = {
        params: { name: 'get_connection_status', arguments: {} },
      };

      const result = await callToolHandler(request);

      expect(mockSignalKClient.getConnectionStatus).toHaveBeenCalled();
      expect(JSON.parse(result.content[0].text)).toEqual(mockData);
    });

    test('should execute get_initial_context tool', async () => {
      const request = {
        params: { name: 'get_initial_context', arguments: {} },
      };

      const result = await callToolHandler(request);
      const parsedResult = JSON.parse(result.content[0].text);

      expect(parsedResult).toHaveProperty('server_info');
      expect(parsedResult.server_info).toHaveProperty('name');
      expect(parsedResult.server_info).toHaveProperty('version');
      expect(parsedResult.server_info).toHaveProperty('loaded_at');
      expect(parsedResult.server_info).toHaveProperty('description');
    });

    test('should handle unknown tool gracefully', async () => {
      const request = {
        params: { name: 'unknown_tool', arguments: {} },
      };

      await expect(callToolHandler(request)).rejects.toThrow(
        'Unknown tool: unknown_tool',
      );
    });

    test('should handle tool execution errors', async () => {
      mockSignalKClient.getVesselState.mockImplementation(() => {
        throw new Error('Tool execution failed');
      });

      const request = {
        params: { name: 'get_vessel_state', arguments: {} },
      };

      await expect(callToolHandler(request)).rejects.toThrow(
        'Tool execution failed: Tool execution failed',
      );
    });
  });

  describe('Individual tool methods', () => {
    let server: SignalKMCPServer;

    beforeEach(() => {
      server = new SignalKMCPServer();
    });

    test('getVesselState should return formatted response', async () => {
      const mockData = {
        connected: true,
        context: 'vessels.self',
        data: {},
        timestamp: '2025-06-21T10:00:00.000Z',
      };
      mockSignalKClient.getVesselState.mockResolvedValue(mockData);

      const result = await server.getVesselState();

      expect(result.content[0].type).toBe('text');
      expect(JSON.parse(result.content[0].text)).toEqual(mockData);
    });

    test('getAISTargets should return formatted response', async () => {
      const mockData = {
        connected: true,
        targets: [],
        count: 0,
        timestamp: '2025-06-21T10:00:00.000Z',
      };
      mockSignalKClient.getAISTargets.mockResolvedValue(mockData);

      const result = await server.getAISTargets();

      expect(result.content[0].type).toBe('text');
      expect(JSON.parse(result.content[0].text)).toEqual(mockData);
    });

    test('getActiveAlarms should return formatted response', async () => {
      const mockData = {
        connected: true,
        alarms: [],
        count: 0,
        timestamp: '2025-06-21T10:00:00.000Z',
      };
      mockSignalKClient.getActiveAlarms.mockResolvedValue(mockData);

      const result = await server.getActiveAlarms();

      expect(result.content[0].type).toBe('text');
      expect(JSON.parse(result.content[0].text)).toEqual(mockData);
    });

    test('listAvailablePaths should return formatted response', async () => {
      const mockData = {
        connected: true,
        paths: [],
        count: 0,
        timestamp: '2025-06-21T10:00:00.000Z',
      };
      mockSignalKClient.listAvailablePaths.mockResolvedValue(mockData);

      const result = await server.listAvailablePaths();

      expect(result.content[0].type).toBe('text');
      expect(JSON.parse(result.content[0].text)).toEqual(mockData);
    });

    test('getPathValue should return formatted response', async () => {
      const mockData = {
        connected: true,
        path: 'test.path',
        data: null,
        timestamp: '2025-06-21T10:00:00.000Z',
      };
      mockSignalKClient.getPathValue.mockResolvedValue(mockData);

      const result = await server.getPathValue('test.path');

      expect(mockSignalKClient.getPathValue).toHaveBeenCalledWith('test.path');
      expect(result.content[0].type).toBe('text');
      expect(JSON.parse(result.content[0].text)).toEqual(mockData);
    });

    test('getConnectionStatus should return formatted response', async () => {
      const mockData = {
        connected: false,
        hostname: 'localhost',
        port: 3000,
        url: 'localhost:3000',
        wsUrl: 'ws://localhost:3000',
        httpUrl: 'http://localhost:3000',
        useTLS: false,
        context: 'vessels.self',
        timestamp: '2025-06-21T10:00:00.000Z',
        pathCount: 0,
        aisTargetCount: 0,
        activeAlarmCount: 0,
      };
      mockSignalKClient.getConnectionStatus.mockReturnValue(mockData);

      const result = await server.getConnectionStatus();

      expect(result.content[0].type).toBe('text');
      expect(JSON.parse(result.content[0].text)).toEqual(mockData);
    });

    test('getInitialContext should return formatted response', async () => {
      const result = await server.getInitialContext();

      expect(result.content[0].type).toBe('text');
      const parsedResult = JSON.parse(result.content[0].text);
      expect(parsedResult).toHaveProperty('server_info');
      expect(parsedResult.server_info).toHaveProperty('name');
      expect(parsedResult.server_info).toHaveProperty('version');
      expect(parsedResult.server_info).toHaveProperty('loaded_at');
      expect(parsedResult.server_info).toHaveProperty('description');
    });
  });

  describe('run', () => {
    test('should connect server with stdio transport', async () => {
      mockServer.connect.mockImplementation(() => Promise.resolve());
      const server = new SignalKMCPServer();

      await server.run();

      expect(mockServer.connect).toHaveBeenCalledWith(mockStdioTransport);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'signalk-mcp-server v1.0.0 running on stdio',
      );
    });

    test('should handle connection errors during run', async () => {
      const connectionError = new Error('Server connection failed');
      mockServer.connect.mockRejectedValue(connectionError as never);
      const server = new SignalKMCPServer();

      await expect(server.run()).rejects.toThrow('Server connection failed');
    });

    test('should use custom server name and version in run message', async () => {
      mockServer.connect.mockResolvedValue(undefined as never);
      const server = new SignalKMCPServer({
        serverName: 'test-server',
        serverVersion: '2.0.0',
      });

      await server.run();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'test-server v2.0.0 running on stdio',
      );
    });
  });

  describe('Getters', () => {
    test('should expose mcpServer getter', () => {
      const server = new SignalKMCPServer();
      expect(server.mcpServer).toBe(mockServer);
    });

    test('should expose signalkClientInstance getter', () => {
      const server = new SignalKMCPServer();
      expect(server.signalkClientInstance).toBe(mockSignalKClient);
    });
  });

  describe('Error scenarios', () => {
    test('should handle SignalK client error event', () => {
      new SignalKMCPServer();

      const errorHandler = mockSignalKClient.on.mock.calls[0][1];

      // Test with Error object
      const error = new Error('Test error');
      errorHandler(error);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'SignalK connection error:',
        'Test error',
      );

      // Test with object that has no message property
      const errorObj = { code: 'ECONNREFUSED' };
      errorHandler(errorObj);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'SignalK connection error:',
        errorObj,
      );
    });

    test('should handle async connection errors during initialization', async () => {
      const connectionError = new Error('Async connection error');
      mockSignalKClient.connect.mockImplementation(() =>
        Promise.reject(connectionError),
      );

      const server = new SignalKMCPServer();

      // Call the connectToSignalK method directly to test the error handling
      await server.connectToSignalK();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to connect to SignalK:',
        'Async connection error',
      );
    });
  });
});

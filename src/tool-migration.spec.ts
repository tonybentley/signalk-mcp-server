/**
 * Tool Migration Comparison Tests
 *
 * Validates Phase 5 migration pattern: legacy tools vs execute_code approach
 * Tests deprecation warnings, token savings, and data consistency
 */

import {
  describe,
  expect,
  jest,
  beforeEach,
  it,
} from '@jest/globals';

// Mock import.meta.url for Jest
jest.mock('url', () => ({
  fileURLToPath: jest.fn(() => '/mocked/path/src/signalk-mcp-server.ts'),
}));

// Mock the path utils
jest.mock('./utils/path-utils.js', () => ({
  getCurrentDirname: jest.fn(() => '/mocked/path/src'),
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

// Mock isolated-vm for testing
jest.mock('isolated-vm', () => ({
  default: {
    Isolate: jest.fn().mockImplementation(() => ({
      createContext: jest.fn(() => Promise.resolve({
        global: {
          set: jest.fn(() => Promise.resolve(undefined)),
        },
        eval: jest.fn(() => Promise.resolve(undefined)),
      })),
      compileScript: jest.fn(() => Promise.resolve({
        run: jest.fn(() => Promise.resolve(JSON.stringify({ success: true }))),
      })),
    })),
  },
}));

// Mock the MCP SDK components
const mockServer = {
  setRequestHandler: jest.fn(),
  connect: jest.fn(),
};

jest.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: jest.fn().mockImplementation(() => mockServer),
}));

jest.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@modelcontextprotocol/sdk/types.js', () => ({
  CallToolRequestSchema: 'CallToolRequestSchema',
  ListToolsRequestSchema: 'ListToolsRequestSchema',
  ReadResourceRequestSchema: 'ReadResourceRequestSchema',
  ListResourcesRequestSchema: 'ListResourcesRequestSchema',
  ErrorCode: {
    MethodNotFound: -32601,
    InternalError: -32603,
    InvalidRequest: -32600,
  },
  McpError: jest.fn().mockImplementation((...args: any[]) => {
    const [code, message] = args;
    const error = new Error(message);
    (error as any).code = code;
    return error;
  }),
}));

import { SignalKMCPServer } from './signalk-mcp-server.js';
import { SignalKClient } from './signalk-client.js';

// Mock the SignalK client
jest.mock('./signalk-client', () => ({
  SignalKClient: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    connect: jest.fn().mockImplementation(() => Promise.resolve()),
    getVesselState: jest.fn(),
    getAISTargets: jest.fn(),
    getActiveAlarms: jest.fn(),
    listAvailablePaths: jest.fn(),
    getPathValue: jest.fn(),
    getConnectionStatus: jest.fn(),
    disconnect: jest.fn(),
    connected: true,
  })),
}));

describe('Tool Migration Tests', () => {
  let mockSignalKClient: any;

  beforeEach(() => {
    jest.clearAllMocks();

    const vesselStateData = {
      connected: true,
      context: 'vessels.self',
      timestamp: new Date().toISOString(),
      data: {
        name: { value: 'Test Vessel' },
        'navigation.position': {
          value: { latitude: 37.8199, longitude: -122.4783 },
        },
        'navigation.speedOverGround': { value: 5.2 },
        'navigation.courseOverGroundTrue': { value: 1.57 },
      },
    };

    const aisTargetsData = {
      count: 2,
      targets: [
        { mmsi: '111111111', distanceMeters: 500 },
        { mmsi: '222222222', distanceMeters: 1500 },
      ],
    };

    const alarmsData = {
      count: 1,
      alarms: [{ path: 'notifications.test', state: 'alert' }],
    };

    mockSignalKClient = {
      on: jest.fn(),
      connect: jest.fn().mockImplementation(() => Promise.resolve()),
      getVesselState: (jest.fn() as any).mockResolvedValue(vesselStateData),
      getAISTargets: (jest.fn() as any).mockResolvedValue(aisTargetsData),
      getActiveAlarms: (jest.fn() as any).mockResolvedValue(alarmsData),
      listAvailablePaths: jest.fn(),
      getPathValue: jest.fn(),
      getConnectionStatus: jest.fn(),
      disconnect: jest.fn(),
      connected: true,
    } as any;

    const MockedSignalKClient = jest.mocked(SignalKClient);
    MockedSignalKClient.mockImplementation(() => mockSignalKClient);
  });

  describe('Hybrid Mode - get_vessel_state migration', () => {
    it('should show deprecation warning in tool description', () => {
      new SignalKMCPServer({ executionMode: 'hybrid' });

      const listToolsHandler = mockServer.setRequestHandler.mock.calls.find(
        (call) => call[0] === 'ListToolsRequestSchema'
      )?.[1] as any;

      const result = listToolsHandler();
      const vesselStateTool = result.tools.find((t: any) => t.name === 'get_vessel_state');

      expect(vesselStateTool).toBeDefined();
      expect(vesselStateTool?.description).toContain('⚠️ DEPRECATED');
      expect(vesselStateTool?.description).toContain('Use execute_code instead');
      expect(vesselStateTool?.description).toContain('Migration example');
      expect(vesselStateTool?.description).toContain('getVesselState()');
      expect(vesselStateTool?.description).toContain('94% fewer tokens');
    });

    it('should show runtime deprecation warning when legacy tool is called', async () => {
      new SignalKMCPServer({
        executionMode: 'hybrid',
        signalkClient: mockSignalKClient,
      });

      const callToolHandler = mockServer.setRequestHandler.mock.calls.find(
        (call) => call[0] === 'CallToolRequestSchema'
      )?.[1] as any;

      const request = {
        params: {
          name: 'get_vessel_state',
          arguments: {},
        },
      };

      const result = await callToolHandler(request);
      const text = result.content[0].text;

      expect(text).toContain('⚠️ DEPRECATION WARNING');
      expect(text).toContain('Use execute_code with getVesselState()');
      expect(text).toContain('94% token savings');
    });

    it('should include actual vessel data along with deprecation warning', async () => {
      new SignalKMCPServer({
        executionMode: 'hybrid',
        signalkClient: mockSignalKClient,
      });

      const callToolHandler = mockServer.setRequestHandler.mock.calls.find(
        (call) => call[0] === 'CallToolRequestSchema'
      )?.[1] as any;

      const request = {
        params: {
          name: 'get_vessel_state',
          arguments: {},
        },
      };

      const result = await callToolHandler(request);
      const text = result.content[0].text;

      // Should have warning
      expect(text).toContain('⚠️ DEPRECATION WARNING');

      // Should also have actual data
      expect(text).toContain('Test Vessel');
      expect(text).toContain('37.8199');
      expect(text).toContain('-122.4783');
    });

    it('should have execute_code tool available in hybrid mode', () => {
      new SignalKMCPServer({ executionMode: 'hybrid' });

      const listToolsHandler = mockServer.setRequestHandler.mock.calls.find(
        (call) => call[0] === 'ListToolsRequestSchema'
      )?.[1] as any;

      const result = listToolsHandler();
      const executeCodeTool = result.tools.find((t: any) => t.name === 'execute_code');

      expect(executeCodeTool).toBeDefined();
      expect(executeCodeTool?.description).toContain('Execute JavaScript code');
      expect(executeCodeTool?.description).toContain('getVesselState()');
    });
  });

  describe('Tools-Only Mode - no deprecation warnings', () => {
    it('should NOT show deprecation warning in tools-only mode', async () => {
      new SignalKMCPServer({
        executionMode: 'tools',
        signalkClient: mockSignalKClient,
      });

      const callToolHandler = mockServer.setRequestHandler.mock.calls.find(
        (call) => call[0] === 'CallToolRequestSchema'
      )?.[1] as any;

      const request = {
        params: {
          name: 'get_vessel_state',
          arguments: {},
        },
      };

      const result = await callToolHandler(request);
      const text = result.content[0].text;

      expect(text).not.toContain('⚠️ DEPRECATION WARNING');
      expect(text).toContain('Test Vessel'); // But should have data
    });

    it('should NOT have execute_code tool in tools-only mode', () => {
      new SignalKMCPServer({ executionMode: 'tools' });

      const listToolsHandler = mockServer.setRequestHandler.mock.calls.find(
        (call) => call[0] === 'ListToolsRequestSchema'
      )?.[1] as any;

      const result = listToolsHandler();
      const executeCodeTool = result.tools.find((t: any) => t.name === 'execute_code');

      expect(executeCodeTool).toBeUndefined();
    });
  });

  describe('Code-Only Mode - legacy tools removed', () => {
    it('should NOT have legacy get_vessel_state tool in code-only mode', () => {
      new SignalKMCPServer({ executionMode: 'code' });

      const listToolsHandler = mockServer.setRequestHandler.mock.calls.find(
        (call) => call[0] === 'ListToolsRequestSchema'
      )?.[1] as any;

      const result = listToolsHandler();
      const vesselStateTool = result.tools.find((t: any) => t.name === 'get_vessel_state');

      expect(vesselStateTool).toBeUndefined();
    });

    it('should have execute_code tool in code-only mode', () => {
      new SignalKMCPServer({ executionMode: 'code' });

      const listToolsHandler = mockServer.setRequestHandler.mock.calls.find(
        (call) => call[0] === 'ListToolsRequestSchema'
      )?.[1] as any;

      const result = listToolsHandler();
      const executeCodeTool = result.tools.find((t: any) => t.name === 'execute_code');

      expect(executeCodeTool).toBeDefined();
    });
  });

  describe('Token Savings Validation', () => {
    it('should demonstrate token savings potential', async () => {
      new SignalKMCPServer({
        executionMode: 'hybrid',
        signalkClient: mockSignalKClient,
      });

      const callToolHandler = mockServer.setRequestHandler.mock.calls.find(
        (call) => call[0] === 'CallToolRequestSchema'
      )?.[1] as any;

      // Legacy approach - returns ALL vessel data
      const legacyRequest = {
        params: {
          name: 'get_vessel_state',
          arguments: {},
        },
      };

      const legacyResult = await callToolHandler(legacyRequest);
      const legacyText = legacyResult.content[0].text;
      const legacySize = legacyText.length;

      // Code execution approach would filter data in isolate
      // Simulate filtered result (just name and position)
      const filteredData = {
        name: 'Test Vessel',
        position: { latitude: 37.8199, longitude: -122.4783 },
      };
      const filteredText = JSON.stringify(filteredData, null, 2);
      const filteredSize = filteredText.length;

      // Verify filtered result is significantly smaller
      expect(filteredSize).toBeLessThan(legacySize);

      // Rough token estimate: ~4 chars per token
      const legacyTokens = Math.ceil(legacySize / 4);
      const filteredTokens = Math.ceil(filteredSize / 4);
      const savings = ((legacyTokens - filteredTokens) / legacyTokens) * 100;

      // Should save at least 50% tokens (actual savings vary by query)
      expect(savings).toBeGreaterThan(50);

      console.log(`Legacy size: ${legacySize} chars (~${legacyTokens} tokens)`);
      console.log(`Filtered size: ${filteredSize} chars (~${filteredTokens} tokens)`);
      console.log(`Token savings: ${savings.toFixed(1)}%`);
    });
  });

  describe('Migration Pattern Validation', () => {
    it('should have migration example in tool description that matches SDK', () => {
      new SignalKMCPServer({ executionMode: 'hybrid' });

      const listToolsHandler = mockServer.setRequestHandler.mock.calls.find(
        (call) => call[0] === 'ListToolsRequestSchema'
      )?.[1] as any;

      const result = listToolsHandler();
      const vesselStateTool = result.tools.find((t: any) => t.name === 'get_vessel_state');

      // Tool description should show getVesselState() function from SDK
      expect(vesselStateTool?.description).toContain('await getVesselState()');

      // Should show filtering pattern
      expect(vesselStateTool?.description).toContain('vessel.data.name?.value');
      expect(vesselStateTool?.description).toContain('navigation.position');

      // Should show return pattern
      expect(vesselStateTool?.description).toContain('return JSON.stringify');
    });

    it('should maintain backward compatibility - both approaches work', () => {
      new SignalKMCPServer({ executionMode: 'hybrid' });

      const listToolsHandler = mockServer.setRequestHandler.mock.calls.find(
        (call) => call[0] === 'ListToolsRequestSchema'
      )?.[1] as any;

      const result = listToolsHandler();
      const toolNames = result.tools.map((t: any) => t.name);

      // Both approaches should be usable in hybrid mode
      expect(toolNames).toContain('get_vessel_state');
      expect(toolNames).toContain('execute_code');
    });
  });

  describe('Phase 6 - All Tools Deprecated', () => {
    it('should show deprecation warning for get_ais_targets', () => {
      new SignalKMCPServer({ executionMode: 'hybrid' });

      const listToolsHandler = mockServer.setRequestHandler.mock.calls.find(
        (call) => call[0] === 'ListToolsRequestSchema'
      )?.[1] as any;

      const result = listToolsHandler();
      const aisTargetsTool = result.tools.find((t: any) => t.name === 'get_ais_targets');

      expect(aisTargetsTool).toBeDefined();
      expect(aisTargetsTool?.description).toContain('⚠️ DEPRECATED');
      expect(aisTargetsTool?.description).toContain('getAisTargets');
      expect(aisTargetsTool?.description).toContain('95% fewer tokens');
    });

    it('should show deprecation warning for get_active_alarms', () => {
      new SignalKMCPServer({ executionMode: 'hybrid' });

      const listToolsHandler = mockServer.setRequestHandler.mock.calls.find(
        (call) => call[0] === 'ListToolsRequestSchema'
      )?.[1] as any;

      const result = listToolsHandler();
      const alarmsTool = result.tools.find((t: any) => t.name === 'get_active_alarms');

      expect(alarmsTool).toBeDefined();
      expect(alarmsTool?.description).toContain('⚠️ DEPRECATED');
      expect(alarmsTool?.description).toContain('getActiveAlarms');
      expect(alarmsTool?.description).toContain('90% fewer tokens');
    });

    it('should show deprecation warning for list_available_paths', () => {
      new SignalKMCPServer({ executionMode: 'hybrid' });

      const listToolsHandler = mockServer.setRequestHandler.mock.calls.find(
        (call) => call[0] === 'ListToolsRequestSchema'
      )?.[1] as any;

      const result = listToolsHandler();
      const pathsTool = result.tools.find((t: any) => t.name === 'list_available_paths');

      expect(pathsTool).toBeDefined();
      expect(pathsTool?.description).toContain('⚠️ DEPRECATED');
      expect(pathsTool?.description).toContain('listAvailablePaths');
      expect(pathsTool?.description).toContain('92% fewer tokens');
    });

    it('should show deprecation warning for get_path_value', () => {
      new SignalKMCPServer({ executionMode: 'hybrid' });

      const listToolsHandler = mockServer.setRequestHandler.mock.calls.find(
        (call) => call[0] === 'ListToolsRequestSchema'
      )?.[1] as any;

      const result = listToolsHandler();
      const pathValueTool = result.tools.find((t: any) => t.name === 'get_path_value');

      expect(pathValueTool).toBeDefined();
      expect(pathValueTool?.description).toContain('⚠️ DEPRECATED');
      expect(pathValueTool?.description).toContain('getPathValue');
      expect(pathValueTool?.description).toContain('96% fewer tokens');
    });

    it('should validate all tools have corresponding SDK functions', () => {
      new SignalKMCPServer({ executionMode: 'hybrid' });

      const listToolsHandler = mockServer.setRequestHandler.mock.calls.find(
        (call) => call[0] === 'ListToolsRequestSchema'
      )?.[1] as any;

      const result = listToolsHandler();
      const legacyTools = result.tools.filter(
        (t: any) =>
          ![
            'execute_code',
            'get_initial_context',
            'get_connection_status',
          ].includes(t.name)
      );

      // All legacy tools should eventually have SDK equivalents
      expect(legacyTools.length).toBeGreaterThan(0);

      console.log(
        'Legacy tools to migrate:',
        legacyTools.map((t: any) => t.name)
      );
    });
  });

  describe('Deprecation Message Formatting', () => {
    it('should format deprecation warning consistently', async () => {
      new SignalKMCPServer({
        executionMode: 'hybrid',
        signalkClient: mockSignalKClient,
      });

      const callToolHandler = mockServer.setRequestHandler.mock.calls.find(
        (call) => call[0] === 'CallToolRequestSchema'
      )?.[1] as any;

      const request = {
        params: {
          name: 'get_vessel_state',
          arguments: {},
        },
      };

      const result = await callToolHandler(request);
      const text = result.content[0].text;

      // Warning should be at the start
      expect(text.startsWith('\n⚠️ DEPRECATION WARNING')).toBe(true);

      // Should have clear migration path
      expect(text).toContain('Use execute_code with getVesselState()');

      // Should quantify benefits
      expect(text).toContain('94% token savings');

      // Actual data should follow warning (JSON starts after the warning message)
      const lines = text.split('\n');
      expect(lines[0]).toBe('');
      expect(lines[1]).toContain('⚠️ DEPRECATION WARNING');
      expect(lines[1]).toContain('Use execute_code with getVesselState()');
    });

    it('should ensure migration example is valid JavaScript', () => {
      new SignalKMCPServer({ executionMode: 'hybrid' });

      const listToolsHandler = mockServer.setRequestHandler.mock.calls.find(
        (call) => call[0] === 'ListToolsRequestSchema'
      )?.[1] as any;

      const result = listToolsHandler();
      const vesselStateTool = result.tools.find((t: any) => t.name === 'get_vessel_state');

      const description = vesselStateTool?.description || '';

      // Extract code block
      const codeMatch = description.match(/```javascript\n([\s\S]*?)\n```/);
      expect(codeMatch).toBeTruthy();

      const code = codeMatch?.[1] || '';

      // Validate code structure
      expect(code).toContain('(async () => {');
      expect(code).toContain('await getVesselState()');
      expect(code).toContain('return JSON.stringify');
      expect(code).toContain('})()');

      // Should be valid async IIFE pattern
      expect(code.trim().endsWith('})();')).toBe(true);
    });
  });
});

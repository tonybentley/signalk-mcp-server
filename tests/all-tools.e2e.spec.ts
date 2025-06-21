/**
 * All MCP Tools End-to-End Tests
 * 
 * Comprehensive test of all SignalK MCP tools with formatted output verification.
 * This test demonstrates the functionality of each tool and validates responses.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { spawn, ChildProcess } from 'child_process';
import { createInterface, Interface } from 'readline';

describe('All MCP Tools E2E Tests', () => {
  let server: ChildProcess;
  let rl: Interface;
  let responses: any[] = [];
  let testResults: Record<string, any> = {};

  beforeAll(async () => {
    console.log('🧪 Starting comprehensive MCP tool test...\n');
    
    // Start the MCP server
    server = spawn('node', ['--loader', 'ts-node/esm', 'src/index.ts'], {
      stdio: ['pipe', 'pipe', 'inherit'],
      cwd: process.cwd()
    });

    // Set up readline to capture server responses
    rl = createInterface({
      input: server.stdout!,
      output: process.stdout,
      terminal: false
    });

    // Collect all responses
    rl.on('line', (line) => {
      try {
        const response = JSON.parse(line);
        responses.push(response);
      } catch (error) {
        // Ignore non-JSON lines
      }
    });

    // Wait for server to start and initialize
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Initialize the server
    await sendRequest({
      jsonrpc: '2.0',
      id: 0,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: { roots: { listChanged: true }, sampling: {} },
        clientInfo: { name: 'comprehensive-test-client', version: '1.0.0' }
      }
    });
  });

  afterAll(async () => {
    if (server) {
      server.kill('SIGTERM');
      rl?.close();
    }
    
    console.log('\n🎯 Test Results Summary:');
    console.log('='.repeat(50));
    Object.entries(testResults).forEach(([tool, result]) => {
      console.log(`${tool}: ${result.success ? '✅ PASS' : '❌ FAIL'}`);
    });
  });

  const sendRequest = async (request: any): Promise<any> => {
    const initialResponseCount = responses.length;
    
    server.stdin!.write(JSON.stringify(request) + '\n');
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Request timeout for ${request.method || request.params?.name}`));
      }, 10000);

      const checkForResponse = () => {
        const newResponses = responses.slice(initialResponseCount);
        const response = newResponses.find(r => r.id === request.id);
        
        if (response) {
          clearTimeout(timeout);
          resolve(response);
        } else {
          setTimeout(checkForResponse, 100);
        }
      };

      checkForResponse();
    });
  };

  const testTool = async (toolName: string, args: any = {}) => {
    const request = {
      jsonrpc: '2.0',
      id: Math.floor(Math.random() * 10000),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args
      }
    };

    try {
      const response = await sendRequest(request);
      
      if (response.error) {
        testResults[toolName] = { success: false, error: response.error };
        return response;
      }

      const content = response.result.content[0].text;
      const data = JSON.parse(content);
      
      testResults[toolName] = { 
        success: true, 
        dataKeys: Object.keys(data),
        hasTimestamp: !!data.timestamp,
        connected: data.connected
      };
      
      return { response, data };
    } catch (error) {
      testResults[toolName] = { success: false, error: error.message };
      throw error;
    }
  };

  test('should test get_connection_status tool', async () => {
    const result = await testTool('get_connection_status');
    
    expect(result.data).toHaveProperty('connected');
    expect(result.data).toHaveProperty('hostname');
    expect(result.data).toHaveProperty('port');
    expect(result.data).toHaveProperty('timestamp');
    expect(result.data).toHaveProperty('pathCount');
    expect(result.data).toHaveProperty('aisTargetCount');
    expect(result.data).toHaveProperty('activeAlarmCount');
    
    expect(typeof result.data.connected).toBe('boolean');
    expect(typeof result.data.hostname).toBe('string');
    expect(typeof result.data.port).toBe('number');
    expect(typeof result.data.pathCount).toBe('number');
  });

  test('should test get_vessel_state tool', async () => {
    const result = await testTool('get_vessel_state');
    
    expect(result.data).toHaveProperty('connected');
    expect(result.data).toHaveProperty('context');
    expect(result.data).toHaveProperty('data');
    expect(result.data).toHaveProperty('timestamp');
    
    expect(typeof result.data.connected).toBe('boolean');
    expect(typeof result.data.context).toBe('string');
    expect(typeof result.data.data).toBe('object');
    expect(result.data.context).toBe('vessels.self');
  });

  test('should test get_ais_targets tool', async () => {
    const result = await testTool('get_ais_targets');
    
    expect(result.data).toHaveProperty('connected');
    expect(result.data).toHaveProperty('count');
    expect(result.data).toHaveProperty('targets');
    expect(result.data).toHaveProperty('timestamp');
    
    expect(typeof result.data.connected).toBe('boolean');
    expect(typeof result.data.count).toBe('number');
    expect(Array.isArray(result.data.targets)).toBe(true);
    expect(result.data.count).toBe(result.data.targets.length);
  });

  test('should test get_active_alarms tool', async () => {
    const result = await testTool('get_active_alarms');
    
    expect(result.data).toHaveProperty('connected');
    expect(result.data).toHaveProperty('count');
    expect(result.data).toHaveProperty('alarms');
    expect(result.data).toHaveProperty('timestamp');
    
    expect(typeof result.data.connected).toBe('boolean');
    expect(typeof result.data.count).toBe('number');
    expect(Array.isArray(result.data.alarms)).toBe(true);
    expect(result.data.count).toBe(result.data.alarms.length);
  });

  test('should test list_available_paths tool', async () => {
    const result = await testTool('list_available_paths');
    
    expect(result.data).toHaveProperty('connected');
    expect(result.data).toHaveProperty('count');
    expect(result.data).toHaveProperty('paths');
    expect(result.data).toHaveProperty('timestamp');
    
    expect(typeof result.data.connected).toBe('boolean');
    expect(typeof result.data.count).toBe('number');
    expect(Array.isArray(result.data.paths)).toBe(true);
    
    // Paths should be sorted
    const sortedPaths = [...result.data.paths].sort();
    expect(result.data.paths).toEqual(sortedPaths);
  });

  test('should test get_path_value tool with navigation.position', async () => {
    const result = await testTool('get_path_value', { path: 'navigation.position' });
    
    expect(result.data).toHaveProperty('connected');
    expect(result.data).toHaveProperty('path');
    expect(result.data).toHaveProperty('data');
    expect(result.data).toHaveProperty('timestamp');
    
    expect(result.data.path).toBe('navigation.position');
    expect(typeof result.data.connected).toBe('boolean');
    
    // Data might be null if no cached value exists
    if (result.data.data !== null) {
      expect(typeof result.data.data).toBe('object');
    }
  });

  test('should test get_path_value tool with invalid path', async () => {
    const result = await testTool('get_path_value', { path: 'invalid.nonexistent.path' });
    
    expect(result.data).toHaveProperty('connected');
    expect(result.data).toHaveProperty('path');
    expect(result.data).toHaveProperty('data');
    expect(result.data).toHaveProperty('timestamp');
    expect(result.data).toHaveProperty('error');
    
    expect(result.data.path).toBe('invalid.nonexistent.path');
    expect(result.data.data).toBe(null);
    expect(typeof result.data.error).toBe('string');
  });

  test('should verify all tools have consistent response format', async () => {
    const toolNames = [
      'get_connection_status',
      'get_vessel_state', 
      'get_ais_targets',
      'get_active_alarms',
      'list_available_paths'
    ];

    for (const toolName of toolNames) {
      const result = testResults[toolName];
      
      expect(result.success).toBe(true);
      expect(result.hasTimestamp).toBe(true);
      expect(result.dataKeys).toContain('connected');
      expect(result.dataKeys).toContain('timestamp');
    }
  });
}, 60000); // 60 second timeout for the entire suite
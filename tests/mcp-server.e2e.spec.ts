/**
 * MCP Server End-to-End Tests
 * 
 * Tests the complete MCP server functionality by spawning the actual server
 * and communicating with it via the MCP protocol.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { spawn, ChildProcess } from 'child_process';
import { createInterface, Interface } from 'readline';

describe('MCP Server E2E Tests', () => {
  let server: ChildProcess;
  let rl: Interface;
  let responses: any[] = [];

  beforeAll(async () => {
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
        // Ignore non-JSON lines (like error messages)
      }
    });

    // Wait a bit for server to start
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  afterAll(async () => {
    if (server) {
      server.kill('SIGTERM');
      rl?.close();
    }
  });

  const sendRequest = async (request: any): Promise<any> => {
    const initialResponseCount = responses.length;
    
    // Send the request
    server.stdin!.write(JSON.stringify(request) + '\n');
    
    // Wait for response
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Request timeout'));
      }, 5000);

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

  test('should initialize MCP server', async () => {
    const initRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {
          roots: { listChanged: true },
          sampling: {}
        },
        clientInfo: {
          name: 'test-client',
          version: '1.0.0'
        }
      }
    };

    const response = await sendRequest(initRequest);
    
    expect(response.id).toBe(1);
    expect(response.result).toBeDefined();
    expect(response.result.capabilities).toBeDefined();
  });

  test('should list available tools', async () => {
    const listToolsRequest = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {}
    };

    const response = await sendRequest(listToolsRequest);
    
    expect(response.id).toBe(2);
    expect(response.result).toBeDefined();
    expect(response.result.tools).toBeDefined();
    expect(Array.isArray(response.result.tools)).toBe(true);
    
    // Check that expected tools are present
    const toolNames = response.result.tools.map((tool: any) => tool.name);
    expect(toolNames).toContain('get_vessel_state');
    expect(toolNames).toContain('get_ais_targets');
    expect(toolNames).toContain('get_active_alarms');
    expect(toolNames).toContain('list_available_paths');
    expect(toolNames).toContain('get_path_value');
    expect(toolNames).toContain('get_connection_status');
  });

  test('should execute get_connection_status tool', async () => {
    const toolCallRequest = {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'get_connection_status',
        arguments: {}
      }
    };

    const response = await sendRequest(toolCallRequest);
    
    expect(response.id).toBe(3);
    expect(response.result).toBeDefined();
    expect(response.result.content).toBeDefined();
    expect(Array.isArray(response.result.content)).toBe(true);
    expect(response.result.content[0].type).toBe('text');
    
    // Parse the response text to verify structure
    const responseData = JSON.parse(response.result.content[0].text);
    expect(responseData).toHaveProperty('connected');
    expect(responseData).toHaveProperty('hostname');
    expect(responseData).toHaveProperty('port');
    expect(responseData).toHaveProperty('timestamp');
  });

  test('should execute get_vessel_state tool', async () => {
    const toolCallRequest = {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'get_vessel_state',
        arguments: {}
      }
    };

    const response = await sendRequest(toolCallRequest);
    
    expect(response.id).toBe(4);
    expect(response.result).toBeDefined();
    expect(response.result.content).toBeDefined();
    
    const responseData = JSON.parse(response.result.content[0].text);
    expect(responseData).toHaveProperty('connected');
    expect(responseData).toHaveProperty('context');
    expect(responseData).toHaveProperty('data');
    expect(responseData).toHaveProperty('timestamp');
  });

  test('should execute list_available_paths tool', async () => {
    const toolCallRequest = {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: {
        name: 'list_available_paths',
        arguments: {}
      }
    };

    const response = await sendRequest(toolCallRequest);
    
    expect(response.id).toBe(5);
    expect(response.result).toBeDefined();
    
    const responseData = JSON.parse(response.result.content[0].text);
    expect(responseData).toHaveProperty('connected');
    expect(responseData).toHaveProperty('count');
    expect(responseData).toHaveProperty('paths');
    expect(responseData).toHaveProperty('timestamp');
    expect(Array.isArray(responseData.paths)).toBe(true);
  });

  test('should handle unknown tool gracefully', async () => {
    const toolCallRequest = {
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: {
        name: 'unknown_tool',
        arguments: {}
      }
    };

    const response = await sendRequest(toolCallRequest);
    
    expect(response.id).toBe(6);
    expect(response.error).toBeDefined();
    expect(response.error.code).toBe(-32601); // Method not found
  });
}, 30000); // 30 second timeout for the entire suite
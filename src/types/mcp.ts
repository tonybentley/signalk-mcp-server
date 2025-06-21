/**
 * MCP (Model Context Protocol) Types
 * 
 * Types related to the MCP server implementation
 */

export interface MCPToolResponse {
  content: Array<{
    type: string;
    text: string;
  }>;
}

export interface MCPToolRequest {
  name: string;
  arguments?: Record<string, any>;
}

export interface MCPServerCapabilities {
  tools: Record<string, any>;
  resources: Record<string, any>;
}

export interface MCPServerInfo {
  name: string;
  version: string;
}

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties?: Record<string, any>;
    required?: string[];
  };
}
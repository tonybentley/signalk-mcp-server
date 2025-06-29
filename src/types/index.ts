/**
 * Types Index
 *
 * Single export point for all types and interfaces used throughout the application.
 * This allows for clean imports like: import { SignalKClientOptions, AISTarget } from '@/types'
 */

// SignalK Protocol Types
export * from './signalk';

// Domain Interfaces
export * from './interfaces';

// MCP Protocol Types
export * from './mcp';

// Re-export commonly used type combinations for convenience
export type {
  SignalKClientOptions,
  SignalKValue,
  SignalKDelta,
  SignalKSource,
  SignalKValueUpdate,
  SignalKUpdate,
} from './signalk';

export type {
  AISTarget,
  ActiveAlarm,
  VesselState,
  AISTargetsResponse,
  ActiveAlarmsResponse,
  AvailablePathsResponse,
  PathValueResponse,
  ConnectionStatus,
} from './interfaces';

export type {
  MCPToolResponse,
  MCPToolDefinition,
  MCPServerInfo,
  MCPToolRequest,
  MCPServerCapabilities,
  MCPResource,
  MCPResourceContent,
} from './mcp';

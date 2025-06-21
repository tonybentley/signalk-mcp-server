/**
 * Domain Interfaces
 * 
 * Business logic interfaces for the SignalK MCP server
 */

export interface AISTarget {
  mmsi: string;
  lastUpdate: string;
  [key: string]: any;
}

export interface ActiveAlarm {
  path: string;
  state: string;
  message: string;
  timestamp?: string;
}

export interface VesselState {
  connected: boolean;
  context: string;
  data: Record<string, any>;
  timestamp: string;
}

export interface AISTargetsResponse {
  connected: boolean;
  count: number;
  targets: AISTarget[];
  timestamp: string;
}

export interface ActiveAlarmsResponse {
  connected: boolean;
  count: number;
  alarms: ActiveAlarm[];
  timestamp: string;
}

export interface ConnectionStatus {
  connected: boolean;
  url: string;
  wsUrl: string;
  httpUrl: string;
  hostname: string;
  port: number;
  useTLS: boolean;
  context: string;
  pathCount: number;
  aisTargetCount: number;
  activeAlarmCount: number;
  timestamp: string;
}

export interface AvailablePathsResponse {
  connected: boolean;
  count: number;
  paths: string[];
  timestamp: string;
  error?: string;
}

export interface PathValueResponse {
  connected: boolean;
  path: string;
  data: any;
  timestamp: string;
  error?: string;
}
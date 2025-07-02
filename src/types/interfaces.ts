/**
 * Domain Interfaces
 *
 * Business logic interfaces for the SignalK MCP server
 */

export interface AISTarget {
  mmsi: string;
  lastUpdate: string;
  distanceMeters?: number; // Distance in meters from self vessel (optional)
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
  error?: string;
}

export interface AISTargetsResponse {
  connected: boolean;
  count: number;
  targets: AISTarget[];
  timestamp: string;
  error?: string;
  pagination?: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export interface ActiveAlarmsResponse {
  connected: boolean;
  count: number;
  alarms: ActiveAlarm[];
  timestamp: string;
  error?: string;
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

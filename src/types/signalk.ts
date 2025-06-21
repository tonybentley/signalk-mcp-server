/**
 * SignalK Protocol Types
 * 
 * Types and interfaces related to the SignalK marine data protocol
 */

export interface SignalKClientOptions {
  hostname?: string;
  port?: number | string;
  useTLS?: boolean;
  token?: string;
  context?: string;
}

export interface SignalKValue {
  value: any;
  timestamp: string;
  source?: {
    label: string;
    type: string;
  };
  meta?: any;
}

export interface SignalKDelta {
  context: string;
  updates: Array<{
    timestamp: string;
    source: {
      label: string;
      type: string;
    };
    values: Array<{
      path: string;
      value: any;
    }>;
  }>;
}

export interface SignalKSource {
  label: string;
  type: string;
}

export interface SignalKValueUpdate {
  path: string;
  value: any;
}

export interface SignalKUpdate {
  timestamp: string;
  source: SignalKSource;
  values: SignalKValueUpdate[];
}
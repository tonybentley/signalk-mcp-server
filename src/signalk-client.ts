import { Client } from '@signalk/client';
import { EventEmitter } from 'events';
import type {
  SignalKClientOptions,
  SignalKValue,
  SignalKDelta,
  AISTarget,
  ActiveAlarm,
  VesselState,
  AISTargetsResponse,
  ActiveAlarmsResponse,
  ConnectionStatus,
  AvailablePathsResponse,
  PathValueResponse
} from './types/index.js';

export class SignalKClient extends EventEmitter {
  public hostname!: string;
  public port!: number;
  public useTLS!: boolean;
  public originalUrl!: string;
  public context: string;
  public connected: boolean;
  public latestValues: Map<string, SignalKValue>;
  public availablePaths: Set<string>;
  public aisTargets: Map<string, AISTarget>;
  public activeAlarms: Map<string, ActiveAlarm>;
  private client: any;

  constructor(options: SignalKClientOptions = {}) {
    super();
    
    // Set SignalK connection configuration directly from environment variables
    this.setSignalKConfig(options);
    
    this.client = new Client({
      hostname: this.hostname,
      port: this.port,
      useTLS: this.useTLS,
      reconnect: true,
      autoConnect: false,
      notifications: true,
      token: options.token || process.env.SIGNALK_TOKEN,
      subscribe: 'all',
      useHttp: false,
      subscriptions: [
        {
          context: '*',
          subscribe: [
            {
              path: '*',
              period: 1000,
              format: 'delta',
              policy: 'ideal',
              minPeriod: 200
            }
          ]
        }
      ]
    });
    
    this.context = options.context || process.env.SIGNALK_CONTEXT || 'vessels.self';
    this.connected = false;
    this.latestValues = new Map();
    this.availablePaths = new Set();
    this.aisTargets = new Map();
    this.activeAlarms = new Map();
    
    this.setupEventHandlers();
  }

  /**
   * Set SignalK connection configuration from environment variables with sensible defaults
   * 
   * Environment Variables:
   * - SIGNALK_HOST: Hostname/IP (default: 'localhost')
   * - SIGNALK_PORT: Port number (default: 3000)
   * - SIGNALK_TLS: Use secure connections - true/false (default: false)
   * 
   * Sets instance properties:
   * - hostname: The server hostname/IP (e.g., 'localhost', '192.168.1.100')
   * - port: The server port (e.g., 3000, 443, 80)
   * - useTLS: Whether to use secure connections (WSS/HTTPS vs WS/HTTP)
   * 
   * @param options - Override options
   */
  setSignalKConfig(options: SignalKClientOptions = {}): void {
    // Set configuration directly from environment variables with defaults
    this.hostname = options.hostname || process.env.SIGNALK_HOST || 'localhost';
    const portValue = parseInt(String(options.port || process.env.SIGNALK_PORT || '3000'));
    this.port = isNaN(portValue) ? 3000 : portValue;
    this.useTLS = options.useTLS || process.env.SIGNALK_TLS === 'true' || false;
    
    // Build original URL for display purposes
    const protocol = this.useTLS ? 'wss://' : 'ws://';
    this.originalUrl = `${protocol}${this.hostname}:${this.port}`;
  }

  /**
   * Build WebSocket URL for streaming connections
   * @returns WebSocket URL (ws:// or wss://)
   */
  buildWebSocketUrl(): string {
    const protocol = this.useTLS ? 'wss:' : 'ws:';
    const port = (this.port === (this.useTLS ? 443 : 80)) ? '' : `:${this.port}`;
    return `${protocol}//${this.hostname}${port}`;
  }

  /**
   * Build HTTP URL for REST API calls
   * @returns HTTP URL (http:// or https://)
   */
  buildHttpUrl(): string {
    const protocol = this.useTLS ? 'https:' : 'http:';
    const port = (this.port === (this.useTLS ? 443 : 80)) ? '' : `:${this.port}`;
    return `${protocol}//${this.hostname}${port}`;
  }

  /**
   * Build SignalK REST API URL for a specific vessel and path
   * @param vesselContext - Vessel context (e.g., 'self', 'urn:mrn:imo:mmsi:123456789')
   * @param path - SignalK path in dot notation (e.g., 'navigation.position')
   * @returns Complete REST API URL
   */
  buildRestApiUrl(vesselContext: string = 'self', path: string = ''): string {
    const baseUrl = this.buildHttpUrl();
    const restPath = path ? `/${path.replace(/\./g, '/')}` : '';
    return `${baseUrl}/signalk/v1/api/vessels/${vesselContext}${restPath}`;
  }

  setupEventHandlers(): void {
    this.client.on('connect', () => {
      this.connected = true;
      console.error('SignalK client connected');
      this.emit('connected');
    });

    this.client.on('disconnect', () => {
      this.connected = false;
      console.error('SignalK client disconnected');
      this.emit('disconnected');
    });

    this.client.on('error', (error: any) => {
      console.error('SignalK client error:', error);
      this.emit('error', error);
    });

    this.client.on('delta', (delta: any) => {
      this.handleDelta(delta);
    });
  }


  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.connected) {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 10000);

      this.client.once('connect', () => {
        clearTimeout(timeout);
        resolve();
      });

      this.client.once('error', (error: any) => {
        clearTimeout(timeout);
        reject(error);
      });

      this.client.connect();
    });
  }

  handleDelta(delta: SignalKDelta): void {
    try {
      if (delta.updates) {
        this.processUpdates(delta);
      }
      this.emit('delta', delta);
    } catch (error) {
      console.error('Error processing delta:', error);
    }
  }

  processUpdates(message: SignalKDelta): void {
    const context = message.context || this.context;
    
    message.updates.forEach(update => {
      if (update.values) {
        update.values.forEach(value => {
          const fullPath = `${context}.${value.path}`;
          
          this.latestValues.set(fullPath, {
            value: value.value,
            timestamp: update.timestamp || new Date().toISOString(),
            source: update.source
          });
          
          this.availablePaths.add(value.path);
          
          if (context.startsWith('vessels.') && context !== this.context) {
            this.updateAISTarget(context, value.path, value.value, update.timestamp);
          }
          
          if (value.path.startsWith('notifications.')) {
            this.updateAlarms(value.path, value.value, update.timestamp);
          }
        });
      }
    });
  }

  updateAISTarget(vesselContext: string, path: string, value: any, timestamp: string): void {
    const vesselId = vesselContext.replace('vessels.', '');
    
    if (!this.aisTargets.has(vesselId)) {
      this.aisTargets.set(vesselId, {
        mmsi: vesselId,
        lastUpdate: timestamp
      });
    }
    
    const target = this.aisTargets.get(vesselId);
    if (target) {
      target[path] = value;
      target.lastUpdate = timestamp;
    }
  }

  updateAlarms(path: string, value: any, timestamp: string): void {
    if (value && value.state && value.state !== 'normal') {
      this.activeAlarms.set(path, {
        path,
        state: value.state,
        message: value.message,
        timestamp
      });
    } else {
      this.activeAlarms.delete(path);
    }
  }


  getVesselState(): VesselState {
    const state: any = {};
    
    // Dynamically get all available paths for this vessel context
    for (const [fullPath, signalKValue] of this.latestValues.entries()) {
      // Only include paths for the current vessel context
      if (fullPath.startsWith(this.context + '.')) {
        // Extract the path without the context prefix
        const path = fullPath.substring(this.context.length + 1);
        state[path] = signalKValue;
      }
    }

    return {
      connected: this.connected,
      context: this.context,
      data: state,
      timestamp: new Date().toISOString()
    };
  }

  getAISTargets(): AISTargetsResponse {
    const targets = Array.from(this.aisTargets.values())
      .filter(target => {
        const age = Date.now() - new Date(target.lastUpdate).getTime();
        return age < 300000; // 5 minutes
      })
      .slice(0, 50); // Limit to 50 targets

    return {
      connected: this.connected,
      count: targets.length,
      targets,
      timestamp: new Date().toISOString()
    };
  }

  getActiveAlarms(): ActiveAlarmsResponse {
    return {
      connected: this.connected,
      count: this.activeAlarms.size,
      alarms: Array.from(this.activeAlarms.values()),
      timestamp: new Date().toISOString()
    };
  }

  async listAvailablePaths(): Promise<AvailablePathsResponse> {
    const paths = new Set<string>();
    
    try {
      // Use helper method to build REST API URL
      const apiUrl = this.buildRestApiUrl('self');
      
      const response = await fetch(apiUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Recursively extract all paths from the data
      const extractPaths = (obj: any, prefix = '') => {
        for (const [key, value] of Object.entries(obj)) {
          // Skip metadata fields
          if (key.startsWith('$') || key === 'meta' || key === 'timestamp') {
            continue;
          }
          
          const currentPath = prefix ? `${prefix}.${key}` : key;
          
          // If this object has a 'value' property, it's a data point
          if (value && typeof value === 'object' && 'value' in value) {
            paths.add(currentPath);
          }
          // If it's an object without 'value', recurse deeper
          else if (value && typeof value === 'object' && !Array.isArray(value)) {
            extractPaths(value, currentPath);
          }
        }
      };
      
      extractPaths(data);
      
      return {
        connected: this.connected,
        count: paths.size,
        paths: Array.from(paths).sort(),
        timestamp: new Date().toISOString()
      };
      
    } catch (error: any) {
      console.error('Failed to fetch paths via HTTP:', error.message);
      
      // Fallback to WebSocket-discovered paths
      return {
        connected: this.connected,
        count: this.availablePaths.size,
        paths: Array.from(this.availablePaths).sort(),
        timestamp: new Date().toISOString(),
        error: `HTTP fetch failed: ${error.message}, using WebSocket-discovered paths`
      };
    }
  }

  async getPathValue(path: string): Promise<PathValueResponse> {
    try {
      // Use helper method to build REST API URL for the specific path
      const apiUrl = this.buildRestApiUrl('self', path);
      
      const response = await fetch(apiUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      return {
        connected: this.connected,
        path,
        data: data,
        timestamp: new Date().toISOString()
      };
      
    } catch (error: any) {
      console.error(`Failed to fetch path ${path} via HTTP:`, error.message);
      
      // Fallback to WebSocket-cached value
      const fullPath = `${this.context}.${path}`;
      const cachedData = this.latestValues.get(fullPath);
      
      return {
        connected: this.connected,
        path,
        data: cachedData || null,
        timestamp: new Date().toISOString(),
        error: `HTTP fetch failed: ${error.message}, using cached value`
      };
    }
  }

  getConnectionStatus(): ConnectionStatus {
    return {
      connected: this.connected,
      url: this.originalUrl,
      wsUrl: this.buildWebSocketUrl(),
      httpUrl: this.buildHttpUrl(),
      hostname: this.hostname,
      port: this.port,
      useTLS: this.useTLS,
      context: this.context,
      pathCount: this.availablePaths.size,
      aisTargetCount: this.aisTargets.size,
      activeAlarmCount: this.activeAlarms.size,
      timestamp: new Date().toISOString()
    };
  }

  disconnect(): void {
    this.client.disconnect();
    this.connected = false;
  }
}
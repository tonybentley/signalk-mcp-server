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

  /**
   * Sets up WebSocket event handlers for connection, disconnection, errors, and delta messages
   * 
   * Event handlers:
   * - 'connect': Sets connected flag and emits 'connected' event
   * - 'disconnect': Clears connected flag and emits 'disconnected' event  
   * - 'error': Logs errors and emits 'error' event
   * - 'delta': Processes incoming SignalK delta messages with vessel data updates
   * 
   * @example
   * const client = new SignalKClient();
   * client.on('connected', () => console.log('Connected to SignalK'));
   * client.on('delta', (delta) => console.log('Received data:', delta));
   */
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


  /**
   * Establishes WebSocket connection to SignalK server with timeout handling
   * 
   * Features:
   * - Promise-based connection with 10-second timeout
   * - Prevents duplicate connections if already connected
   * - Automatic error handling and cleanup
   * - Subscribes to all vessel data paths upon connection
   * 
   * @returns Promise that resolves when connected or rejects on error/timeout
   * 
   * @example
   * const client = new SignalKClient({ hostname: 'localhost', port: 3000 });
   * try {
   *   await client.connect();
   *   console.log('Connected successfully');
   * } catch (error) {
   *   console.error('Connection failed:', error);
   * }
   */
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

  /**
   * Processes incoming SignalK delta messages and updates internal data stores
   * 
   * Delta message processing:
   * - Updates latest values cache with timestamps
   * - Tracks AIS targets from other vessels
   * - Monitors system notifications and alarms
   * - Discovers available data paths automatically
   * - Emits 'delta' event for external listeners
   * 
   * @param delta - SignalK delta message with vessel updates
   * 
   * @example
   * // Delta messages are received automatically via WebSocket
   * client.on('delta', (delta) => {
   *   console.log('Vessel context:', delta.context);
   *   console.log('Updates:', delta.updates);
   * });
   */
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

  /**
   * Processes individual value updates from SignalK delta messages
   * 
   * Update processing:
   * - Stores latest values with full path keys (context.path)
   * - Maintains set of available data paths
   * - Updates AIS target data for other vessels
   * - Processes notification/alarm state changes
   * - Preserves timestamps and source information
   * 
   * @param message - SignalK delta message containing updates array
   * 
   * @example
   * // Updates are processed automatically from delta messages:
   * // {
   * //   "context": "vessels.self",
   * //   "updates": [{
   * //     "timestamp": "2023-06-22T10:30:15Z",
   * //     "values": [{
   * //       "path": "navigation.position",
   * //       "value": {"latitude": 37.8199, "longitude": -122.4783}
   * //     }]
   * //   }]
   * // }
   */
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

  /**
   * Updates AIS target information for other vessels detected in the area
   * 
   * AIS data tracking:
   * - Creates new target entries for unknown vessels
   * - Updates existing targets with latest position/course/speed data
   * - Maintains MMSI identifier and last update timestamp
   * - Supports any SignalK path (position, course, speed, name, etc.)
   * 
   * @param vesselContext - Vessel context (e.g., 'vessels.urn:mrn:imo:mmsi:123456789')
   * @param path - SignalK data path (e.g., 'navigation.position')
   * @param value - The data value for this path
   * @param timestamp - ISO timestamp of the update
   * 
   * @example
   * // AIS targets are updated automatically from delta messages:
   * // Context: "vessels.urn:mrn:imo:mmsi:123456789"
   * // Path: "navigation.position"
   * // Value: {"latitude": 37.8200, "longitude": -122.4800}
   * 
   * const targets = client.getAISTargets();
   * console.log('Nearby vessels:', targets.targets.length);
   */
  updateAISTarget(vesselContext: string, path: string, value: any, timestamp: string): void {
    // Only process vessels with proper MMSI format (AIS targets)
    // Example: "vessels.urn:mrn:imo:mmsi:123456789"
    const mmsiMatch = vesselContext.match(/urn:mrn:imo:mmsi:(\d+)/);
    if (!mmsiMatch) {
      // Skip non-MMSI vessels (UUID-based vessels, other formats)
      return;
    }
    
    const mmsi = mmsiMatch[1]; // Extract the MMSI number
    const vesselId = vesselContext.replace('vessels.', '');
    
    if (!this.aisTargets.has(vesselId)) {
      this.aisTargets.set(vesselId, {
        mmsi: mmsi, // Use the extracted MMSI number
        lastUpdate: timestamp
      });
    }
    
    const target = this.aisTargets.get(vesselId);
    if (target) {
      target[path] = value;
      target.lastUpdate = timestamp;
    }
  }

  /**
   * Updates active alarm and notification states from SignalK notification paths
   * 
   * Alarm processing:
   * - Adds alarms when state is not 'normal' (alert, warn, alarm, emergency)
   * - Removes alarms when state returns to 'normal' or null
   * - Preserves alarm message and metadata
   * - Tracks timestamp of alarm state changes
   * 
   * @param path - Notification path (e.g., 'notifications.engines.temperature')
   * @param value - Notification object with state and message
   * @param timestamp - ISO timestamp of the notification
   * 
   * @example
   * // Alarms are updated automatically from notification paths:
   * // Path: "notifications.engines.temperature"
   * // Value: {
   * //   "state": "alert",
   * //   "message": "Engine temperature high",
   * //   "method": ["visual", "sound"]
   * // }
   * 
   * const alarms = client.getActiveAlarms();
   * console.log('Active alarms:', alarms.count);
   */
  updateAlarms(path: string, value: any, timestamp: string): void {
    if (value && value.state) {
      this.activeAlarms.set(path, {
        path,
        state: value.state,
        message: value.message,
        timestamp
      });
    } else if (value === null || value === undefined) {
      // Only delete if value is truly null/undefined (path no longer exists)
      this.activeAlarms.delete(path);
    }
    // Keep alarms in normal state - do not delete them
  }


  /**
   * Returns current vessel state with all available sensor data and navigation information
   * 
   * Vessel state includes:
   * - All SignalK paths for the current vessel context (vessels.self by default)
   * - Position, heading, speed, wind, engine data, etc.
   * - Latest values with timestamps and source information
   * - Connection status and context information
   * 
   * @returns VesselState object with dynamic data structure based on available sensors
   * 
   * @example
   * const state = client.getVesselState();
   * console.log('Position:', state.data['navigation.position']);
   * console.log('Speed:', state.data['navigation.speedOverGround']);
   * console.log('Wind:', state.data['environment.wind']);
   * console.log('Connected:', state.connected);
   * 
   * // Example response:
   * // {
   * //   "connected": true,
   * //   "context": "vessels.self",
   * //   "timestamp": "2023-06-22T10:30:15.123Z",
   * //   "data": {
   * //     "navigation.position": {
   * //       "value": {"latitude": 37.8199, "longitude": -122.4783},
   * //       "timestamp": "2023-06-22T10:30:15.000Z",
   * //       "source": {"label": "GPS1", "type": "NMEA0183"}
   * //     },
   * //     "navigation.speedOverGround": {
   * //       "value": 5.2,
   * //       "timestamp": "2023-06-22T10:30:15.000Z"
   * //     }
   * //   }
   * // }
   */
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

  /**
   * Returns nearby AIS targets (other vessels) with their position and navigation data
   * 
   * AIS target filtering:
   * - Only includes targets updated within last 5 minutes
   * - Limits results to 50 targets to prevent overwhelming responses
   * - Includes MMSI, position, course, speed, vessel name if available
   * - Automatically removes stale targets
   * 
   * @returns AISTargetsResponse with array of nearby vessels
   * 
   * @example
   * const targets = client.getAISTargets();
   * console.log(`Found ${targets.count} nearby vessels`);
   * 
   * targets.targets.forEach(target => {
   *   console.log(`MMSI: ${target.mmsi}`);
   *   if (target['navigation.position']) {
   *     console.log(`Position: ${target['navigation.position'].latitude}, ${target['navigation.position'].longitude}`);
   *   }
   *   if (target['navigation.courseOverGround']) {
   *     console.log(`Course: ${target['navigation.courseOverGround']}°`);
   *   }
   * });
   * 
   * // Example response:
   * // {
   * //   "connected": true,
   * //   "count": 2,
   * //   "timestamp": "2023-06-22T10:30:15.123Z",
   * //   "targets": [
   * //     {
   * //       "mmsi": "123456789",
   * //       "navigation.position": {"latitude": 37.8200, "longitude": -122.4800},
   * //       "navigation.courseOverGround": 45.0,
   * //       "navigation.speedOverGround": 8.5,
   * //       "lastUpdate": "2023-06-22T10:29:45.000Z"
   * //     }
   * //   ]
   * // }
   */
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

  /**
   * Returns all alarms and system notifications including resolved (normal state) alarms
   * 
   * Alarm states:
   * - 'alert': General warning condition
   * - 'warn': Warning that requires attention
   * - 'alarm': Alarm condition requiring immediate attention
   * - 'emergency': Emergency condition requiring immediate action
   * - 'normal': Previously active alarm now resolved (provides audit trail)
   * 
   * Note: This method now includes alarms in 'normal' state to provide complete
   * alarm history and audit trail. Use filtering if you need only critical alarms.
   * 
   * @returns ActiveAlarmsResponse with array of all notifications (including normal)
   * 
   * @example
   * const alarms = client.getActiveAlarms();
   * console.log(`${alarms.count} total alarms (including resolved)`);
   * 
   * // Filter for only critical alarms
   * const criticalAlarms = alarms.alarms.filter(alarm => 
   *   alarm.state !== 'normal'
   * );
   * console.log(`${criticalAlarms.length} critical alarms`);
   * 
   * alarms.alarms.forEach(alarm => {
   *   console.log(`${alarm.state}: ${alarm.message || 'No message'}`);
   *   console.log(`Path: ${alarm.path}`);
   *   console.log(`Time: ${alarm.timestamp}`);
   * });
   * 
   * // Example response:
   * // {
   * //   "connected": true,
   * //   "count": 2,
   * //   "timestamp": "2023-06-22T10:30:15.123Z",
   * //   "alarms": [
   * //     {
   * //       "path": "notifications.engines.temperature",
   * //       "state": "normal",
   * //       "message": "Engine temperature normal",
   * //       "timestamp": "2023-06-22T10:25:30.000Z"
   * //     },
   * //     {
   * //       "path": "notifications.battery.voltage",
   * //       "state": "alert",
   * //       "message": "Battery voltage low",
   * //       "timestamp": "2023-06-22T10:28:45.000Z"
   * //     }
   * //   ]
   * // }
   */
  getActiveAlarms(): ActiveAlarmsResponse {
    return {
      connected: this.connected,
      count: this.activeAlarms.size,
      alarms: Array.from(this.activeAlarms.values()),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Discovers and returns all available SignalK data paths on the server
   * 
   * Path discovery:
   * - Primary: Uses HTTP REST API to get complete path list from server
   * - Fallback: Uses WebSocket-discovered paths if HTTP fails
   * - Filters out metadata fields ($schema, meta, timestamp)
   * - Returns sorted alphabetical list of available data paths
   * 
   * @returns Promise<AvailablePathsResponse> with array of available paths
   * 
   * @example
   * const pathsResponse = await client.listAvailablePaths();
   * console.log(`${pathsResponse.count} paths available`);
   * 
   * pathsResponse.paths.forEach(path => {
   *   console.log(`Available: ${path}`);
   * });
   * 
   * // Example response:
   * // {
   * //   "connected": true,
   * //   "count": 25,
   * //   "timestamp": "2023-06-22T10:30:15.123Z",
   * //   "paths": [
   * //     "electrical.batteries.house.voltage",
   * //     "environment.wind.speedApparent",
   * //     "navigation.courseOverGround",
   * //     "navigation.position",
   * //     "navigation.speedOverGround",
   * //     "propulsion.main.temperature"
   * //   ]
   * // }
   */
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

  /**
   * Gets the latest value for a specific SignalK data path
   * 
   * Value retrieval:
   * - Primary: Uses HTTP REST API for real-time data from server
   * - Fallback: Uses WebSocket-cached value if HTTP fails
   * - Returns complete value object with metadata
   * - Supports any valid SignalK path
   * 
   * @param path - SignalK data path in dot notation (e.g., 'navigation.position')
   * @returns Promise<PathValueResponse> with latest value and metadata
   * 
   * @example
   * // Get current position
   * const position = await client.getPathValue('navigation.position');
   * console.log('Latitude:', position.data.value.latitude);
   * console.log('Longitude:', position.data.value.longitude);
   * 
   * // Get wind speed
   * const windSpeed = await client.getPathValue('environment.wind.speedApparent');
   * console.log('Wind speed:', windSpeed.data.value, 'm/s');
   * 
   * // Get engine temperature
   * const engineTemp = await client.getPathValue('propulsion.main.temperature');
   * console.log('Engine temp:', engineTemp.data.value, 'K');
   * 
   * // Example response:
   * // {
   * //   "connected": true,
   * //   "path": "navigation.position",
   * //   "timestamp": "2023-06-22T10:30:15.123Z",
   * //   "data": {
   * //     "value": {
   * //       "latitude": 37.8199,
   * //       "longitude": -122.4783
   * //     },
   * //     "timestamp": "2023-06-22T10:30:15.000Z",
   * //     "source": {
   * //       "label": "GPS1",
   * //       "type": "NMEA0183"
   * //     }
   * //   }
   * // }
   */
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

  /**
   * Returns comprehensive connection status and client configuration information
   * 
   * Status information:
   * - WebSocket connection state
   * - Server URLs (WebSocket and HTTP)
   * - Configuration details (hostname, port, TLS)
   * - Data cache statistics (paths, AIS targets, alarms)
   * - Vessel context being monitored
   * 
   * @returns ConnectionStatus object with detailed connection information
   * 
   * @example
   * const status = client.getConnectionStatus();
   * console.log('Connected:', status.connected);
   * console.log('Server:', status.hostname + ':' + status.port);
   * console.log('TLS:', status.useTLS);
   * console.log('Paths discovered:', status.pathCount);
   * console.log('AIS targets:', status.aisTargetCount);
   * console.log('Active alarms:', status.activeAlarmCount);
   * 
   * // Example response:
   * // {
   * //   "connected": true,
   * //   "url": "ws://localhost:3000",
   * //   "wsUrl": "ws://localhost:3000",
   * //   "httpUrl": "http://localhost:3000",
   * //   "hostname": "localhost",
   * //   "port": 3000,
   * //   "useTLS": false,
   * //   "context": "vessels.self",
   * //   "pathCount": 25,
   * //   "aisTargetCount": 3,
   * //   "activeAlarmCount": 1,
   * //   "timestamp": "2023-06-22T10:30:15.123Z"
   * // }
   */
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

  /**
   * Cleanly disconnects from the SignalK server and cleans up resources
   * 
   * Disconnect process:
   * - Closes WebSocket connection
   * - Sets connected flag to false
   * - Preserves cached data for potential reconnection
   * - Emits 'disconnected' event
   * 
   * @example
   * // Disconnect when done
   * client.disconnect();
   * console.log('Disconnected from SignalK server');
   * 
   * // Listen for disconnect events
   * client.on('disconnected', () => {
   *   console.log('SignalK connection closed');
   * });
   */
  disconnect(): void {
    this.client.disconnect();
    this.connected = false;
  }
}
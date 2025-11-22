import { SignalKClient } from '../signalk-client.js';
import type {
  VesselState,
  AISTargetsResponse,
  ActiveAlarmsResponse,
  AvailablePathsResponse,
  PathValueResponse,
  ConnectionStatus,
} from '../types/index.js';

/**
 * SignalK Binding - RPC-style access to SignalK server for V8 isolate code execution
 *
 * This binding wraps the existing SignalKClient and exposes its methods to agent code
 * running in V8 isolates. It follows the Cloudflare Code Mode pattern where:
 * - SignalK credentials stay in the binding layer (never exposed to agent code)
 * - Agent code calls async methods via RPC across isolate boundary
 * - Data filtering happens in isolate before returning to LLM context
 *
 * Security benefits:
 * - No SignalK tokens exposed to agent code
 * - No direct network access from isolate
 * - No filesystem access from isolate
 *
 * @example
 * // In MCP server
 * const client = new SignalKClient({ hostname: 'localhost', port: 3000 });
 * const binding = new SignalKBinding(client);
 * const sandbox = new IsolateSandbox();
 *
 * // Agent code in isolate
 * const result = await sandbox.execute(`
 *   const vessel = await signalk.getVesselState();
 *   const targets = await signalk.getAisTargets({ maxDistance: 5000 });
 *
 *   // Filter in isolate - huge token savings!
 *   const closeTargets = targets.targets.filter(t =>
 *     t.distanceMeters && t.distanceMeters < 1852
 *   );
 *
 *   console.log('Close targets:', closeTargets.length);
 *   return { count: closeTargets.length, targets: closeTargets };
 * `, { signalk: binding });
 */
export class SignalKBinding {
  constructor(private client: SignalKClient) {}

  /**
   * Get current vessel state with all available sensor data
   *
   * Returns:
   * - Position, heading, speed, wind
   * - Vessel identity (name, MMSI, call sign)
   * - All available SignalK paths
   *
   * @returns Promise<VesselState> with complete vessel data
   *
   * @example
   * // In agent code
   * const vessel = await signalk.getVesselState();
   * console.log('Position:', vessel.data['navigation.position']?.value);
   * console.log('Speed:', vessel.data['navigation.speedOverGround']?.value);
   */
  async getVesselState(): Promise<VesselState> {
    return this.client.getVesselState();
  }

  /**
   * Get nearby AIS targets (other vessels) sorted by distance
   *
   * Features:
   * - Sorted by proximity (closest first)
   * - Includes distance in meters when positions available
   * - Supports pagination
   * - Only vessels with MMSI (true AIS targets)
   * - Only targets updated within last 5 minutes
   *
   * @param options - Optional pagination and filtering
   * @param options.page - Page number (1-based, default: 1)
   * @param options.pageSize - Results per page (default: 10, max: 50)
   * @param options.maxDistance - Filter by max distance in meters (optional)
   * @returns Promise<AISTargetsResponse> with array of targets
   *
   * @example
   * // In agent code
   * const response = await signalk.getAisTargets({ maxDistance: 5000 });
   * const closeTargets = response.targets.filter(t =>
   *   t.distanceMeters && t.distanceMeters < 1852
   * );
   * console.log(`${closeTargets.length} vessels within 1nm`);
   */
  async getAisTargets(options?: {
    page?: number;
    pageSize?: number;
    maxDistance?: number;
  }): Promise<AISTargetsResponse> {
    const response = await this.client.getAISTargets(
      options?.page,
      options?.pageSize
    );

    // Apply maxDistance filter if specified
    if (options?.maxDistance && response.targets) {
      const filtered = response.targets.filter(
        (t) =>
          !t.distanceMeters || t.distanceMeters <= options.maxDistance!
      );
      return {
        ...response,
        targets: filtered,
        count: filtered.length,
      };
    }

    return response;
  }

  /**
   * Get active system alarms and notifications
   *
   * Returns all notification paths with their current state:
   * - alert: General warning
   * - warn: Requires attention
   * - alarm: Requires immediate attention
   * - emergency: Emergency situation
   * - normal: Resolved (included for tracking)
   *
   * @returns Promise<ActiveAlarmsResponse> with array of notifications
   *
   * @example
   * // In agent code
   * const response = await signalk.getActiveAlarms();
   * const critical = response.alarms.filter(a =>
   *   a.state === 'alarm' || a.state === 'emergency'
   * );
   * console.log(`${critical.length} critical alarms`);
   */
  async getActiveAlarms(): Promise<ActiveAlarmsResponse> {
    return this.client.getActiveAlarms();
  }

  /**
   * Discover all available SignalK data paths
   *
   * Returns sorted array of available paths on the SignalK server.
   * Useful for discovering what data is available before querying.
   *
   * @returns Promise<AvailablePathsResponse> with path array
   *
   * @example
   * // In agent code
   * const response = await signalk.listAvailablePaths();
   * const navPaths = response.paths.filter(p => p.startsWith('navigation.'));
   * console.log('Navigation paths:', navPaths);
   */
  async listAvailablePaths(): Promise<AvailablePathsResponse> {
    return this.client.listAvailablePaths();
  }

  /**
   * Get latest value for a specific SignalK path
   *
   * @param pathOrOptions - SignalK path as string or object with path property
   * @returns Promise<PathValueResponse> with value and metadata
   *
   * @example
   * // In agent code - both forms work:
   * const position = await signalk.getPathValue('navigation.position');
   * const position2 = await signalk.getPathValue({ path: 'navigation.position' });
   * console.log('Lat:', position.data.value.latitude);
   * console.log('Lon:', position.data.value.longitude);
   */
  async getPathValue(pathOrOptions: string | { path: string }): Promise<PathValueResponse> {
    const path = typeof pathOrOptions === 'string' ? pathOrOptions : pathOrOptions.path;
    return this.client.getPathValue(path);
  }

  /**
   * Get SignalK connection status and configuration
   *
   * Returns connection state, server URLs, and cache statistics.
   * Useful for debugging and monitoring.
   *
   * @returns ConnectionStatus with detailed info
   *
   * @example
   * // In agent code
   * const status = signalk.getConnectionStatus();
   * console.log('Connected:', status.connected);
   * console.log('Server:', status.httpUrl);
   */
  getConnectionStatus(): ConnectionStatus {
    return this.client.getConnectionStatus();
  }
}

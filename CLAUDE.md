# Claude Assistant Instructions

This file contains instructions and context for Claude when working on this project.

SignalK MCP Server - Project Scope & Configuration

## PROJECT OVERVIEW
Build a minimal MCP (Model Context Protocol) server that provides AI agents with basic access to SignalK marine data. Focus on simple, read-only operations that can be delivered in 2-3 days.

## CORE FUNCTIONALITY
- Connect to SignalK server via WebSocket
- Provide current vessel navigation data (position, heading, speed, wind)
- List nearby AIS targets (other vessels)
- Access system alarms and notifications
- Subscribe to live data streams from multiple SignalK paths
- Get latest value for any specific SignalK path
- Monitor connection status to SignalK server
- Discover available data paths on the SignalK installation

## TECHNICAL REQUIREMENTS
Runtime: Node.js
Transport: WebSocket client to SignalK server
Protocol: MCP (Model Context Protocol)
Data Format: JSON (SignalK delta messages)
Architecture: Event-driven with automatic reconnection

## EXPLICITLY OUT OF SCOPE (MVP)
- NO collision avoidance calculations
- NO route planning or navigation
- NO chart data integration
- NO device control functions (read-only only)
- NO complex analytics or historical data
- NO multi-vessel fleet management
- NO weather routing
- NO anchor watch features

## ENVIRONMENT VARIABLES

### SignalK Connection
SIGNALK_HOST=localhost                       # SignalK server hostname/IP (default: localhost)
SIGNALK_PORT=3000                            # SignalK server port (default: 3000)
SIGNALK_TLS=false                            # Use secure connections WSS/HTTPS (default: false)

### Authentication & Context
SIGNALK_TOKEN=                               # Optional authentication token
SIGNALK_CONTEXT=vessels.self                 # Default vessel context

### Connection Behavior (not yet implemented)
RECONNECT_INTERVAL=5000                      # Reconnection delay (ms)
REQUEST_TIMEOUT=5000                         # Request timeout (ms)
DEFAULT_PERIOD=1000                          # Default subscription period (ms)
MIN_PERIOD=200                               # Minimum update period (ms)
SUBSCRIPTION_POLICY=ideal                    # ideal|instant|minimum|maximum

### MCP Server Settings
SERVER_NAME=signalk-mcp-server               # MCP server identifier
SERVER_VERSION=1.0.0                        # Version string
DEBUG=false                                  # Enable debug logging
LOG_LEVEL=info                               # Logging level

### URL Building Logic:
# The client automatically builds appropriate URLs from components:
# - WebSocket: ws://[host]:[port] or wss://[host]:[port] (for streaming delta messages)
# - HTTP: http://[host]:[port] or https://[host]:[port] (for REST API calls)
# - TLS setting applies to both protocols

### Configuration Examples:
# Local development (default)
SIGNALK_HOST=localhost
SIGNALK_PORT=3000
SIGNALK_TLS=false

# Remote server with custom port
SIGNALK_HOST=192.168.1.100
SIGNALK_PORT=8080
SIGNALK_TLS=false

# Secure remote server
SIGNALK_HOST=myboat.signalk.io
SIGNALK_PORT=443
SIGNALK_TLS=true

## MCP TOOLS TO IMPLEMENT
1. get_vessel_state() -> Returns current position, heading, speed, wind data
2. get_ais_targets() -> Returns nearby vessels from AIS with position/course/speed
3. get_active_alarms() -> Returns current system notifications and alerts
4. list_available_paths() -> Discovers what SignalK data paths are available
5. subscribe_to_paths(paths[]) -> Subscribe to live updates from multiple paths
6. get_path_value(path) -> Get latest value for any specific SignalK path
7. get_connection_status() -> Returns WebSocket connection state and health

## MCP RESOURCES TO EXPOSE
- signalk://navigation -> Vessel navigation data
- signalk://ais -> AIS target information  
- signalk://alarms -> System notifications
- signalk://subscription -> Live data stream status

## SIGNALK DELTA MESSAGE STRUCTURE
{
  "context": "vessels.self",
  "updates": [{
    "timestamp": "2025-06-19T10:30:15.123Z",
    "source": {"label": "GPS1", "type": "NMEA0183"},
    "values": [{
      "path": "navigation.position",
      "value": {"latitude": 37.8199, "longitude": -122.4783}
    }]
  }]
}

## MODULE STRUCTURE
server.js                    # Main entry point and MCP server setup
src/signalk-client.js        # WebSocket client with reconnection logic
src/tool-handler.js          # MCP tool function implementations
src/resource-handler.js      # MCP resource management and delta processing

## KEY DESIGN PRINCIPLES
- Read-only operations for safety
- Automatic reconnection on connection loss
- Event-driven architecture for real-time data
- Simple error handling and graceful degradation
- Configurable via environment variables
- Minimal dependencies for easy deployment
- Focus on providing basic situational awareness to AI agents

## SUCCESS CRITERIA
- AI agent can get current vessel position and heading
- AI agent can see nearby AIS targets
- AI agent can monitor system alarms
- AI agent can subscribe to live sensor data streams
- AI agent can query latest value for any specific path
- Connection remains stable with automatic recovery
- Simple deployment and configuration

## Development Commands
- Add common development commands here (build, test, lint, etc.)

## Project Structure
- Document key directories and their purposes

## Notes
- Add any project-specific notes or conventions here
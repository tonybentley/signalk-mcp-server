# Claude Assistant Instructions

This file contains instructions and context for Claude when working on this project.

SignalK MCP Server - Project Scope & Configuration

## PROJECT OVERVIEW
Build a minimal MCP (Model Context Protocol) server that provides AI agents with basic access to SignalK marine data. Focus on simple, read-only operations that can be delivered in 2-3 days.

## CORE FUNCTIONALITY
- Connect to SignalK server via WebSocket
- Provide current vessel data
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
SIGNALK_HOST=localhost
SIGNALK_PORT=8080
SIGNALK_TLS=false

# Secure remote server
SIGNALK_HOST=myboat.signalk.io
SIGNALK_PORT=443
SIGNALK_TLS=true

## MCP TOOLS IMPLEMENTED
1. get_initial_context() -> **Start here!** Returns comprehensive SignalK documentation and context for AI agents
2. get_vessel_state() -> Returns current position, heading, speed, wind data, and vessel identity (name, MMSI) - **Always fetches fresh data via HTTP**
3. get_ais_targets(page?, pageSize?) -> Returns nearby vessels from AIS sorted by distance with position/course/speed and distance in meters - **Always fetches fresh data via HTTP, supports pagination**
4. get_active_alarms() -> Returns current system notifications and alerts - **Always fetches fresh data via HTTP**
5. list_available_paths() -> Discovers what SignalK data paths are available
6. get_path_value(path) -> Get latest value for any specific SignalK path
7. get_connection_status() -> Returns HTTP connection state and configuration

**Note**: All tools now fetch fresh data via HTTP on each request, eliminating any risk of stale cached data. WebSocket functionality is preserved but disabled for future streaming support when MCP servers support real-time data streams.

## MCP RESOURCES AVAILABLE
- signalk://signalk_overview -> SignalK overview and core concepts
- signalk://data_model_reference -> Comprehensive SignalK data model reference
- signalk://path_categories_guide -> Guide to understanding SignalK paths
- signalk://mcp_tool_reference -> Reference for available MCP tools and usage patterns

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
src/index.ts                 # Main entry point and MCP server setup
src/signalk-client.ts        # HTTP client for SignalK API access (WebSocket code preserved for future)
src/signalk-mcp-server.ts    # MCP server implementation with tools and resources
src/types/                   # TypeScript type definitions
  ├── index.ts
  ├── interfaces.ts
  ├── mcp.ts
  └── signalk.ts
resources/                   # Static reference resources (JSON files)

## KEY DESIGN PRINCIPLES
- Read-only operations for safety
- HTTP-only mode for guaranteed fresh data on every request
- No caching - eliminates stale data issues completely
- Simple error handling and graceful degradation
- Configurable via environment variables
- Minimal dependencies for easy deployment
- Focus on providing basic situational awareness to AI agents
- Vessel identity retrieval from top-level SignalK properties (name, MMSI)
- Direct HTTP API access for all data fetching
- Node.js 18+ required for native fetch support
- WebSocket code preserved but disabled for future streaming capabilities

## SUCCESS CRITERIA
- AI agent can get current vessel position and heading with fresh data
- AI agent can see nearby AIS targets with up-to-date positions
- AI agent can monitor system alarms with current states
- AI agent can discover available data paths
- AI agent can query latest value for any specific path
- HTTP connectivity verification on connection
- Simple deployment and configuration
- No stale data returned - all queries fetch fresh from SignalK server

## Development Commands

### Build, Type Checking & Linting
```bash
npm run build          # Compile TypeScript to JavaScript
npm run typecheck      # Type check without emitting files
npm run lint           # Check code quality with ESLint
npm run lint:fix       # Auto-fix ESLint issues (preserves code style)
```

### Testing Strategy
```bash
# Unit Tests (Fast - ~2s)
npm run test:unit      # Run all unit tests
npm run test:watch     # Run unit tests in watch mode
npm run test:coverage  # Run unit tests with coverage report

# Integration Tests (Slow - ~30s each, requires live SignalK server)
npm run test:e2e       # Run all integration tests
npm run test:watch:e2e # Run integration tests in watch mode

# Individual Integration Tests (for focused testing)
npx jest tests/signalk-client-vessel-state.e2e.spec.ts      # Test getVesselStateWithIdentity()
npx jest tests/signalk-client-ais-targets.e2e.spec.ts       # Test getAISTargets()
npx jest tests/signalk-client-available-paths.e2e.spec.ts   # Test listAvailablePaths()

# All Tests
npm run test:all       # Run both unit and integration tests
```

### Core Client Method Validation
**IMPORTANT**: When modifying core SignalKClient methods, always run:

1. **Unit Tests First** (fast validation - efficient feedback loop):
   ```bash
   # All unit tests
   npm run test:unit
   
   # Individual unit test suites for ultra-fast feedback
   npx jest src/signalk-client.spec.ts -t "Configuration"
   npx jest src/signalk-client.spec.ts -t "URL Building" 
   npx jest src/signalk-client.spec.ts -t "Delta Message Processing"
   npx jest src/signalk-client.spec.ts -t "Data Retrieval Methods"
   npx jest src/signalk-client.spec.ts -t "HTTP Methods"
   npx jest src/signalk-client.spec.ts -t "Connection Management"
   npx jest src/signalk-client.spec.ts -t "Event Handling"
   npx jest src/signalk-client.spec.ts -t "Edge Cases and Error Handling"
   npx jest src/signalk-client.spec.ts -t "Data Formatting and Validation"
   
   # Watch mode for continuous feedback during development
   npx jest src/signalk-client.spec.ts --watch
   ```

2. **Specific Integration Test** (validates against live server):
   ```bash
   # For getVesselStateWithIdentity() changes:
   npx jest tests/signalk-client-vessel-state.e2e.spec.ts
   
   # For getAISTargets() changes:
   npx jest tests/signalk-client-ais-targets.e2e.spec.ts
   
   # For listAvailablePaths() changes:
   npx jest tests/signalk-client-available-paths.e2e.spec.ts
   ```

3. **Type Check**:
   ```bash
   npm run typecheck
   ```

### Development Server
```bash
npm run dev            # Development server with hot reload
npm run start:dev      # Development server (alternative)
npm run start:prod     # Production server
```

### CI/CD Pipeline
```bash
npm run ci             # Full CI pipeline: typecheck → lint → build → unit tests → coverage
npm run ci:full        # Extended CI: typecheck → lint → build → all tests → coverage
```

## Project Structure

```
src/
├── signalk-client.ts           # Core SignalK WebSocket client
├── signalk-mcp-server.ts       # MCP server implementation
├── types/                      # TypeScript type definitions
└── index.ts                    # Main entry point

tests/
├── setup.ts                    # Jest test configuration
├── *.spec.ts                   # Unit tests
└── *.e2e.spec.ts              # Integration tests (live server)

dist/                           # Compiled JavaScript output
```

## Testing Philosophy

### Unit Tests (`*.spec.ts`)
- Fast execution (~2 seconds total)
- Mock external dependencies
- Test business logic and edge cases
- 80+ tests covering all core functionality
- Always run before commits

### Integration Tests (`*.e2e.spec.ts`)  
- Test against live SignalK server
- Validate real marine data handling
- Test HTTP/WebSocket fallback behavior
- Verify AI-ready data formatting
- Run for major changes or releases

### Core Method Coverage
- `getVesselState()`: Dynamic vessel data retrieval
- `getVesselStateWithIdentity()`: Vessel data with identity (name, MMSI) from top-level SignalK properties
- `getAISTargets()`: True AIS target detection (MMSI-based)
- `listAvailablePaths()`: HTTP API with WebSocket fallback
- `getActiveAlarms()`: System notifications and alerts
- `getPathValue()`: Individual path data fetching
- `getConnectionStatus()`: Connection health monitoring

## Notes

### Vessel Identity Implementation
- Vessel name and MMSI retrieved from top-level SignalK properties via HTTP API
- Combined with delta message data for complete vessel state
- `getVesselStateWithIdentity()` method provides comprehensive vessel information

### AIS Target Implementation
- Only vessels with MMSI format (`urn:mrn:imo:mmsi:XXXXXXXXX`) are AIS targets
- UUID-based vessels and WiFi connections are excluded
- Follows SignalK 1.7.0 specification for proper maritime safety compliance

### Testing Requirements
- Live SignalK server required for integration tests
- Server credentials: admin/adminadmin
- Tests validate real marine data structures
- AI-ready JSON format validation included

### Error Handling
- Integration tests fail fast if no live server connection
- Graceful fallback from HTTP to WebSocket for path discovery
- Comprehensive edge case testing in unit tests
- Node.js 18+ required for native fetch support

### Iterative Development
- Every file must not have eslint errors or typescript errors
- Unit test coverage must be 80% or better on all implementation files
- Additions or changes should have corresponding e2e tests that validate the tools
- Run the ci:full script to verify changes are ready and complete
- Run the github action using act to verify changes are ready and complete
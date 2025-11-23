# Claude Assistant Instructions

This file contains instructions and context for Claude when working on this project.

SignalK MCP Server - Project Scope & Configuration

## PROJECT OVERVIEW
MCP (Model Context Protocol) server that provides AI agents with access to SignalK marine data via **code execution in V8 isolates**. This approach achieves **90-96% token savings** compared to traditional MCP tools by allowing agents to filter and transform data before returning results.

## CORE FUNCTIONALITY
- Execute JavaScript code in secure V8 isolates with SignalK SDK access
- Connect to SignalK server via HTTP (WebSocket preserved for future streaming)
- Provide current vessel data with client-side filtering
- List nearby AIS targets with distance filtering
- Access system alarms and notifications
- Get latest value for any specific SignalK path
- Monitor connection status to SignalK server
- Discover available data paths on the SignalK installation

## TECHNICAL REQUIREMENTS
Runtime: Node.js 18+ (native fetch support)
Transport: HTTP REST API to SignalK server
Protocol: MCP (Model Context Protocol)
Data Format: JSON (SignalK data)
Architecture: V8 isolate-based code execution with RPC bindings
Dependencies: isolated-vm for secure code execution

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

### Execution Mode
EXECUTION_MODE=code                          # code (default) | tools | hybrid
                                             # code: V8 isolate execution only (recommended)
                                             # tools: Legacy MCP tools (deprecated)
                                             # hybrid: Both available (migration mode)

### MCP Server Settings
SERVER_NAME=signalk-mcp-server               # MCP server identifier
SERVER_VERSION=2.0.0                         # Version string
DEBUG=false                                  # Enable debug logging
LOG_LEVEL=info                               # Logging level

### Configuration Examples:
# Local development (default)
SIGNALK_HOST=localhost
SIGNALK_PORT=3000
SIGNALK_TLS=false
EXECUTION_MODE=code

# Legacy tools mode (backward compatibility)
EXECUTION_MODE=tools

## MCP TOOLS

### Primary Tool: execute_code (Code Execution Mode)
Execute JavaScript code in a secure V8 isolate with access to SignalK SDK functions.

**SDK Functions Available (all async - must use `await`):**
- `await getVesselState()` - Get vessel navigation data, position, identity
- `await getAisTargets(options?)` - Get nearby AIS vessels (options: page, pageSize, maxDistance)
- `await getActiveAlarms()` - Get system notifications and alerts
- `await listAvailablePaths()` - Discover available SignalK data paths
- `await getPathValue(path)` - Get value for specific path (accepts string or {path: string})
- `await getConnectionStatus()` - Get connection status

**Code Requirements:**
- Wrap code in async IIFE: `(async () => { ... })()`
- **All SDK functions are async and must be awaited**
- Return `JSON.stringify()` of result object
- Console.log output captured in `logs` array

**Example:**
```javascript
(async () => {
  const vessel = await getVesselState();
  const ais = await getAisTargets({ pageSize: 50 });

  // Filter in isolate - massive token savings!
  const nearby = ais.targets.filter(t => t.distanceMeters < 1852);

  return JSON.stringify({
    vesselName: vessel.data.name?.value,
    position: vessel.data["navigation.position"]?.value,
    nearbyCount: nearby.length
  });
})()
```

### Utility Tools (Available in All Modes)
- `get_connection_status` - Connection health for debugging
- `get_initial_context` - SignalK documentation and context

### Legacy Tools (Deprecated - Use execute_code Instead)
Available only in `tools` or `hybrid` mode:
- `get_vessel_state` -> Use `getVesselState()` in execute_code
- `get_ais_targets` -> Use `getAisTargets()` in execute_code
- `get_active_alarms` -> Use `getActiveAlarms()` in execute_code
- `list_available_paths` -> Use `listAvailablePaths()` in execute_code
- `get_path_value` -> Use `getPathValue()` in execute_code

## TOKEN EFFICIENCY

| Operation | Legacy Tools | Code Execution | Savings |
|-----------|-------------|----------------|---------|
| Vessel state | ~2,000 tokens | ~120 tokens | 94% |
| AIS targets | ~10,000 tokens | ~500 tokens | 95% |
| Active alarms | ~1,000 tokens | ~100 tokens | 90% |
| Available paths | ~2,500 tokens | ~200 tokens | 92% |
| Multi-call workflow | ~13,000 tokens | ~300 tokens | 97% |

## MCP RESOURCES AVAILABLE
- signalk://signalk_overview -> SignalK overview and core concepts
- signalk://data_model_reference -> Comprehensive SignalK data model reference
- signalk://path_categories_guide -> Guide to understanding SignalK paths
- signalk://mcp_tool_reference -> Reference for available MCP tools and usage patterns

## MODULE STRUCTURE
```
src/
├── index.ts                    # Main entry point and MCP server setup
├── signalk-client.ts           # HTTP client for SignalK API access
├── signalk-mcp-server.ts       # MCP server with tools and code execution
├── bindings/
│   └── signalk-binding.ts      # RPC bindings for V8 isolate access
├── execution-engine/
│   └── isolate-sandbox.ts      # V8 isolate sandbox for secure code execution
├── sdk/
│   └── generator.ts            # Auto-generates SDK from MCP tool definitions
├── utils/
│   └── path-utils.ts           # Path utilities
└── types/                      # TypeScript type definitions
    ├── index.ts
    ├── interfaces.ts
    ├── mcp.ts
    └── signalk.ts

resources/                      # Static reference resources (JSON files)
tests/                          # Integration tests (e2e)
```

## KEY DESIGN PRINCIPLES
- **V8 Isolate Security**: Complete isolation, no Node.js globals, no credential exposure
- **Token Efficiency**: 90-96% reduction via client-side filtering
- **RPC-Style Bindings**: SignalK credentials stay in binding layer
- **Auto-Generated SDK**: SDK stays in sync with MCP tool definitions
- **Read-only operations**: Safety first for maritime systems
- **HTTP-only mode**: Guaranteed fresh data on every request
- **Backward Compatible**: Legacy tools available via EXECUTION_MODE=tools

## SUCCESS CRITERIA
- AI agent can execute code in V8 isolate with SignalK SDK access
- AI agent can filter and transform data before returning to LLM context
- 90-96% token savings compared to legacy tools approach
- All SDK methods work correctly in V8 isolate
- HTTP connectivity verification on connection
- Simple deployment and configuration

## Development Commands

### Docker Development (Recommended)
```bash
docker compose up -d           # Start SignalK server
docker compose down            # Stop SignalK server
docker logs signalk-mcp-server-signalk-1  # View SignalK logs
```

### Build, Type Checking & Linting
```bash
npm run build          # Compile TypeScript to JavaScript
npm run typecheck      # Type check without emitting files
npm run lint           # Check code quality with ESLint
npm run lint:fix       # Auto-fix ESLint issues
```

### Testing Strategy
```bash
# Unit Tests (Fast - ~2s)
npm run test:unit      # Run all unit tests
npm run test:watch     # Run unit tests in watch mode
npm run test:coverage  # Run unit tests with coverage report

# Integration Tests (Requires live SignalK server)
npm run test:e2e       # Run all integration tests

# All Tests
npm run test:all       # Run both unit and integration tests
```

### CI/CD Pipeline
```bash
npm run ci             # Full CI: typecheck → lint → build → unit tests → coverage
npm run ci:full        # Extended CI: all tests including e2e
```

## Project Structure

```
src/
├── signalk-client.ts           # Core SignalK HTTP client
├── signalk-mcp-server.ts       # MCP server with execute_code tool
├── bindings/signalk-binding.ts # V8 isolate bindings
├── execution-engine/isolate-sandbox.ts  # V8 sandbox
├── sdk/generator.ts            # SDK auto-generator
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
- Includes isolate sandbox tests
- Always run before commits

### Integration Tests (`*.e2e.spec.ts`)
- Test against live SignalK server (use Docker)
- Validate real marine data handling
- Verify AI-ready data formatting
- Run for major changes or releases

### Core Method Coverage
- `IsolateSandbox.execute()`: V8 isolate code execution
- `SignalKBinding.*`: All binding methods for isolate access
- `getVesselState()`: Dynamic vessel data retrieval
- `getAISTargets()`: True AIS target detection (MMSI-based)
- `listAvailablePaths()`: HTTP API path discovery
- `getActiveAlarms()`: System notifications and alerts
- `getPathValue()`: Individual path data fetching

## Notes

### V8 Isolate Implementation
- Uses `isolated-vm` library for secure sandboxing
- 128MB memory limit, 30s execution timeout
- No access to Node.js globals (process, require, __dirname)
- Console.log captured and returned in result
- Fresh isolate per execution (milliseconds startup)

### SignalK Binding Layer
- Wraps SignalKClient with RPC-style methods
- SignalK credentials never exposed to agent code
- Handles async method invocation across isolate boundary
- `getPathValue` accepts both string and {path: string} object

### SDK Auto-Generation
- SDK generated from MCP tool definitions at startup
- Converts snake_case tool names to camelCase functions
- Provides JSDoc comments from tool descriptions
- No manual SDK maintenance required

### AIS Target Implementation
- Only vessels with MMSI format are AIS targets
- UUID-based vessels and WiFi connections excluded
- Follows SignalK 1.7.0 specification

### Testing Requirements
- Docker recommended for local SignalK server
- Server credentials: admin/adminadmin
- Clean dist before testing: `rm -rf dist && npm run build`

### Iterative Development
- Every file must not have eslint errors or typescript errors
- Unit test coverage must be 80% or better on all implementation files
- Additions or changes should have corresponding e2e tests
- Run the ci:full script to verify changes are ready and complete
- Always rebuild after source changes: `npm run build`

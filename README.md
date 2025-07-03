# SignalK MCP Server

A Model Context Protocol (MCP) server that provides AI agents with read-only access to SignalK marine data systems. This server enables Claude and other AI assistants to query vessel navigation data, monitor AIS targets, and access system alarms from SignalK installations.

## Features

- **Real-time vessel data**: Access current position, heading, speed, and wind information
- **AIS target monitoring**: Query nearby vessels with position, course, and speed data  
- **System notifications**: Monitor active alarms and system alerts
- **Live data streams**: Subscribe to real-time updates from multiple SignalK paths
- **Path discovery**: List all available data paths on the SignalK installation
- **Connection monitoring**: Track WebSocket connection status and health
- **Automatic reconnection**: Robust connection handling with configurable retry logic

## Installation

### Prerequisites

- Node.js 18.0.0 or higher (required for native fetch support)
- Access to a SignalK server (local or remote)

### Option 1: Install via npm/npx (Recommended)

The easiest way to use this MCP server is via npx:

```bash
npx signalk-mcp-server
```

Or install globally:

```bash
npm install -g signalk-mcp-server
```

### Option 2: Development Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd signalk-mcp-server
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

## Configuration

Configure the server using environment variables. Create a `.env` file in the project root:

```env
# SignalK Connection
SIGNALK_HOST=localhost                       # SignalK server hostname/IP
SIGNALK_PORT=3000                            # SignalK server port  
SIGNALK_TLS=false                            # Use secure connections (WSS/HTTPS)

# Authentication & Context
SIGNALK_TOKEN=                               # Optional authentication token
SIGNALK_CONTEXT=vessels.self                 # Default vessel context

# Connection Behavior
RECONNECT_INTERVAL=5000                      # Reconnection delay (ms)
REQUEST_TIMEOUT=5000                         # Request timeout (ms)
DEFAULT_PERIOD=1000                          # Default subscription period (ms)
MIN_PERIOD=200                               # Minimum update period (ms)
SUBSCRIPTION_POLICY=ideal                    # ideal|instant|minimum|maximum

# MCP Server Settings  
SERVER_NAME=signalk-mcp-server               # MCP server identifier
SERVER_VERSION=1.0.0                        # Version string
DEBUG=false                                  # Enable debug logging
LOG_LEVEL=info                               # Logging level
```

### Connection Examples

**Local development (default):**
```env
SIGNALK_HOST=localhost
SIGNALK_PORT=3000
SIGNALK_TLS=false
```

**Remote server with custom port:**
```env
SIGNALK_HOST=192.168.1.100
SIGNALK_PORT=8080
SIGNALK_TLS=false
```

**Secure remote server:**
```env
SIGNALK_HOST=myboat.signalk.io
SIGNALK_PORT=443
SIGNALK_TLS=true
```

## Usage

### Running the Server

**Development mode with hot reload:**
```bash
npm run dev
```

**Production mode:**
```bash
npm start
```

**Using ts-node directly:**
```bash
npm run start:dev
```

### Connecting to Claude Desktop

Add the server to your Claude Desktop configuration file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%/Claude/claude_desktop_config.json`

#### Using npx (Recommended):
```json
{
  "mcpServers": {
    "signalk": {
      "command": "npx",
      "args": ["-y", "signalk-mcp-server"],
      "env": {
        "SIGNALK_HOST": "localhost",
        "SIGNALK_PORT": "3000",
        "SIGNALK_TLS": "false"
      }
    }
  }
}
```

#### Using local build:
```json
{
  "mcpServers": {
    "signalk": {
      "command": "node",
      "args": ["/path/to/signalk-mcp-server/dist/src/index.js"],
      "env": {
        "SIGNALK_HOST": "localhost",
        "SIGNALK_PORT": "3000",
        "SIGNALK_TLS": "false"
      }
    }
  }
}
```

### Connecting to Claude Code CLI

#### Prerequisites

1. Install Claude Code CLI globally:
```bash
npm install -g @anthropic-ai/claude-code
```

2. Verify installation:
```bash
claude --version
claude --help
```

#### Option 1: Using npx (Recommended)

The simplest way to add the SignalK MCP server:

```bash
claude mcp add signalk npx signalk-mcp-server
```

With environment variables:

```bash
claude mcp add signalk \
  -e SIGNALK_HOST=localhost \
  -e SIGNALK_PORT=3000 \
  -e SIGNALK_TLS=false \
  -- npx signalk-mcp-server
```

#### Option 2: Direct JSON Configuration

Add the server using JSON configuration:

```bash
claude mcp add-json signalk '{
  "command": "npx",
  "args": ["-y", "signalk-mcp-server"],
  "env": {
    "SIGNALK_HOST": "localhost",
    "SIGNALK_PORT": "3000",
    "SIGNALK_TLS": "false"
  }
}'
```

#### Option 3: Project-Scoped Configuration (For team collaboration)

Create a `.mcp.json` file in your project root to share the configuration with your team:

```json
{
  "mcpServers": {
    "signalk": {
      "command": "npx",
      "args": ["-y", "signalk-mcp-server"],
      "env": {
        "SIGNALK_HOST": "localhost",
        "SIGNALK_PORT": "3000",
        "SIGNALK_TLS": "false"
      }
    }
  }
}
```

Then add it as a project-scoped server:

```bash
claude mcp add signalk -s project npx signalk-mcp-server
```

#### Option 4: Global Installation Method

If you installed globally with `npm install -g signalk-mcp-server`:

```bash
claude mcp add signalk signalk-mcp-server
```

#### Managing the MCP Server

**List all configured servers:**
```bash
claude mcp list
```

**Check server status:**
```bash
claude mcp get signalk
```

**Debug configuration issues:**
```bash
claude --mcp-debug
```

**Reset project choices (if needed):**
```bash
claude mcp reset-project-choices
```

#### Configuration Examples for Different Environments

**Local development:**
```bash
claude mcp add-json signalk-local '{
  "command": "npx",
  "args": ["-y", "signalk-mcp-server"],
  "env": {
    "SIGNALK_HOST": "localhost",
    "SIGNALK_PORT": "3000",
    "SIGNALK_TLS": "false"
  }
}'
```

**Remote server:**
```bash
claude mcp add-json signalk-remote '{
  "command": "npx",
  "args": ["-y", "signalk-mcp-server"],
  "env": {
    "SIGNALK_HOST": "192.168.1.100",
    "SIGNALK_PORT": "8080",
    "SIGNALK_TLS": "false"
  }
}'
```

**Secure remote server:**
```bash
claude mcp add-json signalk-secure '{
  "command": "npx",
  "args": ["-y", "signalk-mcp-server"],
  "env": {
    "SIGNALK_HOST": "myboat.signalk.io",
    "SIGNALK_PORT": "443", 
    "SIGNALK_TLS": "true",
    "SIGNALK_TOKEN": "your-auth-token"
  }
}'
```

## Available Tools

The MCP server provides the following tools to AI agents:

### `get_initial_context()` 🌟
**Start here!** Returns comprehensive SignalK context and documentation to help AI agents understand the system. This tool provides:
- SignalK overview and core concepts
- Complete data model reference with path meanings  
- Path categorization guide for understanding data organization
- MCP tool reference with usage patterns and examples
- Server information and capabilities
- Note: When Claude Desktop makes automatic resource discovery available this will be removed

**Usage:** Call this tool first to gain essential context about the SignalK system before using other tools.

### `get_vessel_state()`
Returns current vessel navigation data including position, heading, speed, wind information, and vessel identity (name, MMSI). Combines delta message data with top-level SignalK properties for comprehensive vessel information.

### `get_ais_targets(page?, pageSize?)`  
Retrieves nearby vessels from AIS sorted by distance from self vessel (closest first). Returns position, course, speed, identification data, and distance in meters. Supports pagination with optional parameters:
- `page`: Page number (1-based, default: 1)
- `pageSize`: Number of targets per page (default: 10, max: 50)

### `get_active_alarms()`
Returns current system notifications, alerts, and alarm states.

### `list_available_paths()`
Discovers and lists all available SignalK data paths on the connected server.


### `get_path_value(path)`
Gets the latest value for any specific SignalK path.

### `get_connection_status()`
Returns WebSocket connection state, health metrics, and reconnection status.

## Available Resources

The server exposes these static reference resources:

- `signalk://signalk_overview` - SignalK overview and core concepts
- `signalk://data_model_reference` - Comprehensive SignalK data model reference
- `signalk://path_categories_guide` - Guide to understanding SignalK paths
- `signalk://mcp_tool_reference` - Reference for available MCP tools and usage patterns

**Note:** While these resources can be accessed individually via the MCP resource protocol, the `get_initial_context()` tool provides a more convenient way to access all reference materials in a single call, making it the recommended approach for AI agents to understand the system.

## Development

### Scripts

- `npm run build` - Compile TypeScript to JavaScript
- `npm run dev` - Run in development mode with hot reload
- `npm run test` - Run unit tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage report
- `npm run typecheck` - Type checking without compilation

### Testing

The project includes comprehensive test suites:

```bash
# Run all tests
npm run test:all

# Unit tests only
npm run test:unit

# End-to-end tests
npm run test:e2e

# Watch mode for development
npm run test:watch
```

### Project Structure

```
src/
├── index.ts                 # Main entry point and MCP server setup
├── signalk-client.ts        # WebSocket client with reconnection logic
├── signalk-mcp-server.ts    # MCP server implementation with tools and resources
└── types/                   # TypeScript type definitions
    ├── index.ts
    ├── interfaces.ts
    ├── mcp.ts
    └── signalk.ts
```

## SignalK Data Format

The server processes SignalK delta messages in this format:

```json
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
```

## Security & Safety

- **Read-only operations**: All tools provide read-only access for safety
- **No device control**: No functions that can control vessel systems
- **Graceful degradation**: Continues operating with partial data availability
- **Connection validation**: Automatic validation of SignalK server responses
- **Error isolation**: Robust error handling prevents system crashes

## Limitations

This is a minimal viable product (MVP) focused on basic functionality. The following features are explicitly out of scope:

- Collision avoidance calculations
- Route planning or navigation assistance  
- Chart data integration
- Device control functions (read-only only)
- Complex analytics or historical data
- Multi-vessel fleet management
- Weather routing
- Anchor watch features
- Live data subscriptions (removed - use individual path queries instead)

## Troubleshooting

### Common Issues

**Connection refused:**
- Verify SignalK server is running and accessible
- Check host/port configuration in environment variables
- Ensure firewall allows WebSocket connections

**Authentication errors:**
- Verify SIGNALK_TOKEN if authentication is required
- Check token permissions on SignalK server

**Missing data:**
- Use `list_available_paths()` to discover available data
- Verify vessel is transmitting expected data paths
- Check SignalK server data sources and plugins
- For vessel identity (name, MMSI), ensure top-level properties are configured in SignalK server

**WebSocket disconnections:**
- Review network stability
- Adjust RECONNECT_INTERVAL for network conditions
- Monitor connection status with `get_connection_status()`

**Node.js version issues:**
- Ensure Node.js 18+ is being used (required for native fetch)
- Claude Desktop may default to Node.js 16 - configure to use newer version

### Debug Mode

Enable detailed logging:

```env
DEBUG=true
LOG_LEVEL=debug
```

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Run `npm run test` and `npm run typecheck`
5. Submit a pull request

## Support

For issues and questions:
- Check the troubleshooting section above
- Review SignalK server logs and configuration
- Open an issue with connection details and error messages
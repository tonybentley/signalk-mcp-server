# Running E2E Tests

This guide explains how to run end-to-end tests for the SignalK MCP server.

## Prerequisites

- Node.js 18+ installed
- Docker and Docker Compose (for containerized testing)
- A SignalK server (either containerized or existing)

## Option 1: Run with Docker (Recommended)

The easiest way to run e2e tests is using our preconfigured Docker setup:

```bash
# Make script executable (first time only)
chmod +x scripts/run-e2e-tests.sh

# Run all e2e tests with a containerized SignalK server
./scripts/run-e2e-tests.sh
```

Or manually:

```bash
# Start SignalK server
docker compose -f docker/docker-compose.test.yml up -d

# Run tests
npm run test:e2e

# Stop server
docker compose -f docker/docker-compose.test.yml down -v
```

## Option 2: Run Against Existing SignalK Server

If you have a SignalK server already running:

```bash
# Set environment variables
export SIGNALK_HOST=localhost  # or your server's host
export SIGNALK_PORT=3000       # or your server's port
export SIGNALK_TLS=false       # or true if using HTTPS
export SIGNALK_CONTEXT=vessels.self

# Run e2e tests
npm run test:e2e
```

## Option 3: Use Environment File

Create a `.env` file in the project root:

```env
SIGNALK_HOST=192.168.1.100
SIGNALK_PORT=3000
SIGNALK_TLS=false
SIGNALK_CONTEXT=vessels.self
```

Then run:

```bash
npm run test:e2e
```

## Test Requirements

The e2e tests expect a SignalK server that:

1. Is accessible at the configured host/port
2. Has WebSocket support enabled
3. Has some data available (position, speed, etc.)
4. Responds to HTTP API requests

### Minimum Data Requirements

While tests are designed to work with any SignalK server, they work best when the server provides:

- Navigation data (position, speed, course)
- Vessel information (name, MMSI)
- Some AIS targets (optional)
- Active paths with recent timestamps

## Troubleshooting

### Connection Refused

If tests can't connect:

1. Verify server is running: `curl http://localhost:3000/signalk/v1/api/`
2. Check firewall settings
3. Ensure correct host/port in environment variables

### No Data Available

If tests pass but report "0 data paths":

1. Server may not have any data sources configured
2. Use `--sample-nmea0183-data` flag when starting SignalK
3. Configure a data provider in SignalK admin interface

### Timeout Errors

If tests timeout:

1. Increase Jest timeout in test files
2. Check network latency to server
3. Ensure server is not overloaded

## GitHub Actions

The repository includes GitHub Actions workflows that automatically run e2e tests:

- `.github/workflows/e2e-tests.yml` - Dedicated e2e test workflow
- `.github/workflows/ci.yml` - Main CI pipeline (includes e2e tests)

These workflows spin up a SignalK container with sample data for testing.

## Writing New E2E Tests

E2E tests are located in `tests/` directory with `.e2e.spec.ts` suffix.

Example test structure:

```typescript
import { SignalKClient } from '../src/signalk-client.js';

describe('Feature E2E Tests', () => {
  let client: SignalKClient;

  beforeAll(async () => {
    client = new SignalKClient({
      hostname: process.env.SIGNALK_HOST,
      port: parseInt(process.env.SIGNALK_PORT || '3000'),
      useTLS: process.env.SIGNALK_TLS === 'true',
    });
    await client.connect();
  });

  afterAll(async () => {
    client.disconnect();
  });

  test('should do something', async () => {
    // Your test here
  });
});
```

## Performance Considerations

- E2E tests connect to a live server and may be slower than unit tests
- Tests wait for data to accumulate (5-10 seconds)
- WebSocket connections add latency
- Consider running e2e tests separately from unit tests in CI

## Security

- Never commit real server credentials to the repository
- Use environment variables for sensitive configuration
- The test server runs with plugins disabled for security
- Sample data contains no sensitive information

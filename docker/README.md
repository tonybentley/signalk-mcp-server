# SignalK Test Server Setup

This directory contains Docker configurations for running a SignalK server with sample data for end-to-end testing.

## Overview

The SignalK server container is configured to:
- Start with sample NMEA0183 data automatically
- Override timestamps to current time
- Disable plugins for predictable test environment
- Provide vessel data, AIS targets, and system information

## Quick Start

### Running E2E Tests Locally

The easiest way to run e2e tests with a SignalK server:

```bash
# Make the script executable
chmod +x scripts/run-e2e-tests.sh

# Run the tests
./scripts/run-e2e-tests.sh
```

### Manual Docker Setup

Start the SignalK server with sample NMEA0183 data:

```bash
docker compose -f docker/docker-compose.test.yml up -d
```

Or with both NMEA0183 and N2K data:

```bash
docker compose -f docker/docker-compose.full-test.yml up -d
```

Stop the server:

```bash
docker compose -f docker/docker-compose.test.yml down -v
```

## Configuration

### Docker Compose Files

- `docker-compose.test.yml` - Basic setup with NMEA0183 sample data (used by GitHub Actions)
- `docker-compose.full-test.yml` - Full setup with both NMEA0183 and N2K sample data
- `docker-compose.local.yml` - Local development setup that builds custom test image

### Custom Test Image

- `Dockerfile.test` - Custom image that starts SignalK with sample data by default
- `docker-entrypoint.sh` - Entrypoint script that adds required command line flags

### SignalK Configuration

The `signalk-config/settings.json` file contains:
- Vessel information (name, MMSI, UUID)
- Server settings (ports, interfaces, etc.)
- Data provider configuration

### Environment Variables

The following environment variables are set in the container:

- `PORT=3000` - HTTP/WebSocket port
- `NMEA0183PORT=10110` - NMEA 0183 TCP port
- `TCPSTREAMPORT=8375` - SignalK TCP Stream port
- `WSCOMPRESSION=false` - Disable WebSocket compression for testing
- `DISABLEPLUGINS=true` - Disable plugins for predictable test environment

### Command Line Options

The container starts with these options:
- `--sample-nmea0183-data` - Enables sample NMEA0183 data stream
- `--sample-n2k-data` - Enables sample NMEA2000 data stream (optional)
- `--override-timestamps` - Updates timestamps to current time

## GitHub Actions

The `.github/workflows/e2e-tests.yml` workflow automatically:
1. Starts the SignalK container
2. Waits for it to be healthy
3. Runs the e2e tests
4. Captures logs on failure
5. Cleans up containers

## Troubleshooting

### Container Won't Start

Check the logs:
```bash
docker compose -f docker/docker-compose.test.yml logs signalk-server
```

### Tests Can't Connect

Verify the server is running:
```bash
curl http://localhost:3000/signalk/v1/api/
```

Check WebSocket connection:
```bash
curl http://localhost:3000/signalk/v1/stream?subscribe=none
```

### Sample Data Not Appearing

The sample data generators start automatically with the `--sample-nmea0183-data` flag. 
Data should appear within a few seconds of server startup.

## Sample Data Details

### NMEA0183 Sample Data
The `--sample-nmea0183-data` flag provides:
- GPS position data (GGA, RMC sentences)
- Speed and course data
- Wind data
- Depth data
- And more marine instrumentation data

### NMEA2000 Sample Data
The `--sample-n2k-data` flag provides:
- Engine data
- Battery status
- Tank levels
- Navigation data
- And other N2K PGNs

All timestamps are overridden to current time when using `--override-timestamps`.

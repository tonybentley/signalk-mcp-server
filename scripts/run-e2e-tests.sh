#!/bin/bash

# Script to run e2e tests with SignalK server in Docker

set -e

echo "🚀 Starting SignalK server for E2E tests..."

# Stop any existing containers
docker compose -f docker/docker-compose.test.yml down -v 2>/dev/null || true

# Start SignalK server
docker compose -f docker/docker-compose.test.yml up -d

# Wait for server to be healthy
echo "⏳ Waiting for SignalK server to be healthy..."
timeout=60
elapsed=0
while ! docker compose -f docker/docker-compose.test.yml ps | grep -q "healthy"; do
  if [ $elapsed -ge $timeout ]; then
    echo "❌ Timeout waiting for SignalK server to be healthy"
    docker compose -f docker/docker-compose.test.yml logs signalk-server
    docker compose -f docker/docker-compose.test.yml down -v
    exit 1
  fi
  sleep 2
  elapsed=$((elapsed + 2))
  echo -n "."
done
echo ""

# Verify API is accessible
echo "🔍 Verifying SignalK API..."
if ! curl -f -s http://localhost:3000/signalk/v1/api/ > /dev/null; then
  echo "❌ SignalK API is not accessible"
  docker compose -f docker/docker-compose.test.yml logs signalk-server
  docker compose -f docker/docker-compose.test.yml down -v
  exit 1
fi

echo "✅ SignalK server is ready!"

# Set environment variables
export SIGNALK_HOST=localhost
export SIGNALK_PORT=3000
export SIGNALK_TLS=false
export SIGNALK_CONTEXT=vessels.self

# Run e2e tests
echo "🧪 Running E2E tests..."
npm run test:e2e

# Capture exit code
test_exit_code=$?

# Stop containers
echo "🛑 Stopping SignalK server..."
docker compose -f docker/docker-compose.test.yml down -v

# Exit with test exit code
exit $test_exit_code

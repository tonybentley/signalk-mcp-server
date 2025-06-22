#!/usr/bin/env node

import dotenv from 'dotenv';
import { SignalKMCPServer } from './signalk-mcp-server.js';

dotenv.config();

// Handle unhandled promise rejections gracefully
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Promise Rejection:', reason);
  // Don't exit the process for SignalK connection issues
});

const server = new SignalKMCPServer();
server.run().catch((error) => {
  console.error('Server startup failed:', error);
  console.error('Stack trace:', error.stack);
  process.exit(1);
});
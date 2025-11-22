export default {
  // Test environment
  testEnvironment: 'node',
  
  // Use ts-jest preset for TypeScript
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  // Moved ts-jest config to transform section
  
  // Transform TypeScript files
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: true,
      tsconfig: 'tsconfig.json'
    }]
  },
  
  // Test file patterns
  testMatch: [
    '<rootDir>/src/**/*.spec.ts',        // Unit tests co-located with source
    '<rootDir>/tests/**/*.e2e.spec.ts'   // Integration/E2E tests
  ],
  
  // Ignore patterns
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/test-*.js',               // Ignore legacy integration test files
    '<rootDir>/test-*.ts',               // Ignore legacy TypeScript test files
    '<rootDir>/src/execution-engine/isolate-sandbox.spec.ts'  // Requires real isolated-vm native module
  ],
  
  // Coverage configuration
  collectCoverage: false, // Set to true by --coverage flag
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',                 // Exclude unit tests
    '!src/**/*.e2e.spec.ts',             // Exclude e2e tests
    '!src/**/__tests__/**',
    '!**/node_modules/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: [
    'text',
    'lcov',
    'html',
    'json-summary'
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  
  
  // Module file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  
  // Resolve TypeScript files without .js extension
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@/types$': '<rootDir>/src/types',
    '^(\.{1,2}/.*)\.js$': '$1'
  },
  
  // Test timeout
  testTimeout: 10000,
  
  // Verbose output
  verbose: true,
  
  // Clear mocks between tests
  clearMocks: true,
  restoreMocks: true,
  
  // Force exit after tests complete
  forceExit: true,
  
  // Detect open handles
  detectOpenHandles: true
};
# SDK Auto-Generator - Phase 3 Complete ✓

## Status: Production Ready

Automatically generates TypeScript SDK from MCP tool definitions, eliminating manual SDK maintenance and ensuring tools and SDK stay in sync.

## What It Does

Converts MCP tool schemas → Clean TypeScript/JavaScript SDK functions

**Input** (MCP Tool Definition):
```typescript
{
  name: 'get_vessel_state',
  description: 'Get current vessel navigation data',
  inputSchema: { type: 'object', properties: {} }
}
```

**Output** (Generated SDK):
```typescript
/**
 * Get current vessel navigation data
 */
export async function getVesselState() {
  const result = await signalk.getVesselState(undefined);
  return result;
}
```

## Key Features

✅ **Dual Output Modes**
- TypeScript (with types and exports) for .ts files
- JavaScript (pure JS, no types) for V8 isolates

✅ **Type Safety**
- JSON Schema → TypeScript types
- Optional vs required parameters
- JSDoc comments from descriptions

✅ **Auto-Sync**
- Reads tools from MCP server
- Generates SDK at runtime
- No manual maintenance

✅ **Clean Agent Code**
```typescript
// OLD: Direct binding
const vessel = await signalk.getVesselState();

// NEW: Generated SDK
const vessel = await getVesselState();
```

## Generated SDK Example

```typescript
/**
 * Get nearby AIS targets sorted by distance from self vessel (closest first)
 *
 * @param [options.page] - Page number (1-based, default: 1)
 * @param [options.pageSize] - Number of targets per page (default: 10, max: 50)
 */
export async function getAisTargets(options?: {
  page?: number;
  pageSize?: number;
}) {
  const result = await signalk.getAisTargets(options);
  return result;
}
```

## Usage

### Generate SDK from Tools

```typescript
import { generateSDK, prepareSDKForIsolate } from './sdk/generator.js';

const mcpTools = [
  { name: 'get_vessel_state', description: '...', inputSchema: {...} },
  { name: 'get_ais_targets', description: '...', inputSchema: {...} },
  // ...
];

// For TypeScript files
const tsCode = generateSDK(mcpTools);

// For V8 isolates
const { wrapperCode } = prepareSDKForIsolate(mcpTools);
```

### Inject into Isolate

```typescript
const sandbox = new IsolateSandbox();
const { wrapperCode } = prepareSDKForIsolate(mcpTools);

const result = await sandbox.execute(`
  ${wrapperCode}

  (async () => {
    // Use generated SDK functions
    const vessel = await getVesselState();
    const targets = await getAisTargets({ page: 1, pageSize: 10 });

    return JSON.stringify({
      vessel: vessel.data.name?.value,
      targetCount: targets.count
    });
  })()
`, { signalk: binding });
```

## Testing

```bash
node --loader ts-node/esm src/sdk/generator-demo.ts
```

**Output**:
```
✓ Generated SDK Code (TypeScript with types)
✓ Generated Isolate Wrapper (JavaScript, no types)
✓ SDK functions callable in isolate
✓ Cleaner agent code (no "signalk." prefix)

Phase 3 Complete: SDK auto-generation from MCP tools
```

## Benefits Demonstrated

### 1. Auto-Sync
- MCP tools updated → SDK automatically updated
- No manual TypeScript writing
- No drift between tools and SDK

### 2. Type Safety
```typescript
// TypeScript knows the types!
await getAisTargets({ page: 1, pageSize: 10 });  // ✓
await getAisTargets({ page: "invalid" });        // ✗ Type error
```

### 3. Better DX
```typescript
// Agent code is cleaner
const vessel = await getVesselState();           // Clean!
const vessel = await signalk.getVesselState();   // Verbose
```

### 4. JSDoc Comments
```typescript
// Hover over function in IDE → see description and params
await getAisTargets({ page: 1 });
// IDE shows: "Get nearby AIS targets sorted by distance..."
```

## Architecture

```
MCP Tools (JSON Schema)
         ↓
    Generator
         ↓
    ┌─────────┴─────────┐
    ↓                   ↓
TypeScript SDK    JavaScript SDK
(for .ts files)   (for isolates)
    ↓                   ↓
exports           globalThis
```

## Generator Functions

### `generateSDK(tools: MCPTool[]): string`
Generates TypeScript SDK code with types

### `prepareSDKForIsolate(tools: MCPTool[]): { code, wrapperCode }`
Generates both TypeScript and JavaScript versions

### `generateFunction(tool: MCPTool, mode: 'typescript' | 'javascript'): string`
Generates a single function (TS or JS)

## Next: Phase 4 - Hybrid Mode

Add `executionMode` config to SignalKMCPServer:
- `'tools'` - Legacy tools-based (backward compatible)
- `'code'` - New code execution mode
- `'hybrid'` - Both available (default for migration)

This allows gradual strangler pattern migration from tools → code execution.

## Conclusion

Phase 3 proves:
- ✅ SDK auto-generation from MCP schemas works
- ✅ TypeScript and JavaScript modes both functional
- ✅ Cleaner agent code (no binding prefix)
- ✅ Type safety for TypeScript files
- ✅ Zero manual SDK maintenance

**Production ready** - SDK generator can be integrated into MCP server initialization.

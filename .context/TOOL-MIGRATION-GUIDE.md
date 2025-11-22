# Tool Migration Guide

## Phase 5: Deprecating Legacy Tools

This guide documents the pattern for migrating legacy MCP tools to the new `execute_code` approach.

## Why Migrate?

**Token Savings:**
- Legacy tool: ~2,000-10,000 tokens per call
- Code execution: ~700 tokens for multi-step workflows
- **Savings: 94-96%**

**Better Features:**
- Multiple calls in one execution
- Client-side data filtering
- Complex logic (if/else, loops)
- Return only what's needed

## Migration Pattern

### 1. Add Deprecation Warning to Tool Description

```typescript
{
  name: 'legacy_tool_name',
  description:
    '⚠️ DEPRECATED: Use execute_code instead for better performance.\n\n' +
    'Original tool description here.\n\n' +
    'Migration example:\n' +
    '```javascript\n' +
    '(async () => {\n' +
    '  const result = await legacyToolFunction();\n' +
    '  return JSON.stringify(result);\n' +
    '})();\n' +
    '```\n\n' +
    'Benefits: XX% fewer tokens, client-side filtering.',
  inputSchema: { ... }
}
```

### 2. Add Runtime Deprecation Notice

```typescript
async legacyTool(): Promise<MCPToolResponse> {
  const data = await this.signalkClient.legacyMethod();

  // Add deprecation warning if in hybrid mode
  const deprecationNotice = this.executionMode === 'hybrid'
    ? '\n⚠️ DEPRECATION WARNING: This tool will be removed in a future version. ' +
      'Use execute_code with legacyToolFunction() for XX% token savings.\n'
    : '';

  return {
    content: [
      {
        type: 'text',
        text: deprecationNotice + JSON.stringify(data, null, 2),
      },
    ],
  };
}
```

### 3. Ensure SDK Function Available

Verify the function is auto-generated in SDK:

```typescript
// In src/sdk/generator.ts - automatically generated from tool definitions
export async function legacyToolFunction(options?: {...}) {
  const result = await signalk.legacyToolFunction(options);
  return result;
}
```

### 4. Document Migration Example

Show AI how to migrate:

**Before (Legacy):**
```
User: Get vessel state
AI: Calls get_vessel_state tool
Response: 2000 tokens of all vessel data
```

**After (Code Execution):**
```
User: Get vessel name and position
AI: Calls execute_code with:
(async () => {
  const vessel = await getVesselState();
  return JSON.stringify({
    name: vessel.data.name?.value,
    position: vessel.data["navigation.position"]?.value
  });
})()
Response: 200 tokens of filtered data
```

## Tool Migration Checklist

- [x] **get_vessel_state** - DEPRECATED (Phase 5)
  - ⚠️ Warning added to description
  - ⚠️ Runtime notice in hybrid mode
  - ✅ SDK function: `getVesselState()`
  - ✅ Migration example documented

- [x] **get_ais_targets** - DEPRECATED (Phase 6)
  - ⚠️ Warning added to description
  - ⚠️ Runtime notice in hybrid mode
  - ✅ SDK function: `getAisTargets(options)`
  - ✅ Migration example documented
  - Benefits: 95% token savings, filter by distance in isolate

- [x] **get_active_alarms** - DEPRECATED (Phase 6)
  - ⚠️ Warning added to description
  - ⚠️ Runtime notice in hybrid mode
  - ✅ SDK function: `getActiveAlarms()`
  - ✅ Migration example documented
  - Benefits: 90% token savings, filter critical alarms in isolate

- [x] **list_available_paths** - DEPRECATED (Phase 6)
  - ⚠️ Warning added to description
  - ⚠️ Runtime notice in hybrid mode
  - ✅ SDK function: `listAvailablePaths()`
  - ✅ Migration example documented
  - Benefits: 92% token savings, filter by path prefix in isolate

- [x] **get_path_value** - DEPRECATED (Phase 6)
  - ⚠️ Warning added to description
  - ⚠️ Runtime notice in hybrid mode
  - ✅ SDK function: `getPathValue(path)`
  - ✅ Migration example documented
  - Benefits: 96% token savings, query multiple paths in one execution

- [ ] **get_connection_status** - KEEP (Phase 6 decision)
  - SDK function: `getConnectionStatus()`
  - Benefits: Minimal benefit from migration, useful for debugging
  - Decision: Keep legacy tool for troubleshooting purposes

- [ ] **get_initial_context** - KEEP (Phase 6 decision)
  - Provides comprehensive SignalK documentation
  - Decision: Keep legacy tool as one-time context provider

## Migration Examples by Tool

### get_vessel_state → getVesselState()

**Legacy:**
```javascript
// AI calls: get_vessel_state
// Returns: ALL vessel data (~2000 tokens)
```

**New:**
```javascript
(async () => {
  const vessel = await getVesselState();

  // Filter to exactly what's needed
  return JSON.stringify({
    name: vessel.data.name?.value,
    position: vessel.data["navigation.position"]?.value,
    speed: vessel.data["navigation.speedOverGround"]?.value
  });
})()
// Returns: ~200 tokens
```

### get_ais_targets → getAisTargets()

**Legacy:**
```javascript
// AI calls: get_ais_targets
// Returns: ALL targets (~10000 tokens for 50 targets)
```

**New:**
```javascript
(async () => {
  const response = await getAisTargets({ pageSize: 50 });

  // Filter in isolate - HUGE savings!
  const closeTargets = response.targets.filter(t =>
    t.distanceMeters && t.distanceMeters < 1852 // 1nm
  );

  return JSON.stringify({
    total: response.count,
    withinOneNm: closeTargets.length,
    closest: closeTargets.slice(0, 3)
  });
})()
// Returns: ~200 tokens (95% savings!)
```

### Multi-Tool Workflows

**Legacy (3 tool calls):**
```javascript
// Call 1: get_vessel_state (~2000 tokens)
// Call 2: get_ais_targets (~10000 tokens)
// Call 3: get_active_alarms (~1000 tokens)
// Total: ~13000 tokens
```

**New (1 code execution):**
```javascript
(async () => {
  // All calls in isolate
  const vessel = await getVesselState();
  const targets = await getAisTargets({ pageSize: 50 });
  const alarms = await getActiveAlarms();

  // Process ALL data in isolate
  const criticalAlarms = alarms.alarms.filter(a =>
    a.state === 'alarm' || a.state === 'emergency'
  );

  const closeVessels = targets.targets.filter(t =>
    t.distanceMeters && t.distanceMeters < 1852
  );

  // Return summary only
  return JSON.stringify({
    vessel: vessel.data.name?.value,
    position: vessel.data["navigation.position"]?.value,
    criticalAlarms: criticalAlarms.length,
    closeVessels: closeVessels.length
  });
})()
// Returns: ~300 tokens (97% savings!)
```

## Deprecation Timeline

### Phase 5 (Complete)
- ✅ First tool deprecated (get_vessel_state)
- ✅ Deprecation warnings active in hybrid mode
- ✅ Migration examples documented

### Phase 6 (Complete)
- ✅ Deprecation warnings added to ALL legacy tools
- ✅ All tool descriptions updated with migration examples
- ✅ Comparison tests created for all deprecated tools
- ✅ Decision: Keep get_connection_status and get_initial_context for debugging/docs

### Phase 7 (Next)
- Measure adoption of execute_code vs legacy tools
- Collect feedback from AI usage patterns
- Refine SDK functions based on real usage

### Phase 8 (Final)
- Switch to code-only mode by default
- Remove legacy tools entirely
- Keep tools mode available for backward compatibility

## Testing Migration

### Manual Testing

1. **Test legacy tool (should show warning):**
   ```
   Ask Claude: "Use get_vessel_state to check my position"
   Expected: Warning message + full vessel data
   ```

2. **Test new approach:**
   ```
   Ask Claude: "Use execute_code with getVesselState to get my vessel name and position only"
   Expected: Filtered data, no warning, ~90% fewer tokens
   ```

3. **Compare token usage:**
   - Check response sizes in Claude Desktop
   - Verify filtering happens in isolate
   - Confirm deprecation warning displays

### Automated Testing

See `src/tool-migration.spec.ts` for automated comparison tests.

## Best Practices

### For Tool Developers

1. **Always show migration path** in deprecation message
2. **Provide working code examples** AI can copy/paste
3. **Explain benefits clearly** (token savings, features)
4. **Only deprecate when SDK equivalent exists**

### For AI Clients

1. **Prefer execute_code** when available
2. **Filter data in isolate** before returning
3. **Combine multiple calls** in one execution
4. **Return JSON.stringify()** of results

### For End Users

1. **Hybrid mode** gives smooth transition
2. **Warnings are informative**, not errors
3. **Performance improves automatically** as AI learns new patterns
4. **No breaking changes** during deprecation period

## FAQ

**Q: Will legacy tools stop working?**
A: No. In hybrid mode, both approaches work. Legacy tools will only be removed in a future major version with plenty of notice.

**Q: What if I want to keep using legacy tools?**
A: Set `EXECUTION_MODE=tools` to disable deprecation warnings and execute_code.

**Q: How do I know which approach the AI is using?**
A: Check the tool name in MCP protocol logs. Legacy tools have their original names, code execution uses `execute_code`.

**Q: Can I mix legacy and code execution?**
A: Yes! Hybrid mode supports both. The AI will gradually learn to prefer execute_code as it sees the benefits.

**Q: What if execute_code fails?**
A: The AI can fall back to legacy tools automatically. Both approaches remain available in hybrid mode.

## Summary

Phase 5 establishes the **strangler pattern** for gradually migrating from legacy tools to code execution:

✅ **Deprecation warnings** guide AI to better approach
✅ **Migration examples** make adoption easy
✅ **Hybrid mode** ensures no breaking changes
✅ **Clear benefits** (94-96% token savings) drive adoption
✅ **Graceful transition** over multiple phases

The goal: AI learns to prefer `execute_code` naturally, without forcing changes on users.

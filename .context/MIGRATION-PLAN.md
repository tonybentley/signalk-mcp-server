# Code Execution Mode: Strangler Pattern Migration Plan

## Strategy Overview

Incrementally replace the existing tools-based MCP server with a code-execution-based architecture using the **strangler pattern**. New code execution capabilities will coexist with legacy tools, gradually replacing them until the old system can be safely removed.

## Migration Phases

### Phase 1: Foundation (PoC) ✓ CURRENT
**Goal**: Prove V8 isolate execution works with minimal code

**Deliverables**:
- [ ] `src/execution-engine/isolate-sandbox.ts` - V8 isolate wrapper
- [ ] Basic execution with console.log capture
- [ ] Simple test: execute `console.log('hello')` and capture output
- [ ] Add `isolated-vm` dependency

**Success Criteria**: Can execute agent-written code in isolated environment

**Estimated Time**: 1 day

---

### Phase 2: Binding Layer
**Goal**: Reuse existing `SignalKClient` via RPC-style bindings

**Deliverables**:
- [ ] `src/bindings/signalk-binding.ts` - Wraps existing `SignalKClient`
- [ ] Inject binding into isolate context (no network access from sandbox)
- [ ] Test: Agent code calls `await signalk.getVesselState()` via binding

**Reuse From Existing**:
- ✅ `src/signalk-client.ts` - No changes needed, used by binding layer
- ✅ All HTTP/WebSocket logic intact

**Success Criteria**: Agent code can call SignalK methods without direct network access

**Estimated Time**: 2 days

---

### Phase 3: SDK Auto-Generation
**Goal**: Generate TypeScript SDK from existing MCP tool definitions

**Deliverables**:
- [ ] `src/sdk/generator.ts` - Converts MCP tools to TypeScript functions
- [ ] Generate SDK at server startup from `ListToolsRequestSchema`
- [ ] Inject generated SDK into isolate context
- [ ] Test: Generated SDK matches current tool signatures

**Input**: Existing 7 MCP tools
**Output**: 7 typed TypeScript functions

**Success Criteria**: Agent code uses `await getVesselState()` instead of MCP tool calls

**Estimated Time**: 3 days

---

### Phase 4: Hybrid Mode
**Goal**: Support both tools-based and code-execution modes simultaneously

**Deliverables**:
- [ ] Add `executionMode` config: `'tools' | 'code' | 'hybrid'`
- [ ] New MCP tool: `execute_code` (for code execution mode)
- [ ] Deprecation warnings on legacy tool usage (when in hybrid mode)
- [ ] Environment variable: `EXECUTION_MODE=hybrid`

**Architecture**:
```typescript
export class SignalKMCPServer {
  constructor(options: {
    executionMode?: 'tools' | 'code' | 'hybrid';
  }) {
    // Default: hybrid (backward compatible)
    this.executionMode = options.executionMode || 'hybrid';

    if (this.executionMode === 'tools' || this.executionMode === 'hybrid') {
      this.setupLegacyToolHandlers(); // Existing tools
    }

    if (this.executionMode === 'code' || this.executionMode === 'hybrid') {
      this.setupCodeExecutionHandler(); // New execute_code tool
    }
  }
}
```

**Success Criteria**: Agent can use either old tools OR new code execution

**Estimated Time**: 2 days

---

### Phase 5: First Tool Migration (with Tests)
**Goal**: Migrate one tool completely, prove the pattern works

**Target**: `get_vessel_state` (simplest, most used)

**Deliverables**:
- [ ] SDK function: `getVesselState()` via binding
- [ ] Unit tests: SDK function behavior matches old tool
- [ ] E2E test: Agent uses SDK vs tool, validate identical output
- [ ] Performance test: Measure token reduction
- [ ] Mark legacy tool as deprecated in description

**Success Criteria**:
- SDK function passes all existing `get_vessel_state` tests
- Token usage reduced by 50%+ for multi-step workflows
- Zero regressions

**Estimated Time**: 3 days

---

### Phase 6: Full SDK Coverage
**Goal**: Migrate all 7 tools to SDK pattern

**Tools to Migrate**:
1. ✅ `get_vessel_state` (Phase 5)
2. [ ] `get_ais_targets` - With filtering examples
3. [ ] `get_active_alarms` - With subscription examples
4. [ ] `list_available_paths` - With search/filter
5. [ ] `get_path_value` - With caching patterns
6. [ ] `get_connection_status` - Read-only binding info
7. [ ] `get_initial_context` - Static resource access

**Deliverables**:
- [ ] Complete SDK module structure (`src/sdk/navigation`, `src/sdk/ais`, etc.)
- [ ] All 7 tools have SDK equivalents
- [ ] Unit + E2E tests for each
- [ ] Example agent code showing token savings
- [ ] Deprecation notices on all legacy tools

**Success Criteria**: Every legacy tool has a tested SDK equivalent

**Estimated Time**: 2 weeks

---

### Phase 7: Workspace & Skills
**Goal**: Add state persistence and reusable patterns

**Deliverables**:
- [ ] `src/bindings/workspace-binding.ts` - Sandboxed file access
- [ ] `workspace/` directory (gitignored)
- [ ] Skills directory structure
- [ ] Example skill: `collision-detection` (CPA calculation)
- [ ] Skill loading/discovery mechanism

**Success Criteria**: Agent can save state between sessions, reuse skills

**Estimated Time**: 1 week

---

### Phase 8: Production Hardening
**Goal**: Security, performance, monitoring

**Deliverables**:
- [ ] Resource limits (memory, CPU, timeout)
- [ ] Error handling and recovery
- [ ] Execution logging and telemetry
- [ ] Security audit (isolate escape attempts)
- [ ] Performance benchmarks
- [ ] Production deployment guide

**Success Criteria**:
- Zero successful isolate escapes
- <100ms execution overhead
- Comprehensive error messages

**Estimated Time**: 1 week

---

### Phase 9: Deprecation & Removal
**Goal**: Remove legacy tools-based code

**Prerequisites**:
- [ ] All users migrated to code execution mode
- [ ] 90+ days of deprecation warnings
- [ ] Zero reported issues with SDK

**Deliverables**:
- [ ] Remove legacy tool handlers
- [ ] Remove `executionMode` config (code-only)
- [ ] Update documentation
- [ ] Bump to v3.0.0 (breaking change)

**Success Criteria**: Codebase only contains code execution path

**Estimated Time**: 2 days

---

## Key Principles

1. **No Breaking Changes Until Phase 9**: Hybrid mode maintains backward compatibility
2. **Test Coverage First**: Every new capability has tests before deprecating old code
3. **Reuse Existing Infrastructure**: `SignalKClient`, validation, error handling all preserved
4. **Incremental Deployment**: Each phase is deployable and reversible
5. **Measure Everything**: Token usage, execution time, error rates tracked at each phase

## Risk Mitigation

### Risk: V8 isolates fail on some platforms
**Mitigation**: Keep hybrid mode, fallback to tools if isolate initialization fails

### Risk: Performance degradation
**Mitigation**: Benchmark at each phase, abort if >10% slower than baseline

### Risk: Security vulnerabilities
**Mitigation**: External security audit before Phase 8, bug bounty program

### Risk: User migration resistance
**Mitigation**: Maintain hybrid mode indefinitely, provide migration guides

## Success Metrics

### Phase 5 (First Migration)
- Token usage: 50%+ reduction for multi-step workflows
- Execution time: <100ms overhead vs direct tool call
- Test coverage: 90%+ for SDK functions

### Phase 6 (Full Coverage)
- All 7 tools migrated with tests
- Zero regressions in existing functionality
- Documentation complete

### Phase 8 (Production)
- 1000+ executions without isolate escape
- <1% error rate
- 95th percentile execution time <200ms

---

## Current Status

**Branch**: `feature/code-execution-mode`
**Phase**: 1 (Foundation PoC)
**Next Task**: Implement V8 isolate sandbox wrapper

---

## Development Workflow

```bash
# Feature branch development
git checkout feature/code-execution-mode

# Run existing tests (ensure no regressions)
npm run test:unit
npm run test:e2e

# Build and test new code
npm run build
npm run typecheck
npm run lint

# Verify hybrid mode works
EXECUTION_MODE=hybrid npm run start:prod
EXECUTION_MODE=code npm run start:prod
EXECUTION_MODE=tools npm run start:prod  # Legacy

# Run full CI before merging
npm run ci:full
```

## Rollback Plan

Each phase is independently reversible:
- **Phase 1-3**: New code not exposed to users, can delete without impact
- **Phase 4-6**: Hybrid mode allows instant rollback to `executionMode=tools`
- **Phase 7-8**: Disable workspace/skills via config flag
- **Phase 9**: Git revert, re-enable hybrid mode

---

**Last Updated**: 2025-01-15
**Status**: Phase 1 in progress

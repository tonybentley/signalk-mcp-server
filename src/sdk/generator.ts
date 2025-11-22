/**
 * SDK Generator - Auto-generates TypeScript SDK from MCP tool definitions
 *
 * This generator converts MCP tool schemas into TypeScript functions that can be
 * injected into V8 isolates, providing type-safe access to SignalK data.
 *
 * Benefits:
 * - Keeps SDK in sync with MCP tools automatically
 * - Provides TypeScript types and JSDoc comments
 * - Handles parameters and options correctly
 * - No manual SDK maintenance required
 */

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties?: Record<string, any>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

/**
 * Generate TypeScript SDK code from MCP tool definitions
 *
 * @param tools - Array of MCP tool definitions
 * @returns TypeScript code as string
 *
 * @example
 * const tools = [
 *   {
 *     name: 'get_vessel_state',
 *     description: 'Get current vessel navigation data',
 *     inputSchema: { type: 'object', properties: {} }
 *   }
 * ];
 * const sdk = generateSDK(tools);
 * // Returns TypeScript function definitions
 */
export function generateSDK(tools: MCPTool[]): string {
  const functions = tools.map(tool => generateFunction(tool));

  return `
/**
 * Auto-generated SignalK SDK
 * Generated from MCP tool definitions
 *
 * Usage in agent code:
 * const vessel = await getVesselState();
 * const targets = await getAISTargets({ page: 1, pageSize: 10 });
 */

${functions.join('\n\n')}
`.trim();
}

/**
 * Generate a single TypeScript function from MCP tool definition
 *
 * @param tool - MCP tool definition
 * @param mode - 'typescript' for .ts files, 'javascript' for isolates
 * @returns Function code
 */
function generateFunction(tool: MCPTool, mode: 'typescript' | 'javascript' = 'typescript'): string {
  const functionName = toCamelCase(tool.name);
  const hasParams = tool.inputSchema.properties && Object.keys(tool.inputSchema.properties).length > 0;

  // Generate JSDoc comment
  const jsdoc = generateJSDoc(tool);

  // Generate function signature based on mode
  let params: string;
  if (mode === 'javascript') {
    // JavaScript: no types, just parameter name
    params = hasParams ? 'options' : '';
  } else {
    // TypeScript: with types
    const paramType = hasParams ? generateParamType(tool.inputSchema) : '';
    params = hasParams ? `options${isRequired(tool) ? '' : '?'}: ${paramType}` : '';
  }

  // Generate function body
  const callArgs = hasParams ? 'options' : 'undefined';

  return `${jsdoc}
async function ${functionName}(${params}) {
  const result = await signalk.${functionName}(${callArgs});
  return result;
}`;
}

/**
 * Generate TypeScript parameter type from JSON schema
 */
function generateParamType(schema: any): string {
  if (!schema.properties || Object.keys(schema.properties).length === 0) {
    return '{}';
  }

  const props = Object.entries(schema.properties).map(([key, prop]: [string, any]) => {
    const optional = !schema.required?.includes(key);
    const type = jsonSchemaTypeToTS(prop.type);
    return `  ${key}${optional ? '?' : ''}: ${type};`;
  });

  return `{\n${props.join('\n')}\n}`;
}

/**
 * Convert JSON schema type to TypeScript type
 */
function jsonSchemaTypeToTS(type: string): string {
  const typeMap: Record<string, string> = {
    'string': 'string',
    'number': 'number',
    'integer': 'number',
    'boolean': 'boolean',
    'object': 'any',
    'array': 'any[]',
  };

  return typeMap[type] || 'any';
}

/**
 * Generate JSDoc comment from tool definition
 */
function generateJSDoc(tool: MCPTool): string {
  const lines = ['/**', ` * ${tool.description}`];

  // Add parameter descriptions
  if (tool.inputSchema.properties) {
    lines.push(' *');
    for (const [key, prop] of Object.entries(tool.inputSchema.properties)) {
      const propAny = prop;
      if (propAny.description) {
        const optional = !tool.inputSchema.required?.includes(key);
        lines.push(` * @param ${optional ? '[' : ''}options.${key}${optional ? ']' : ''} - ${propAny.description}`);
      }
    }
  }

  lines.push(' */');
  return lines.join('\n');
}

/**
 * Convert snake_case to camelCase
 */
function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Check if tool has required parameters
 */
function isRequired(tool: MCPTool): boolean {
  return tool.inputSchema.required && tool.inputSchema.required.length > 0 || false;
}

/**
 * Generate SDK code and inject into isolate context
 *
 * This function generates the SDK code and prepares it for injection
 * into a V8 isolate context along with the signalk binding.
 *
 * @param tools - MCP tool definitions
 * @returns Object with SDK code and injection helper
 */
export function prepareSDKForIsolate(tools: MCPTool[]): {
  code: string;
  wrapperCode: string;
} {
  // Generate TypeScript SDK for .ts files (with types and exports)
  const tsCode = generateSDK(tools);
  const exportedCode = tsCode.replace(/^async function /gm, 'export async function ');

  // Generate JavaScript SDK for isolate (no types, no exports)
  const jsFunctions = tools.map(tool => generateFunction(tool, 'javascript'));
  const jsCode = jsFunctions.join('\n\n');

  // Dynamically generate global assignments for available functions
  const globalAssignments = tools.map(tool => {
    const functionName = toCamelCase(tool.name);
    return `globalThis.${functionName} = ${functionName};`;
  }).join('\n');

  // Wrapper code to execute in isolate (pure JavaScript)
  const wrapperCode = `
// SDK Functions (JavaScript - no TypeScript types)
${jsCode}

// Make functions available globally in isolate
${globalAssignments}
`.trim();

  return {
    code: exportedCode,  // For TypeScript files
    wrapperCode,         // For isolate injection (pure JS)
  };
}

function clone(value) {
  return structuredClone(value);
}

export function createToolProfile({
  enabledTools = null,
  excludedTools = [],
  schemaProjections = {},
  serverGuidelines = null
} = {}) {
  const enabled = enabledTools === null ? null : new Set(enabledTools);

  const excluded = new Set(excludedTools);

  return Object.freeze({
    serverGuidelines,
    allows(name) {
      return !excluded.has(name) && (enabled === null || enabled.has(name));
    },
    apply(tools) {
      return tools
        .filter((tool) => !excluded.has(tool.name) && (enabled === null || enabled.has(tool.name)))
        .map((tool) => {
          const projectedProperties = schemaProjections[tool.name];
          if (!Array.isArray(projectedProperties)) {
            return clone(tool);
          }

          const allowed = new Set(projectedProperties);
          const projected = clone(tool);
          projected.inputSchema.properties = Object.fromEntries(
            Object.entries(projected.inputSchema.properties ?? {})
              .filter(([name]) => allowed.has(name))
          );
          projected.inputSchema.required = (projected.inputSchema.required ?? [])
            .filter((name) => allowed.has(name));

          return projected;
        });
    }
  });
}

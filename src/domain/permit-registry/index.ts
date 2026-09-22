import { PermitTypeDefinition } from "./types";
import { hotWorkDefinition } from "./hot-work";
import { confinedSpaceDefinition } from "./confined-space";
import { workingAtHeightDefinition } from "./height";
import { electricalLotoDefinition } from "./loto";
import { excavationDefinition } from "./excavation";

const registry = new Map<string, PermitTypeDefinition>();

// Register default industrial permit types
registry.set(hotWorkDefinition.key, hotWorkDefinition);
registry.set(confinedSpaceDefinition.key, confinedSpaceDefinition);
registry.set(workingAtHeightDefinition.key, workingAtHeightDefinition);
registry.set(electricalLotoDefinition.key, electricalLotoDefinition);
registry.set(excavationDefinition.key, excavationDefinition);

export function getPermitType(key: string): PermitTypeDefinition | undefined {
  return registry.get(key);
}

export function getAllPermitTypes(): PermitTypeDefinition[] {
  return Array.from(registry.values());
}

export function registerPermitType(definition: PermitTypeDefinition): void {
  registry.set(definition.key, definition);
}

export function validatePermitTypeData(
  key: string,
  typeData: unknown,
  permitContext?: unknown
): { success: true; data: unknown } | { success: false; errors: string[] } {
  const definition = getPermitType(key);
  if (!definition) {
    return {
      success: false,
      errors: [`Unsupported permit type: '${key}'. Available types: ${Array.from(registry.keys()).join(", ")}`],
    };
  }

  const result = definition.schema.safeParse(typeData);
  if (!result.success) {
    const issues = result.error.issues;
    const errors = issues.map((e) => `${e.path ? e.path.map(String).join(".") : "field"}: ${e.message}`);
    return { success: false, errors };
  }

  if (definition.validateBusinessRules) {
    const ruleError = definition.validateBusinessRules(result.data, permitContext);
    if (ruleError) {
      return { success: false, errors: [ruleError] };
    }
  }

  return { success: true, data: result.data };
}

export * from "./types";
export * from "./hot-work";
export * from "./confined-space";
export * from "./height";
export * from "./loto";
export * from "./excavation";

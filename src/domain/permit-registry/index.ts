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
  if (registry.has(definition.key)) {
    throw new Error(`Permit type '${definition.key}' is already registered in PermitTypeRegistry.`);
  }
  registry.set(definition.key, definition);
}

export function unregisterPermitType(key: string): boolean {
  return registry.delete(key);
}

export function validateRegistryFormDrift(definition: PermitTypeDefinition): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const formFieldNames = new Set<string>();

  for (const section of definition.fieldSections) {
    for (const field of section.fields) {
      if (formFieldNames.has(field.name)) {
        errors.push(`Duplicate form field '${field.name}' in section '${section.title}'`);
      }
      formFieldNames.add(field.name);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const schemaAny = definition.schema as any;
  if (schemaAny && schemaAny.shape) {
    const schemaKeys = Object.keys(schemaAny.shape);
    const schemaKeySet = new Set(schemaKeys);

    // 1. Every form field exists in Zod schema
    for (const fieldName of formFieldNames) {
      if (!schemaKeySet.has(fieldName)) {
        errors.push(`Form field '${fieldName}' does not exist in Zod schema for permit type '${definition.key}'`);
      }
    }

    // 2. Every required schema field has form configuration
    for (const key of schemaKeys) {
      const fieldSchema = schemaAny.shape[key];
      const isOptional = fieldSchema?.isOptional?.() || fieldSchema?._def?.typeName === "ZodOptional" || fieldSchema?._def?.typeName === "ZodDefault";
      if (!isOptional && !formFieldNames.has(key)) {
        errors.push(`Required schema field '${key}' is missing from form fieldSections for permit type '${definition.key}'`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
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

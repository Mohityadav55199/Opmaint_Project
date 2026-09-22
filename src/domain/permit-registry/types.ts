import { z } from "zod";
import { ApprovalSlot } from "../types";

export interface FormFieldOption {
  value: string;
  label: string;
}

export interface FormFieldConfig {
  name: string;
  label: string;
  type: "text" | "number" | "select" | "boolean" | "datetime" | "textarea" | "string-list";
  placeholder?: string;
  helpText?: string;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: FormFieldOption[];
  defaultValue?: unknown;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface PermitTypeDefinition<T = any> {
  key: string;
  label: string;
  description: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: z.ZodType<T, any, any>;
  requiredSlots: ApprovalSlot[];
  defaultPrecautions: { id: string; label: string; mandatory?: boolean }[];
  fieldSections: {
    title: string;
    description?: string;
    fields: FormFieldConfig[];
  }[];
  validateBusinessRules?: (typeData: T, permitContext?: unknown) => string | null;
}

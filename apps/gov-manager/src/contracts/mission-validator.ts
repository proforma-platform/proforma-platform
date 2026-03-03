import type { MissionRequest } from "./mission";

export function validateMissionRequest(input: unknown): { valid: boolean; errors: string[]; data?: MissionRequest } {
  const errors: string[] = [];
  const obj = input as Partial<MissionRequest>;

  if (!obj || typeof obj !== "object") {
    return { valid: false, errors: ["body must be an object"] };
  }
  if (!obj.udn || typeof obj.udn !== "string") {
    errors.push("udn is required");
  }
  if (!obj.mission || typeof obj.mission !== "object") {
    errors.push("mission is required");
  } else if (!obj.mission.id || typeof obj.mission.id !== "string") {
    errors.push("mission.id is required");
  } else {
    if (obj.mission.branch !== undefined && typeof obj.mission.branch !== "string") {
      errors.push("mission.branch must be string");
    }
    if (obj.mission.agent_id !== undefined && typeof obj.mission.agent_id !== "string") {
      errors.push("mission.agent_id must be string");
    }
  }
  if (obj.created_by !== undefined && typeof obj.created_by !== "string") {
    errors.push("created_by must be string");
  }
  if (obj.autofix_control !== undefined) {
    if (!obj.autofix_control || typeof obj.autofix_control !== "object") {
      errors.push("autofix_control must be an object");
    } else {
      const af = obj.autofix_control;
      if (af.enabled !== undefined && typeof af.enabled !== "boolean") {
        errors.push("autofix_control.enabled must be boolean");
      }
      if (af.max_rounds !== undefined && af.max_rounds !== 1 && af.max_rounds !== 2) {
        errors.push("autofix_control.max_rounds must be 1 or 2");
      }
      if (af.on_exhaust !== undefined && af.on_exhaust !== "pause_owner") {
        errors.push("autofix_control.on_exhaust must be pause_owner");
      }
    }
  }
  if (obj.token_control !== undefined) {
    if (!obj.token_control || typeof obj.token_control !== "object") {
      errors.push("token_control must be an object");
    } else {
      const tc = obj.token_control;
      if (tc.enabled !== undefined && typeof tc.enabled !== "boolean") {
        errors.push("token_control.enabled must be boolean");
      }
      if (tc.hard_stop !== undefined && typeof tc.hard_stop !== "boolean") {
        errors.push("token_control.hard_stop must be boolean");
      }
      validatePositiveNumber(tc.budget_usd, "token_control.budget_usd", errors);
      validatePositiveNumber(tc.budget_brl, "token_control.budget_brl", errors);
      validatePositiveNumber(tc.max_input_tokens, "token_control.max_input_tokens", errors, true);
      validatePositiveNumber(tc.max_output_tokens, "token_control.max_output_tokens", errors, true);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors,
    data: {
      udn: obj.udn as string,
      mission: {
        id: obj.mission!.id as string,
        ...(typeof obj.mission!.target === "string" ? { target: obj.mission!.target } : {}),
        ...(typeof obj.mission!.level === "string" ? { level: obj.mission!.level } : {}),
        ...(typeof obj.mission!.branch === "string" ? { branch: obj.mission!.branch } : {}),
        ...(typeof obj.mission!.agent_id === "string" ? { agent_id: obj.mission!.agent_id } : {})
      },
      ...(typeof obj.created_by === "string" ? { created_by: obj.created_by } : {}),
      ...(obj.autofix_control ? { autofix_control: obj.autofix_control } : {}),
      ...(obj.token_control ? { token_control: obj.token_control } : {})
    }
  };
}

function validatePositiveNumber(value: unknown, key: string, errors: string[], integerOnly = false): void {
  if (value === undefined) {
    return;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    errors.push(`${key} must be a positive number`);
    return;
  }
  if (integerOnly && !Number.isInteger(value)) {
    errors.push(`${key} must be an integer`);
  }
}

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
  if (obj.parts !== undefined) {
    if (!Array.isArray(obj.parts) || obj.parts.length === 0) {
      errors.push("parts must be a non-empty array");
    } else {
      (obj.parts as unknown[]).forEach((part, index) => {
        if (!part || typeof part !== "object") {
          errors.push(`parts[${index}] must be an object`);
          return;
        }
        const p = part as Record<string, unknown>;
        if (!p.part_id || typeof p.part_id !== "string") {
          errors.push(`parts[${index}].part_id is required`);
        }
        if (!p.goal || typeof p.goal !== "string") {
          errors.push(`parts[${index}].goal is required`);
        }
        if (!p.executor || typeof p.executor !== "string" || !["STAFF", "CPP", "CPP-IA"].includes(p.executor)) {
          errors.push(`parts[${index}].executor must be STAFF|CPP|CPP-IA`);
        }
        if (!p.priority || typeof p.priority !== "string" || !["P0", "P1", "P2"].includes(p.priority)) {
          errors.push(`parts[${index}].priority must be P0|P1|P2`);
        }
      });
    }
  }
  if (obj.prompt_ref !== undefined) {
    if (!obj.prompt_ref || typeof obj.prompt_ref !== "object") {
      errors.push("prompt_ref must be an object");
    } else {
      const pr = obj.prompt_ref;
      if (!pr.prompt_id || typeof pr.prompt_id !== "string") {
        errors.push("prompt_ref.prompt_id is required");
      }
      if (pr.prompt_hash !== undefined && typeof pr.prompt_hash !== "string") {
        errors.push("prompt_ref.prompt_hash must be string");
      }
      if (pr.inject_mode !== undefined && pr.inject_mode !== "append_ref" && pr.inject_mode !== "replace_udn") {
        errors.push("prompt_ref.inject_mode must be append_ref|replace_udn");
      }
      if (pr.variables !== undefined) {
        if (!pr.variables || typeof pr.variables !== "object" || Array.isArray(pr.variables)) {
          errors.push("prompt_ref.variables must be an object");
        } else {
          for (const [k, v] of Object.entries(pr.variables)) {
            if (typeof k !== "string" || k.trim() === "") {
              errors.push("prompt_ref.variables key must be non-empty string");
              break;
            }
            if (typeof v !== "string") {
              errors.push("prompt_ref.variables values must be string");
              break;
            }
          }
        }
      }
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
      ...(obj.token_control ? { token_control: obj.token_control } : {}),
      ...(Array.isArray(obj.parts)
        ? {
            parts: (obj.parts as unknown[]).map((part) => ({
              part_id: String((part as Record<string, unknown>).part_id),
              goal: String((part as Record<string, unknown>).goal),
              executor: String((part as Record<string, unknown>).executor) as "STAFF" | "CPP" | "CPP-IA",
              priority: String((part as Record<string, unknown>).priority) as "P0" | "P1" | "P2"
            }))
          }
        : {})
      ,
      ...(obj.prompt_ref && typeof obj.prompt_ref === "object"
        ? {
            prompt_ref: {
              prompt_id: String(obj.prompt_ref.prompt_id),
              ...(typeof obj.prompt_ref.prompt_hash === "string"
                ? { prompt_hash: obj.prompt_ref.prompt_hash }
                : {}),
              ...(typeof obj.prompt_ref.inject_mode === "string"
                ? {
                    inject_mode: obj.prompt_ref.inject_mode as
                      | "append_ref"
                      | "replace_udn"
                  }
                : {}),
              ...(obj.prompt_ref.variables &&
              typeof obj.prompt_ref.variables === "object" &&
              !Array.isArray(obj.prompt_ref.variables)
                ? {
                    variables: Object.fromEntries(
                      Object.entries(obj.prompt_ref.variables as Record<string, unknown>).map(
                        ([k, v]) => [k, String(v)]
                      )
                    )
                  }
                : {})
            }
          }
        : {})
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

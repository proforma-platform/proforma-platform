export interface MissionRequest {
  udn: string;
  mission: {
    id: string;
    target?: string;
    level?: string;
  };
}

export interface MissionResponse {
  status: "accepted" | "rejected";
  mission_id: string;
  ledger_ref: string;
  contract_version: "v7-baseline";
  errors: string[];
}

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
        ...(typeof obj.mission!.level === "string" ? { level: obj.mission!.level } : {})
      }
    }
  };
}

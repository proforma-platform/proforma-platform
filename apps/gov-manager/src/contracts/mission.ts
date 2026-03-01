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

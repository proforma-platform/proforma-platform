export interface AutofixControl {
  enabled?: boolean;
  max_rounds?: 1 | 2;
  on_exhaust?: "pause_owner";
}

export interface TokenControl {
  enabled?: boolean;
  budget_usd?: number;
  budget_brl?: number;
  max_input_tokens?: number;
  max_output_tokens?: number;
  hard_stop?: boolean;
}

export interface MissionPart {
  part_id: string;
  goal: string;
  executor: "STAFF" | "CPP" | "CPP-IA";
  priority: "P0" | "P1" | "P2";
}

export interface PromptReference {
  prompt_id: string;
  prompt_hash?: string;
  inject_mode?: "append_ref" | "replace_udn";
  variables?: Record<string, string>;
}

export interface MissionRequest {
  udn: string;
  mission: {
    id: string;
    target?: string;
    notes?: string;
    level?: string;
    branch?: string;
    agent_id?: string;
  };
  created_by?: string;
  autofix_control?: AutofixControl;
  token_control?: TokenControl;
  parts?: MissionPart[];
  prompt_ref?: PromptReference;
}

export interface MissionResponse {
  status: "accepted" | "rejected";
  mission_id: string;
  ledger_ref: string;
  contract_version: "v7-baseline";
  errors: string[];
}

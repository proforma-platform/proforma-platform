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

export interface MissionRequest {
  udn: string;
  mission: {
    id: string;
    target?: string;
    level?: string;
    branch?: string;
    agent_id?: string;
  };
  created_by?: string;
  autofix_control?: AutofixControl;
  token_control?: TokenControl;
}

export interface MissionResponse {
  status: "accepted" | "rejected";
  mission_id: string;
  ledger_ref: string;
  contract_version: "v7-baseline";
  errors: string[];
}

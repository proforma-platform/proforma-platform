export interface TDVResult {
  valid: boolean;
  reasons: string[];
}

export function validateTDVSignal(value: string): TDVResult {
  if (!value || value.trim().length < 8) {
    return { valid: false, reasons: ["signal too short"] };
  }
  return { valid: true, reasons: [] };
}

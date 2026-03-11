import { type TDVValidation, validateSignalByTDV } from "./schema-v1";

export type { TDVValidation } from "./schema-v1";
export { TDV_SCHEMA_V1, TDV_SCHEMA_VERSION, tdvRootHash, validateSignalByTDV } from "./schema-v1";

export function validateTDVSignal(value: string): TDVValidation {
  return validateSignalByTDV(value);
}

import type { QueueStatus } from "./execution-queue";

export type TransitionSource = "operations-queue" | "operations-queue-relay" | "operations-sessions";

export interface CompletionContractInput {
  completion_ack?: unknown;
  completion_proof?: unknown;
  delivery_summary?: unknown;
  validation_summary?: unknown;
  request_id?: unknown;
}

export interface TransitionValidationInput {
  source: TransitionSource;
  current_status: QueueStatus;
  next_status: QueueStatus;
  completion?: CompletionContractInput;
}

export interface TransitionValidationSuccess {
  ok: true;
}

export interface TransitionValidationFailure {
  ok: false;
  status: 409 | 422;
  error_code:
    | "TRANSITION_INVALID_DONE_REQUIRES_IN_PROGRESS"
    | "COMPLETE_REQUIRES_ACK_PROOF_DELIVERY_VALIDATION";
  message: string;
}

export type TransitionValidationResult = TransitionValidationSuccess | TransitionValidationFailure;

function truthy(value: unknown): boolean {
  const clean = String(value ?? "").trim().toLowerCase();
  return clean === "true" || clean === "1" || clean === "yes" || clean === "ok";
}

function hasText(value: unknown): boolean {
  return Boolean(String(value ?? "").trim());
}

export function validateQueueTransition(input: TransitionValidationInput): TransitionValidationResult {
  if (input.next_status !== "done") {
    return { ok: true };
  }

  if (input.current_status !== "in_progress") {
    return {
      ok: false,
      status: 409,
      error_code: "TRANSITION_INVALID_DONE_REQUIRES_IN_PROGRESS",
      message: `Transição bloqueada: ${input.current_status} -> done.`
    };
  }

  const completion = input.completion || {};
  if (
    !truthy(completion.completion_ack) ||
    !hasText(completion.completion_proof) ||
    !hasText(completion.delivery_summary) ||
    !hasText(completion.validation_summary) ||
    !hasText(completion.request_id)
  ) {
    return {
      ok: false,
      status: 422,
      error_code: "COMPLETE_REQUIRES_ACK_PROOF_DELIVERY_VALIDATION",
      message: "Conclusão requer completion_ack, completion_proof, delivery_summary, validation_summary e request_id."
    };
  }

  return { ok: true };
}

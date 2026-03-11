import { describe, expect, it } from "vitest";
import { validateQueueTransition } from "../core/transition-validator";

describe("transition-validator", () => {
  it("accepts done when completion contract is complete", () => {
    const result = validateQueueTransition({
      source: "operations-queue",
      current_status: "in_progress",
      next_status: "done",
      completion: {
        completion_ack: true,
        completion_proof: "proof://ok",
        delivery_summary: "entrega ok",
        validation_summary: "validação ok",
        request_id: "req-1"
      }
    });
    expect(result.ok).toBe(true);
  });

  it("rejects done from non-in-progress status", () => {
    const result = validateQueueTransition({
      source: "operations-queue-relay",
      current_status: "open",
      next_status: "done",
      completion: {
        completion_ack: true,
        completion_proof: "proof://ok",
        delivery_summary: "entrega ok",
        validation_summary: "validação ok",
        request_id: "req-1"
      }
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error_code).toBe("TRANSITION_INVALID_DONE_REQUIRES_IN_PROGRESS");
    }
  });

  it("rejects done with incomplete completion contract", () => {
    const result = validateQueueTransition({
      source: "operations-sessions",
      current_status: "in_progress",
      next_status: "done",
      completion: {
        completion_ack: true,
        completion_proof: "proof://ok",
        delivery_summary: "",
        validation_summary: "validação ok",
        request_id: "req-1"
      }
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error_code).toBe("COMPLETE_REQUIRES_ACK_PROOF_DELIVERY_VALIDATION");
    }
  });
});

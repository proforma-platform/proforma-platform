import { describe, expect, it } from "vitest";
import { validateQueueTransition } from "../core/transition-validator";

function validCompletion(requestId: string) {
  return {
    completion_ack: true,
    completion_proof: `proof://e2e/${requestId}`,
    delivery_summary: "entrega e2e",
    validation_summary: "validacao e2e",
    request_id: requestId
  };
}

describe("canonical transition e2e", () => {
  it("enforces the same done contract across queue, relay and sessions", () => {
    const channels = ["operations-queue", "operations-queue-relay", "operations-sessions"] as const;

    for (const source of channels) {
      const invalidFromOpen = validateQueueTransition({
        source,
        current_status: "open",
        next_status: "done",
        completion: validCompletion(`${source}-invalid-open`)
      });
      expect(invalidFromOpen.ok).toBe(false);
      if (!invalidFromOpen.ok) {
        expect(invalidFromOpen.error_code).toBe("TRANSITION_INVALID_DONE_REQUIRES_IN_PROGRESS");
      }

      const invalidMissingContract = validateQueueTransition({
        source,
        current_status: "in_progress",
        next_status: "done",
        completion: {
          completion_ack: true,
          completion_proof: "proof://partial",
          delivery_summary: "",
          validation_summary: "validacao e2e",
          request_id: "missing-delivery"
        }
      });
      expect(invalidMissingContract.ok).toBe(false);
      if (!invalidMissingContract.ok) {
        expect(invalidMissingContract.error_code).toBe("COMPLETE_REQUIRES_ACK_PROOF_DELIVERY_VALIDATION");
      }

      const valid = validateQueueTransition({
        source,
        current_status: "in_progress",
        next_status: "done",
        completion: validCompletion(`${source}-valid`)
      });
      expect(valid.ok).toBe(true);
    }
  });
});

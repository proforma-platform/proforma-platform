import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestQueueStartAck } from "../core/queue-start-ack";
import type { GovhubSnapshotConfig } from "../core/govhub-snapshots";
import type { QueueItem } from "../core/execution-queue";

const config: GovhubSnapshotConfig = {
  baseUrl: "http://127.0.0.1:15678",
  token: "govhub-test-token",
  latestBasePath: "/webhook/govhub/snapshots/latest",
  ingestPath: "/webhook/govhub/snapshots/ingest"
};

const baseQueueItem: QueueItem = {
  queue_id: "Q-1",
  mission_id: "M-1",
  title: "Implementar ACK",
  description: "descricao",
  kind: "code",
  priority: "P1",
  assignee: "CPP",
  status: "open",
  created_at_utc: "2026-03-06T00:00:00.000Z",
  updated_at_utc: "2026-03-06T00:00:00.000Z"
};

const originalEnv = { ...process.env };
const originalFetch = global.fetch;

describe("requestQueueStartAck", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.GOVHUB_QUEUE_START_ACK_CPP_PATH = "/webhook/govhub/workers/cpp/dispatch";
    process.env.GOVHUB_QUEUE_START_ACK_CPPIA_PATH = "/webhook/govhub/workers/cppia/dispatch";
    process.env.GOVHUB_QUEUE_START_ACK_TIMEOUT_MS = "2000";
    process.env.GOVHUB_QUEUE_START_ACK_STAFF_LOCAL = "true";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("acknowledges STAFF locally when enabled", async () => {
    const result = await requestQueueStartAck(config, {
      queueItem: { ...baseQueueItem, assignee: "STAFF" },
      actor: "staff@gov",
      actorRole: "engineer"
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ack_source).toBe("staff-local");
      expect(result.ack_http_status).toBeNull();
    }
  });

  it("returns START_ACK_ENV_MISSING when token is missing", async () => {
    const configWithoutToken: GovhubSnapshotConfig = { ...config, token: "" };
    const result = await requestQueueStartAck(configWithoutToken, {
      queueItem: baseQueueItem,
      actor: "cpp@gov",
      actorRole: "engineer"
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error_code).toBe("START_ACK_ENV_MISSING");
      expect(result.retriable).toBe(false);
    }
  });

  it("accepts ACK when upstream returns status ok", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "ok" }), { status: 200 })) as typeof fetch;
    const result = await requestQueueStartAck(config, {
      queueItem: baseQueueItem,
      actor: "cpp@gov",
      actorRole: "engineer"
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ack_http_status).toBe(200);
    }
  });

  it("maps abort errors to START_ACK_TIMEOUT", async () => {
    global.fetch = vi.fn().mockRejectedValue(new DOMException("timeout", "AbortError")) as typeof fetch;
    const result = await requestQueueStartAck(config, {
      queueItem: baseQueueItem,
      actor: "cpp@gov",
      actorRole: "engineer"
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error_code).toBe("START_ACK_TIMEOUT");
      expect(result.retriable).toBe(true);
    }
  });

  it("maps non-ack 2xx payloads to START_ACK_INVALID_RESPONSE", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "noop" }), { status: 200 })) as typeof fetch;
    const result = await requestQueueStartAck(config, {
      queueItem: baseQueueItem,
      actor: "cpp@gov",
      actorRole: "engineer"
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error_code).toBe("START_ACK_INVALID_RESPONSE");
    }
  });
});

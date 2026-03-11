import { describe, expect, it } from "vitest";
import { defaultMissionBoardState, syncMissionBoardRelayStatus, type MissionBoardState } from "../core/mission-board-relay";

describe("syncMissionBoardRelayStatus", () => {
  it("moves the mission to done and appends the GOV note once", () => {
    const state: MissionBoardState = {
      ...defaultMissionBoardState(),
      missions: [
        {
          mission_id: "GOV-MANAGER-V1-00032",
          objective: "Fechar missão",
          assignee: "CPP",
          priority: "P1",
          status: "in_progress",
          notes: "Contexto anterior",
          updated_at_utc: "2026-03-07T13:00:00.000Z",
          updated_by: "staff@gov-manager"
        }
      ]
    };

    const note = "Relatório GOV: executor CPP concluiu missão com prova \"proof-00032\" (request_id=req-00032).";
    const first = syncMissionBoardRelayStatus(state, {
      missionId: "GOV-MANAGER-V1-00032",
      objective: "Fechar missão",
      assignee: "CPP",
      priority: "P1",
      status: "done",
      actor: "n8n-cpp-dispatch",
      now: "2026-03-07T14:00:00.000Z",
      completionNote: note
    });
    const second = syncMissionBoardRelayStatus(first, {
      missionId: "GOV-MANAGER-V1-00032",
      objective: "Fechar missão",
      assignee: "CPP",
      priority: "P1",
      status: "done",
      actor: "n8n-cpp-dispatch",
      now: "2026-03-07T14:01:00.000Z",
      completionNote: note
    });

    expect(second.missions).toHaveLength(1);
    expect(second.missions[0]?.status).toBe("done");
    expect(second.missions[0]?.notes).toContain("Contexto anterior");
    expect(second.missions[0]?.notes).toContain(note);
    expect(second.missions[0]?.notes.match(/proof-00032/g)?.length || 0).toBe(1);
  });

  it("creates the mission in the board when only the queue relay knows it", () => {
    const next = syncMissionBoardRelayStatus(defaultMissionBoardState(), {
      missionId: "GOV-MANAGER-V1-00032",
      objective: "Fechar missão",
      assignee: "CPP",
      priority: "P1",
      status: "done",
      actor: "n8n-cpp-dispatch",
      now: "2026-03-07T14:00:00.000Z",
      completionNote: "Relatório GOV: conclusão com prova"
    });

    expect(next.missions[0]?.mission_id).toBe("GOV-MANAGER-V1-00032");
    expect(next.missions[0]?.status).toBe("done");
    expect(next.missions[0]?.notes).toContain("Relatório GOV");
  });
});

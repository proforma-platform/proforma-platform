import { describe, expect, it } from "vitest";
import { stableLedgerRef } from "../core/determinism";

describe("stableLedgerRef", () => {
  it("returns same value for same input", () => {
    const a = stableLedgerRef("GOV-0084", "UDN-X");
    const b = stableLedgerRef("GOV-0084", "UDN-X");
    expect(a).toBe(b);
  });

  it("changes value when input changes", () => {
    const a = stableLedgerRef("GOV-0084", "UDN-X");
    const b = stableLedgerRef("GOV-0084", "UDN-Y");
    expect(a).not.toBe(b);
  });
});

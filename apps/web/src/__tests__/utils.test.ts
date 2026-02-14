import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("deve mesclar classes Tailwind corretamente", () => {
    expect(cn("px-4", "py-2")).toBe("px-4 py-2");
  });

  it("deve resolver conflitos de classes", () => {
    expect(cn("px-4", "px-8")).toBe("px-8");
  });

  it("deve ignorar valores falsy", () => {
    expect(cn("px-4", false && "hidden", undefined, null, "py-2")).toBe("px-4 py-2");
  });
});

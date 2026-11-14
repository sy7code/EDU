import { describe, expect, it } from "vitest";
import { classLabel } from "./classLabel";

describe("classLabel", () => {
  it("c1은 2학년 3반", () => expect(classLabel("c1")).toBe("2학년 3반"));
  it("c2는 2학년 4반", () => expect(classLabel("c2")).toBe("2학년 4반"));
  it("모르는 반은 id를 그대로 붙여 보여준다", () => expect(classLabel("c9")).toBe("c9반"));
});

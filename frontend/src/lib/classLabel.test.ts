import { describe, expect, it } from "vitest";
import { classLabel, rememberClassNames } from "./classLabel";

describe("classLabel", () => {
  it("c1은 2학년 3반", () => expect(classLabel("c1")).toBe("2학년 3반"));
  it("c2는 2학년 4반", () => expect(classLabel("c2")).toBe("2학년 4반"));
  it("모르는 반은 id를 그대로 붙여 보여준다", () => expect(classLabel("c9")).toBe("c9반"));
});

describe("classLabel 서버 반 이름", () => {
  it("서버에서 읽은 이름을 먼저 쓴다", () => {
    rememberClassNames({ "11111111-aaaa": "2학년 3반" });
    expect(classLabel("11111111-aaaa")).toBe("2학년 3반");
  });
  it("빈 이름은 무시한다", () => {
    rememberClassNames({ "22222222-bbbb": "  " });
    expect(classLabel("22222222-bbbb")).toBe("22222222-bbbb반");
  });
});

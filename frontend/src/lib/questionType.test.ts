import { describe, expect, it } from "vitest";
import { classifyQuestion } from "./questionType";

describe("질문 유형 규칙 분류", () => {
  it("답을 달라는 질문은 ANSWER", () => {
    expect(classifyQuestion("꼭짓점 답 알려줘")).toBe("ANSWER");
    expect(classifyQuestion("정답이 뭐야?")).toBe("ANSWER");
    expect(classifyQuestion("그냥 풀이 보여줘")).toBe("ANSWER");
  });
  it("자기 풀이를 확인받으려는 질문은 CHECK", () => {
    expect(classifyQuestion("이렇게 풀었는데 맞아?")).toBe("CHECK");
    expect(classifyQuestion("x=3 나왔는데 확인해줘")).toBe("CHECK");
  });
  it("이유·방법·뜻을 묻는 질문은 CONCEPT", () => {
    expect(classifyQuestion("왜 -b/2a 이야?")).toBe("CONCEPT");
    expect(classifyQuestion("꼭짓점은 어떻게 구해?")).toBe("CONCEPT");
    expect(classifyQuestion("완전제곱식이 뭐야?")).toBe("CONCEPT");
  });
  it("겹치면 ANSWER > CHECK > CONCEPT", () => {
    expect(classifyQuestion("왜 답이 3이야? 그냥 답 알려줘")).toBe("ANSWER");
    expect(classifyQuestion("왜 그런지 이렇게 풀었는데 맞아?")).toBe("CHECK");
  });
  it("해당 없거나 빈 문장은 OTHER", () => {
    expect(classifyQuestion("안녕")).toBe("OTHER");
    expect(classifyQuestion("")).toBe("OTHER");
    expect(classifyQuestion("   ")).toBe("OTHER");
  });
});

describe("질문 유형 최종 리뷰 수정", () => {
  it("'정답'이 들어가도 답을 달라는 말이 아니면 ANSWER가 아니다 (M1)", () => {
    expect(classifyQuestion("정답률이 왜 낮아?")).toBe("CONCEPT");
    expect(classifyQuestion("내가 쓴 정답 맞는지 봐줘")).toBe("CHECK");
    expect(classifyQuestion("정답이 뭐야?")).toBe("ANSWER");
    expect(classifyQuestion("정답 알려줘")).toBe("ANSWER");
  });
});


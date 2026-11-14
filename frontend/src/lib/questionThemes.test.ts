import { describe, expect, it } from "vitest";
import { finalizeThemes, mockThemeGroups } from "./questionThemes";

const owners: Record<string, string> = { q1: "a", q2: "b", q3: "c", q4: "d", q5: "a", q6: "a", q7: "e", q8: "f" };

describe("finalizeThemes", () => {
  it("서로 다른 학생이 3명 미만인 묶음은 버리고 hiddenCount로 센다", () => {
    const r = finalizeThemes(
      [
        { title: "충분", questionIds: ["q1", "q2", "q3"] },
        { title: "두 명", questionIds: ["q1", "q2"] },
        { title: "한 명 여러 질문", questionIds: ["q1", "q5", "q6"] },
      ],
      owners,
    );
    expect(r.themes.map((t) => t.title)).toEqual(["충분"]);
    expect(r.hiddenCount).toBe(2);
  });

  it("학생 수는 질문 수가 아니라 서로 다른 학생 수다", () => {
    const r = finalizeThemes([{ title: "중복", questionIds: ["q1", "q5", "q6", "q2", "q3"] }], owners);
    expect(r.themes[0].studentCount).toBe(3);
  });

  it("학생 수 내림차순, 같으면 제목 오름차순으로 정렬한다", () => {
    const r = finalizeThemes(
      [
        { title: "나", questionIds: ["q1", "q2", "q3"] },
        { title: "가", questionIds: ["q1", "q2", "q3"] },
        { title: "다", questionIds: ["q1", "q2", "q3", "q4"] },
      ],
      owners,
    );
    expect(r.themes.map((t) => t.title)).toEqual(["다", "가", "나"]);
  });

  it("최대 5개만 남기고 나머지는 숨긴 수에 넣지 않는다", () => {
    const raw = ["a", "b", "c", "d", "e", "f", "g"].map((t) => ({ title: t, questionIds: ["q1", "q2", "q3"] }));
    const r = finalizeThemes(raw, owners);
    expect(r.themes).toHaveLength(5);
    expect(r.hiddenCount).toBe(0);
  });

  it("제목은 60자로 자르고 topicName은 없으면 null이다", () => {
    const r = finalizeThemes([{ title: "가".repeat(80), questionIds: ["q1", "q2", "q3"], topicName: "이차함수" }, { title: "나", questionIds: ["q1", "q2", "q3"] }], owners);
    expect(r.themes[0].title).toHaveLength(60);
    expect(r.themes[0].topicName).toBe("이차함수");
    expect(r.themes[1].topicName).toBeNull();
  });

  it("owner를 모르는 질문 ID는 세지 않는다", () => {
    const r = finalizeThemes([{ title: "모름", questionIds: ["q1", "q2", "zz"] }], owners);
    expect(r.themes).toEqual([]);
    expect(r.hiddenCount).toBe(1);
  });
});

describe("mockThemeGroups", () => {
  it("세션 주제 이름으로 묶고 주제가 없으면 기타 질문으로 묶는다", () => {
    const g = mockThemeGroups([
      { id: "q1", text: "왜 그래?", topicName: "이차함수 꼭짓점" },
      { id: "q2", text: "어떻게 구해?", topicName: "이차함수 꼭짓점" },
      { id: "q3", text: "이게 뭐야", topicName: null },
    ]);
    expect(g.map((x) => [x.topicName, x.questionIds])).toEqual([
      ["이차함수 꼭짓점", ["q1", "q2"]],
      [null, ["q3"]],
    ]);
  });

  it("제목은 주제 이름과 가장 많은 질문 유형으로 만든다", () => {
    const g = mockThemeGroups([
      { id: "q1", text: "내 풀이 맞아?", topicName: "일차부등식" },
      { id: "q2", text: "답이 맞는지 확인해 줘", topicName: "일차부등식" },
      { id: "q3", text: "왜 바뀌어?", topicName: "일차부등식" },
    ]);
    expect(g[0].title).toBe("일차부등식 풀이가 맞는지 확인하고 싶어 해요 (풀이 확인 중심)");
  });
});

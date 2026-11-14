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

describe("mockThemeGroups (질문 글 낱말로 묶는 mock AI)", () => {
  const q = (id: string, text: string, topicName: string | null = "이차함수 꼭짓점") => ({ id, text, topicName });

  it("낱말 규칙으로 묶고 제목은 AI가 다시 쓴 문장이다 (학생 원문 아님)", () => {
    const g = mockThemeGroups([
      q("q1", "꼭짓점은 어떤 순서로 구해?"),
      q("q2", "꼭짓점 구하는 방법이 헷갈려"),
      q("q3", "판별식이 0이면 왜 그래?"),
      q("q4", "부등호 방향은 언제 바뀌어?", "일차부등식"),
    ]);
    expect(g.map((x) => [x.title, x.questionIds])).toEqual([
      ["꼭짓점을 구하는 순서가 헷갈려요", ["q1", "q2"]],
      ["판별식과 꼭짓점의 관계가 궁금해요", ["q3"]],
      ["부등호 방향이 바뀌는 때가 헷갈려요", ["q4"]],
    ]);
  });

  it("topicName은 묶음 질문이 모두 같은 세션 주제일 때만 쓰고 아니면 null", () => {
    const g = mockThemeGroups([q("q1", "꼭짓점 구하는 순서?", "이차함수 꼭짓점"), q("q2", "꼭짓점 순서 알려줘", "이차함수 꼭짓점"), q("q3", "판별식 뭐야", "A"), q("q4", "판별식이 왜?", null)]);
    expect(g.map((x) => x.topicName)).toEqual(["이차함수 꼭짓점", null]);
  });

  it("어느 규칙에도 안 맞는 질문은 묶지 않는다 (기타 묶음 없음)", () => {
    const g = mockThemeGroups([q("q1", "오늘 점심 뭐야"), q("q2", "이 공식은 언제 쓰면 안 되나?")]);
    expect(g).toEqual([]);
  });
});

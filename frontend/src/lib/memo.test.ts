import { describe, expect, it } from "vitest";
import { addMemo, loadMemos, MEMO_MAX, memoKey, removeMemo, saveMemos } from "./memo";

/** 테스트용 메모리 Storage */
function memStorage(init: Record<string, string> = {}): Storage {
  const m = new Map(Object.entries(init));
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

const memo = (id: string, text = `메모 ${id}`) => ({ id, text, createdAt: "2026-11-14T00:00:00.000Z" });

describe("loadMemos", () => {
  it("선생님별 키에서 메모를 읽는다", () => {
    const s = memStorage({ [memoKey("t1")]: JSON.stringify([memo("a")]), [memoKey("t2")]: JSON.stringify([memo("b")]) });
    expect(loadMemos(s, "t1")).toEqual([memo("a")]);
  });
});

describe("loadMemos 망가진 값", () => {
  it("저장소가 없거나, 읽다 에러가 나거나, JSON·모양이 깨졌으면 쓸 수 있는 것만 남긴다", () => {
    expect(loadMemos(null, "t1")).toEqual([]);
    const throwing = { ...memStorage(), getItem: () => { throw new Error("SecurityError"); } } as Storage;
    expect(loadMemos(throwing, "t1")).toEqual([]);
    expect(loadMemos(memStorage({ [memoKey("t1")]: "{not json" }), "t1")).toEqual([]);
    expect(loadMemos(memStorage({ [memoKey("t1")]: JSON.stringify({ a: 1 }) }), "t1")).toEqual([]);
    const mixed = [memo("a"), { id: 1, text: "x" }, null, memo("b", "가".repeat(300))];
    expect(loadMemos(memStorage({ [memoKey("t1")]: JSON.stringify(mixed) }), "t1")).toEqual([memo("a"), memo("b", "가".repeat(200))]);
  });
  it("20개를 넘게 저장돼 있으면 앞의 20개만 쓴다", () => {
    const many = Array.from({ length: 25 }, (_, i) => memo(String(i)));
    expect(loadMemos(memStorage({ [memoKey("t1")]: JSON.stringify(many) }), "t1")).toHaveLength(20);
  });
});

describe("saveMemos", () => {
  it("선생님별 키에 저장하고 다시 읽을 수 있다", () => {
    const s = memStorage();
    expect(saveMemos(s, "t1", [memo("a")])).toBe(true);
    expect(loadMemos(s, "t1")).toEqual([memo("a")]);
    expect(loadMemos(s, "t2")).toEqual([]);
  });
  it("저장소가 없거나 가득 차서 에러가 나면 false", () => {
    expect(saveMemos(null, "t1", [memo("a")])).toBe(false);
    const full = { ...memStorage(), setItem: () => { throw new Error("QuotaExceededError"); } } as Storage;
    expect(saveMemos(full, "t1", [memo("a")])).toBe(false);
  });
});

describe("addMemo", () => {
  const now = new Date("2026-11-14T01:02:03.000Z");
  it("앞뒤 공백을 지우고 200자로 잘라 맨 앞에 더한다", () => {
    expect(addMemo([memo("a")], "  수행평가 안내  ", "n1", now)).toEqual([
      { id: "n1", text: "수행평가 안내", createdAt: "2026-11-14T01:02:03.000Z" },
      memo("a"),
    ]);
    expect(addMemo([], "가".repeat(250), "n2", now)![0].text).toHaveLength(200);
  });
  it("빈 글이거나 이미 20개면 null", () => {
    expect(addMemo([], "   ", "n1", now)).toBeNull();
    const full = Array.from({ length: MEMO_MAX }, (_, i) => memo(String(i)));
    expect(addMemo(full, "하나 더", "n1", now)).toBeNull();
  });
});

describe("removeMemo", () => {
  it("그 id의 메모만 지운다", () => {
    expect(removeMemo([memo("a"), memo("b"), memo("c")], "b")).toEqual([memo("a"), memo("c")]);
  });
});

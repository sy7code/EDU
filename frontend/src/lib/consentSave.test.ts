import { describe, expect, it } from "vitest";
import { consentPayload, type ConsentValues } from "./consentSave";

const v = (o: Partial<ConsentValues>): ConsentValues => ({ FACEPASS: null, AI: null, LEARNING_RECORD: null, SUBJECT_SHARE: null, ...o });

describe("consentPayload", () => {
  it("학습 기록을 거절하면 교과 공개도 거절로 저장한다", () => {
    const out = consentPayload(["LEARNING_RECORD", "SUBJECT_SHARE"], v({ LEARNING_RECORD: false, SUBJECT_SHARE: true }), false);
    expect(out.find((o) => o.kind === "SUBJECT_SHARE")?.granted).toBe(false);
  });
  it("학습 기록에 동의하면 교과 공개는 고른 값 그대로", () => {
    const out = consentPayload(["LEARNING_RECORD", "SUBJECT_SHARE"], v({ LEARNING_RECORD: true, SUBJECT_SHARE: true }), false);
    expect(out.find((o) => o.kind === "SUBJECT_SHARE")?.granted).toBe(true);
  });
});

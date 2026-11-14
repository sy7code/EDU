import type { ConsentKind } from "../types/domain";

export type ConsentValues = Record<ConsentKind, boolean | null>;

/** 저장할 동의 목록. 학습 기록 공개가 동의가 아니면 교과 공개도 거절로 저장한다 */
export function consentPayload(kinds: ConsentKind[], values: ConsentValues, byGuardian: boolean): Array<{ kind: ConsentKind; granted: boolean; byGuardian: boolean }> {
  return kinds.map((kind) => ({ kind, granted: values[kind] === true && (kind !== "SUBJECT_SHARE" || values.LEARNING_RECORD === true), byGuardian }));
}

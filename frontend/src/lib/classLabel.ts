// 반 이름을 담은 곳이 mock 시드에 없어서 화면용 이름을 한 곳에 둔다 (실서비스에 반 정보가 생기면 여기만 바꾼다)
const NAMES: Record<string, string> = { c1: "2학년 3반", c2: "2학년 4반" };

/** 반 표시 이름. 모르는 반은 id를 그대로 붙인다 */
export function classLabel(classId: string): string {
  return NAMES[classId] ?? `${classId}반`;
}

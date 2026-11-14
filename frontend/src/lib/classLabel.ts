// mock 시드에는 반 이름이 없어서 화면용 이름을 둔다. 실제 모드는 서버 classes 이름을 rememberClassNames로 등록해 먼저 쓴다
const NAMES: Record<string, string> = { c1: "2학년 3반", c2: "2학년 4반" };
const serverNames = new Map<string, string>();

/** 서버에서 읽은 반 이름 등록 (실제 모드 배정 조회 때). 빈 이름은 무시 */
export function rememberClassNames(names: Record<string, string>): void {
  for (const [id, name] of Object.entries(names)) {
    if (name.trim()) serverNames.set(id, name.trim());
  }
}

/** 반 표시 이름: 서버 이름 → mock 이름 → id 그대로 */
export function classLabel(classId: string): string {
  return serverNames.get(classId) ?? NAMES[classId] ?? `${classId}반`;
}

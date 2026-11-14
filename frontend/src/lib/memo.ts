// 교사 메모: 이 브라우저(localStorage)에만 저장한다. 서버로 보내지 않는다.
export type Memo = { id: string; text: string; createdAt: string };

export const MEMO_MAX = 20;
export const MEMO_TEXT_MAX = 200;

export const memoKey = (teacherId: string) => `growth-pace-teacher-memo:${teacherId}`;

/** 저장된 메모를 읽는다. 저장소를 못 쓰거나 값이 깨졌으면 빈 목록 */
export function loadMemos(storage: Storage | null, teacherId: string): Memo[] {
  try {
    const raw = storage?.getItem(memoKey(teacherId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (m): m is Memo =>
          !!m && typeof m.id === "string" && typeof m.text === "string" && typeof m.createdAt === "string",
      )
      .map((m) => ({ id: m.id, text: m.text.slice(0, MEMO_TEXT_MAX), createdAt: m.createdAt }))
      .slice(0, MEMO_MAX);
  } catch {
    return []; // 사생활 보호 모드·저장소 차단·깨진 값
  }
}

/** 메모를 저장한다. 저장하지 못하면 false */
export function saveMemos(storage: Storage | null, teacherId: string, memos: Memo[]): boolean {
  if (!storage) return false;
  try {
    storage.setItem(memoKey(teacherId), JSON.stringify(memos));
    return true;
  } catch {
    return false;
  }
}

/** 새 메모를 맨 앞에 더한다. 빈 글이거나 이미 20개면 null */
export function addMemo(memos: Memo[], text: string, id: string, now: Date): Memo[] | null {
  const t = text.trim().slice(0, MEMO_TEXT_MAX);
  if (!t || memos.length >= MEMO_MAX) return null;
  return [{ id, text: t, createdAt: now.toISOString() }, ...memos];
}

/** 메모 하나를 지운다 */
export function removeMemo(memos: Memo[], id: string): Memo[] {
  return memos.filter((m) => m.id !== id);
}

/** 이 브라우저의 localStorage (막혀 있으면 null) */
export function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

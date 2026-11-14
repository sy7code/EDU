export type Skin = "default" | "pink";

/** 이 탭에서 주소로 고른 테마를 기억하는 키 (sessionStorage, 탭을 닫으면 사라짐) */
export const SKIN_KEY = "growth-pace-skin";

const isSkin = (v: string | null | undefined): v is Skin => v === "default" || v === "pink";

/** 화면 테마: 주소 ?skin= → 이 탭에서 전에 고른 값 → 빌드 값(VITE_THEME) → 기본. 모르는 값은 건너뛴다 */
export function resolveSkin(buildValue: string | undefined, search: string, stored?: string | null): Skin {
  const fromUrl = new URLSearchParams(search).get("skin");
  if (isSkin(fromUrl)) return fromUrl;
  if (isSkin(stored)) return stored;
  return isSkin(buildValue) ? buildValue : "default";
}

/** 앱 시작 때 한 번: <html data-skin="pink"> 로 테마 CSS를 켠다 */
export function applySkin(skin: Skin): void {
  if (skin === "default") delete document.documentElement.dataset.skin;
  else document.documentElement.dataset.skin = skin;
}

/** 주소로 고른 값만 이 탭에 기억 (빌드 값은 저장하지 않음). 저장소가 막혀 있으면 조용히 넘어감 */
export function readStoredSkin(): string | null {
  try {
    return sessionStorage.getItem(SKIN_KEY);
  } catch {
    return null;
  }
}
export function rememberSkinFromUrl(search: string): void {
  const v = new URLSearchParams(search).get("skin");
  if (!isSkin(v)) return;
  try {
    sessionStorage.setItem(SKIN_KEY, v);
  } catch {
    /* noop */
  }
}

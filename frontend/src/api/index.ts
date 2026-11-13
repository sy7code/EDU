import { createMockApi, SESSION_USER_KEY, STORAGE_KEY } from "./mockApi";
import { createSeed } from "./mockData";
import { createSupabaseApi } from "./supabaseApi";
import { ApiError, type Api } from "./types";

export const USE_MOCK = import.meta.env.VITE_USE_MOCK !== "false";

/** 실제 백엔드에 아직 없는 기능은 화면에서 숨긴다 (mock 데모에서는 모두 보임) */
export const FEATURES = {
  consent: USE_MOCK, // 동의 설정 화면
  codeAuth: USE_MOCK, // QR·학생증 바코드, 키오스크
  manualAuth: USE_MOCK, // 선생님이 확인
  assessment: USE_MOCK, // AI·교사 교차채점
  quiz: USE_MOCK, // 단원 테스트·문제 관리·종합 보드
} as const;

function createRealApi(): Api {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    // 설정 누락: 화면에 일반 오류만 보이게
    return new Proxy({} as Api, {
      get: () => async () => {
        throw new ApiError("UNKNOWN", "missing supabase env");
      },
    });
  }
  return createSupabaseApi(url, key);
}

export const api: Api = USE_MOCK ? createMockApi({ seed: createSeed(new Date()) }) : createRealApi();

/** 데모 데이터 초기화 (mock 전용) */
export function resetMockData() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(SESSION_USER_KEY);
  } catch {
    /* noop */
  }
  location.reload();
}

export { ApiError, errorMessage } from "./types";

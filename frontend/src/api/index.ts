import { createMockApi, SESSION_USER_KEY, STORAGE_KEY } from "./mockApi";
import { createSeed } from "./mockData";
import { ApiError, type Api } from "./types";

export const USE_MOCK = import.meta.env.VITE_USE_MOCK !== "false";

function createNotReadyApi(): Api {
  // 백엔드(Supabase) 연결 전 자리. 함수 단위로 supabaseApi.ts 에서 교체한다.
  return new Proxy({} as Api, {
    get: () => async () => {
      throw new ApiError("UNKNOWN", "supabase api not implemented yet");
    },
  });
}

export const api: Api = USE_MOCK ? createMockApi({ seed: createSeed(new Date()) }) : createNotReadyApi();

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

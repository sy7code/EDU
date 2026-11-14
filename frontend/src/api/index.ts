import { createMockApi, SESSION_USER_KEY, STORAGE_KEY } from "./mockApi";
import { createSeed } from "./mockData";
import { createSupabaseApi } from "./supabaseApi";
import { ApiError, type Api } from "./types";

// 명시적으로 "true"일 때만 mock. 환경변수 없이 빌드하면 누구나 로그인되는 mock이 배포되는 일을 막는다
export const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";

/** 실제 백엔드에 아직 없는 기능은 화면에서 숨긴다 (mock 데모에서는 모두 보임) */
export const FEATURES = {
  consent: true, // 동의 설정 화면 (백엔드 consents 반영됨, 2026-11-14)
  codeAuth: USE_MOCK, // QR 인증·키오스크 (백엔드 QR 미반영 — 실제 모드는 개발용 건너뛰기만)
  assessment: USE_MOCK, // AI·교사 교차채점
  quiz: true, // 주제별 성장·확인 테스트·신고 (백엔드 v0.5 반영됨, 2026-11-14)
  dashboardQuizRate: true, // 대시보드 '최근 테스트' 열 (백엔드 v0.5.1 lastQuizRate 반영됨, 2026-11-14)
  audit: true, // 교사 열람 기록 (백엔드 log_student_view·v_audit_logs 반영됨, 2026-11-14)
  mileageDemo: USE_MOCK, // 성장 마일리지 예시 화면 (로직 없는 보여 주기 화면, 실제 모드에서 숨김)
  subjectTeacher: true, // 교과 교사 배정·과목 집계 (백엔드 v0.9 반영됨, 2026-11-14)
  questionThemes: USE_MOCK, // 과목 질문 핵심 요약 (백엔드 미반영 — 실제 모드에서 숨김)
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

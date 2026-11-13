import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, Outlet, useLocation } from "react-router";
import { api } from "../api";
import type { Role } from "../types/domain";
import { Spinner } from "../components/ui";

export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: () => api.me() });
}

export function useConsents(enabled = true) {
  return useQuery({ queryKey: ["consents"], queryFn: () => api.getConsents(), enabled });
}

export function useHasConsent(kind: "FACEPASS" | "AI" | "LEARNING_RECORD") {
  const { data } = useConsents();
  return !!data?.some((c) => c.kind === kind && c.granted);
}

export function useLogout() {
  const qc = useQueryClient();
  return async () => {
    await api.logout();
    qc.clear(); // 로그아웃 시 캐시된 학생 데이터 제거
  };
}

/** 역할 확인. 화면 보호는 UX일 뿐이고 실제 권한은 서버(RLS)가 막는다. */
export function RequireRole({ role }: { role: Role }) {
  const me = useMe();
  const consents = useConsents(me.data?.role === "student");
  const loc = useLocation();
  if (me.isLoading) return <Spinner />;
  if (!me.data) return <Navigate to="/" replace />;
  if (me.data.role !== role) return <Navigate to={me.data.role === "teacher" ? "/teacher" : "/student"} replace />;
  if (role === "student") {
    if (consents.isLoading) return <Spinner />;
    const decided = (consents.data ?? []).length > 0;
    if (!decided && loc.pathname !== "/student/consent") return <Navigate to="/student/consent" replace />;
  }
  return <Outlet />;
}

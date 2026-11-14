import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { useMe } from "../../auth/session";
import { Spinner } from "../../components/ui";
import { ClassDashboard } from "./ClassDashboard";

/** /teacher 첫 화면: 담임이면 반 대시보드, 교과만 맡은 교사(classId "")는 내 과목으로 */
export function TeacherHome() {
  const me = useMe();
  if (!me.data) return <Spinner />;
  if (me.data.classId === "") return <Navigate to="/teacher/subjects" replace />;
  return <ClassDashboard />;
}

/** 반 단위 화면(담임 전용). 교과만 맡은 교사가 주소를 직접 입력해 들어오면 내 과목으로 돌려보낸다 */
export function HomeroomOnly({ children }: { children: ReactNode }) {
  const me = useMe();
  if (!me.data) return <Spinner />;
  if (me.data.classId === "") return <Navigate to="/teacher/subjects" replace />;
  return <>{children}</>;
}

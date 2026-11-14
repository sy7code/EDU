import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { useMe } from "../../auth/session";
import { Spinner } from "../../components/ui";
import { ClassDashboard } from "./ClassDashboard";
import { SubjectCards } from "./SubjectCards";

/** /teacher 첫 화면: 담임이면 반 대시보드, 교과만 맡은 교사(classId "")는 내 과목만 있는 대시보드 */
export function TeacherHome() {
  const me = useMe();
  if (!me.data) return <Spinner />;
  if (me.data.classId === "")
    return (
      <div className="teacher-page">
        <div className="page-heading">
          <div>
            <p className="eyebrow">교과 선생님</p>
            <h1>{me.data.name} 선생님, 안녕하세요</h1>
            <p>맡은 반·과목의 이번 주 학습을 모아 보여요.</p>
          </div>
        </div>
        <SubjectCards />
      </div>
    );
  return <ClassDashboard />;
}

/** 반 단위 화면(담임 전용). 교과만 맡은 교사가 주소를 직접 입력해 들어오면 대시보드로 돌려보낸다 */
export function HomeroomOnly({ children }: { children: ReactNode }) {
  const me = useMe();
  if (!me.data) return <Spinner />;
  if (me.data.classId === "") return <Navigate to="/teacher" replace />;
  return <>{children}</>;
}

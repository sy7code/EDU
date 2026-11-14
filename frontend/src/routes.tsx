import { AnalyticsPage } from "./features/teacher/AnalyticsPage";
import { createBrowserRouter } from "react-router";
import { AppLayout } from "./components/Layout";
import { RequireRole } from "./auth/session";
import { LoginPage } from "./features/login/LoginPage";
import { KioskPage } from "./features/kiosk/KioskPage";
import { ConsentPage } from "./features/consent/ConsentPage";
import { StudentHome } from "./features/student/StudentHome";
import { StartPage } from "./features/session/StartPage";
import { SessionPage } from "./features/session/SessionPage";
import { EndPage } from "./features/session/EndPage";
import { MyRecordsPage } from "./features/records/MyRecordsPage";
import { HomeroomOnly, TeacherHome } from "./features/teacher/TeacherHome";
import { SubjectsPage } from "./features/teacher/SubjectsPage";
import { SubjectClassPage } from "./features/teacher/SubjectClassPage";
import { SubjectStudentPage } from "./features/teacher/SubjectStudentPage";
import { StudentDetailPage } from "./features/teacher/StudentDetailPage";
import { ReportsPage } from "./features/teacher/ReportsPage";
import { HelpPage } from "./features/help/HelpPage";

export const router = createBrowserRouter([
  { path: "/kiosk", element: <KioskPage /> },
  {
    element: <AppLayout />,
    children: [
      { path: "/", element: <LoginPage /> },
      // 사용 방법 (선생님·학생 공용, 로그인 확인은 화면 안에서)
      { path: "/help", element: <HelpPage /> },
      {
        path: "/student",
        element: <RequireRole role="student" />,
        children: [
          { index: true, element: <StudentHome /> },
          { path: "consent", element: <ConsentPage /> },
          { path: "start", element: <StartPage /> },
          { path: "session/:id", element: <SessionPage /> },
          { path: "session/:id/end", element: <EndPage /> },
          { path: "records", element: <MyRecordsPage /> },
        ],
      },
      {
        path: "/teacher",
        element: <RequireRole role="teacher" />,
        children: [
          { index: true, element: <TeacherHome /> },
          { path: "students/:studentId", element: <HomeroomOnly><StudentDetailPage /></HomeroomOnly> },
          { path: "reports", element: <HomeroomOnly><ReportsPage /></HomeroomOnly> },
          { path: "analytics", element: <HomeroomOnly><AnalyticsPage /></HomeroomOnly> },
          { path: "subjects", element: <SubjectsPage /> },
          { path: "subjects/:classId/:subject", element: <SubjectClassPage /> },
          { path: "subjects/:classId/:subject/students/:studentId", element: <SubjectStudentPage /> },
        ],
      },
    ],
  },
]);

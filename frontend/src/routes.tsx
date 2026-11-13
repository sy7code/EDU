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
import { ClassDashboard } from "./features/teacher/ClassDashboard";
import { StudentDetailPage } from "./features/teacher/StudentDetailPage";
import { ReportsPage } from "./features/teacher/ReportsPage";

export const router = createBrowserRouter([
  { path: "/kiosk", element: <KioskPage /> },
  {
    element: <AppLayout />,
    children: [
      { path: "/", element: <LoginPage /> },
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
          { index: true, element: <ClassDashboard /> },
          { path: "students/:studentId", element: <StudentDetailPage /> },
          { path: "reports", element: <ReportsPage /> },
          { path: "analytics", element: <AnalyticsPage /> },
        ],
      },
    ],
  },
]);

import { Link, NavLink, Outlet, useNavigate } from "react-router";
import { useLogout, useMe } from "../auth/session";
import { FEATURES, resetMockData, USE_MOCK } from "../api";
import { Icon } from "./Icon";

export function AppLayout() {
  const { data: me } = useMe();
  const logout = useLogout();
  const nav = useNavigate();

  // [경로, 아이콘, 이름] — 디자인은 프로토타입의 상단 바 + 왼쪽 사이드바(모바일은 아래 탭바)
  const links: Array<[string, string, string]> =
    me?.role === "teacher"
      ? [
          ["/teacher", "users", "반 대시보드"],
          ["/teacher/analytics", "chart", "반 분석"],
          ...(FEATURES.quiz ? ([["/teacher/reports", "alert", "신고된 문제"]] as Array<[string, string, string]>) : []),
        ]
      : me?.role === "student"
        ? [
            ["/student", "home", "홈"],
            ["/student/records", "book", "내 기록"],
            ...(FEATURES.consent ? ([["/student/consent", "settings", "동의 설정"]] as Array<[string, string, string]>) : []),
          ]
        : [];
  const signedIn = !!me;

  return (
    <div className={`app-shell ${signedIn ? "" : "is-login"}`}>
      {signedIn && (
        <>
          <header className="topbar">
            <Link to="/" className="brand">
              <span className="brandmark">
                <Icon name="leaf" size={21} />
              </span>
              <span>성장 페이스</span>
            </Link>
            <div className="top-actions">
              <span className="user-name">
                {me.name} {me.role === "teacher" ? "선생님" : "학생"}
              </span>
              <button
                className="icon-button"
                aria-label="로그아웃"
                title="로그아웃"
                onClick={async () => {
                  await logout();
                  nav("/");
                }}
              >
                <Icon name="logout" />
              </button>
            </div>
          </header>
          <aside className="sidebar">
            <nav aria-label="주요 메뉴">
              {links.map(([to, icon, label]) => (
                <NavLink key={to} to={to} end className={({ isActive }) => (isActive ? "active" : "")}>
                  <Icon name={icon} />
                  <span>{label}</span>
                </NavLink>
              ))}
            </nav>
          </aside>
        </>
      )}
      <main>
        <div className={signedIn ? `page ${me.role === "teacher" ? "teacher-page" : "student-page"}` : ""}>
          <Outlet />
        </div>
        {USE_MOCK && (
          <footer className="demo-footer">
            데모 모드 · 모든 데이터는 가짜입니다 ·{" "}
            <button className="underline" onClick={resetMockData}>
              데모 데이터 초기화
            </button>
          </footer>
        )}
      </main>
    </div>
  );
}

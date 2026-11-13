import { Link, NavLink, Outlet, useNavigate } from "react-router";
import { useLogout, useMe } from "../auth/session";
import { FEATURES, resetMockData, USE_MOCK } from "../api";

export function AppLayout() {
  const { data: me } = useMe();
  const logout = useLogout();
  const nav = useNavigate();

  const links =
    me?.role === "teacher"
      ? [
          { to: "/teacher", label: "반 대시보드" },
          ...(FEATURES.quiz ? [{ to: "/teacher/reports", label: "신고된 문제" }] : []),
        ]
      : me?.role === "student"
        ? [
            { to: "/student", label: "홈" },
            { to: "/student/records", label: "내 기록" },
            ...(FEATURES.consent ? [{ to: "/student/consent", label: "동의 설정" }] : []),
          ]
        : [];

  return (
    <div className="min-h-full">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link to="/" className="text-lg font-bold text-brand-700">
            성장 페이스
          </Link>
          <nav className="flex gap-1 text-sm">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 ${isActive ? "bg-brand-50 font-semibold text-brand-700" : "text-stone-600 hover:bg-stone-100"}`
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            {me && (
              <>
                <span className="text-stone-600">
                  {me.name} {me.role === "teacher" ? "선생님" : ""}
                </span>
                <button
                  className="text-stone-500 underline-offset-2 hover:underline"
                  onClick={async () => {
                    await logout();
                    nav("/");
                  }}
                >
                  로그아웃
                </button>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
      {USE_MOCK && (
        <footer className="mx-auto max-w-5xl px-4 pb-6 text-xs text-stone-400">
          데모 모드 · 모든 데이터는 가짜입니다 ·{" "}
          <button className="underline" onClick={resetMockData}>
            데모 데이터 초기화
          </button>
        </footer>
      )}
    </div>
  );
}

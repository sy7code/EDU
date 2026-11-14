import { Link, Outlet, useLocation, useNavigate } from "react-router";
import { useLogout, useMe } from "../auth/session";
import { FEATURES, resetMockData, USE_MOCK } from "../api";
import { navItemActive, teacherNavLinks } from "../lib/teacherNav";
import { Icon } from "./Icon";

/**
 * 디자인: Figma 프로토타입 v2 — 데스크톱은 왼쪽 사이드바(로고·프로필·바로가기·메뉴 묶음), 상단 바는 숨김.
 * 모바일은 상단 바 + 아래 탭바. 프로토타입에만 있고 기능이 없는 것(반 바꾸기, 전체 메뉴 탭, 역할 미리보기)은 넣지 않는다.
 * 도움말: 데스크톱은 사이드바 아래 카드, 모바일은 상단 바 아이콘 → /help
 */
export function AppLayout() {
  const { data: me } = useMe();
  const logout = useLogout();
  const nav = useNavigate();
  const { pathname } = useLocation();

  const isTeacher = me?.role === "teacher";
  const homeroom = isTeacher && me.classId !== "";
  // [경로, 아이콘, 이름]
  const links: Array<[string, string, string]> = isTeacher
    ? teacherNavLinks({
        homeroom,
        quizFeature: FEATURES.quiz,
        subjectFeature: FEATURES.subjectTeacher,
      })
    : me?.role === "student"
      ? [
          ["/student", "home", "홈"],
          ["/student/start", "pen", "학습하기"],
          ["/student/records", "book", "내 기록"],
          ...(FEATURES.mileageDemo ? ([["/student/mileage", "spark", "성장 마일리지"]] as Array<[string, string, string]>) : []),
          ...(FEATURES.consent ? ([["/student/consent", "settings", "동의 설정"]] as Array<[string, string, string]>) : []),
        ]
      : [];
  const signedIn = !!me;
  const doLogout = async () => {
    await logout();
    nav("/");
  };

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
              <Link to="/help" className="icon-button" aria-label="사용 방법" title="사용 방법">
                <Icon name="message" />
              </Link>
              <span className="user-name">
                {me.name} {me.role === "teacher" ? "선생님" : "학생"}
              </span>
              <button className="icon-button" aria-label="로그아웃" title="로그아웃" onClick={doLogout}>
                <Icon name="logout" />
              </button>
            </div>
          </header>
          <aside className="sidebar">
            <div className="sidebar-content">
              <div className="sidebar-logo">
                <Link to="/" className="brand">
                  <span className="brandmark">
                    <Icon name="leaf" size={21} />
                  </span>
                  <span>성장 페이스</span>
                </Link>
              </div>
              <div className="sidebar-profile">
                <span className="profile-avatar" aria-hidden>
                  {me.role === "student" && me.number ? String(me.number).padStart(2, "0") : me.name.slice(0, 1)}
                </span>
                <div>
                  <strong>
                    {me.name} {me.role === "teacher" ? "선생님" : "학생"}
                  </strong>
                  {me.role === "student" ? (
                    <small>{`2학년 3반${me.number ? ` · ${me.number}번` : ""}`}</small>
                  ) : homeroom ? (
                    <small>2학년 3반 담임</small>
                  ) : (
                    <small>교과 선생님</small>
                  )}
                </div>
                <button aria-label="로그아웃" title="로그아웃" onClick={doLogout}>
                  <Icon name="logout" />
                </button>
              </div>
              {me.role === "student" && (
                <Link to="/student/start" className="sidebar-outline-action">
                  새 학습 시작하기
                  <Icon name="chevron" size={16} />
                </Link>
              )}
              {homeroom && (
                <Link to="/teacher/analytics" className="sidebar-highlight-action">
                  <Icon name="chart" size={17} /> 반 분석 살펴보기
                </Link>
              )}
              <p className="nav-label">{me.role === "student" ? "학습" : homeroom ? "학급 관리" : "교과 관리"}</p>
              <nav aria-label="주요 메뉴">
                {/* 활성 판정은 navItemActive 하나로: NavLink는 /teacher 접두 일치로 aria-current를 덧붙여 Link를 쓴다 */}
                {links.map(([to, icon, label]) => (
                  <Link key={to} to={to} className={navItemActive(to, pathname) ? "active" : ""} aria-current={navItemActive(to, pathname) ? "page" : undefined}>
                    <Icon name={icon} />
                    <span>{label}</span>
                    <Icon name="chevron" size={15} />
                  </Link>
                ))}
              </nav>
            </div>
            <Link to="/help" className="sidebar-note help-sidebar-link">
              <Icon name="message" />
              <div>
                <strong>도움이 필요하신가요?</strong>
                <p>사용 방법을 살펴보세요</p>
              </div>
            </Link>
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

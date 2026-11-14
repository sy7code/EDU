export type NavLinkItem = [string, string, string];

type Assignment = { classId: string; subject: string };

const SUBJECT_HOME = "/teacher/subject";
const SUBJECT_STUDENT_PREFIX = "/teacher/subjects/";

/** 교사 사이드바 메뉴 [경로, 아이콘, 이름]. 담임이 아니면(classId "") 반 단위 메뉴를 숨기고 대시보드만 둔다. 맡은 과목이 있으면 '맡은 과목' 하나(과목·반은 그 화면 안 탭) */
export function teacherNavLinks(i: { homeroom: boolean; quizFeature: boolean; assignments?: Assignment[] }): NavLinkItem[] {
  const links: NavLinkItem[] = [];
  if (i.homeroom) {
    links.push(["/teacher", "users", "반 대시보드"], ["/teacher/analytics", "chart", "반 분석"]);
    if (i.quizFeature) links.push(["/teacher/reports", "alert", "신고된 문제"]);
  }
  else links.push(["/teacher", "home", "대시보드"]);
  if (i.assignments?.length) links.push([SUBJECT_HOME, "book", "맡은 과목"]);
  return links;
}

/** 사이드바 항목이 켜지는 조건. '맡은 과목'은 /teacher/subject(쿼리 제외)와 학생 기록 화면(/teacher/subjects/...)에서 켠다 */
export function navItemActive(to: string, pathname: string): boolean {
  if (to !== SUBJECT_HOME) return pathname === to;
  return pathname === to || pathname.startsWith(SUBJECT_STUDENT_PREFIX);
}

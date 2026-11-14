export type NavLinkItem = [string, string, string];

/** 교사 사이드바 메뉴 [경로, 아이콘, 이름]. 담임이 아니면(classId "") 반 단위 메뉴를 숨기고 대시보드만 둔다. 내 과목은 대시보드 안 섹션이다 */
export function teacherNavLinks(i: { homeroom: boolean; quizFeature: boolean }): NavLinkItem[] {
  const links: NavLinkItem[] = [];
  if (i.homeroom) {
    links.push(["/teacher", "users", "반 대시보드"], ["/teacher/analytics", "chart", "반 분석"]);
    if (i.quizFeature) links.push(["/teacher/reports", "alert", "신고된 문제"]);
  }
  else links.push(["/teacher", "home", "대시보드"]);
  return links;
}

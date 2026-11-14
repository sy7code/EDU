import { classLabel } from "./classLabel";

export type NavLinkItem = [string, string, string];

type Assignment = { classId: string; subject: string };

/** 교사 사이드바 메뉴 [경로, 아이콘, 이름]. 담임이 아니면(classId "") 반 단위 메뉴를 숨기고 대시보드만 둔다. 맡은 반·과목은 메뉴 항목으로 바로 붙는다 */
export function teacherNavLinks(i: { homeroom: boolean; quizFeature: boolean; assignments?: Assignment[] }): NavLinkItem[] {
  const links: NavLinkItem[] = [];
  if (i.homeroom) {
    links.push(["/teacher", "users", "반 대시보드"], ["/teacher/analytics", "chart", "반 분석"]);
    if (i.quizFeature) links.push(["/teacher/reports", "alert", "신고된 문제"]);
  }
  else links.push(["/teacher", "home", "대시보드"]);
  for (const a of i.assignments ?? [])
    links.push([`/teacher/subjects/${a.classId}/${encodeURIComponent(a.subject)}`, "book", `${classLabel(a.classId)} ${a.subject}`]);
  return links;
}

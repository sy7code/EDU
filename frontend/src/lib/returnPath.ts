import type { Role } from "../types/domain";

/**
 * 로그인 뒤 돌아갈 주소 (휴대폰으로 QR을 찍고 로그인한 뒤 그 학습 화면으로).
 * 우리 앱 안의 그 역할 화면만 허용한다. 바깥 주소(//, 스킴, 역슬래시)·상위 경로(..)·다른 역할 화면은 역할의 첫 화면으로.
 */
export function returnPath(from: unknown, role: Role): string {
  const home = role === "teacher" ? "/teacher" : "/student";
  if (typeof from !== "string") return home;
  if (!from.startsWith("/") || from.startsWith("//") || from.includes("\\") || from.includes("..")) return home;
  if (from !== home && !from.startsWith(`${home}/`) && !from.startsWith(`${home}?`)) return home;
  return from;
}

/** 동의 화면 저장 뒤 갈 곳. 처음 저장이면 동의 전에 가려던 학생 화면으로(동의 화면 자신은 제외), 아니면 학생 첫 화면 */
export function afterConsentPath(from: unknown, firstSave: boolean): string {
  if (!firstSave) return "/student";
  const to = returnPath(from, "student");
  const consent = "/student/consent";
  return to === consent || to.startsWith(`${consent}?`) || to.startsWith(`${consent}/`) ? "/student" : to;
}

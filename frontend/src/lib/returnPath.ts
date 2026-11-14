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

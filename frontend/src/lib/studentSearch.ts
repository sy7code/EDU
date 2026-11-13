/** 교사 학생 목록 검색: 숫자만 넣으면 번호, 아니면 이름 일부. 빈 검색은 모두 */
export function matchStudent(s: { name: string; number: number }, q: string): boolean {
  const query = q.replace(/\s+/g, "").toLowerCase();
  if (!query) return true;
  if (/^\d+$/.test(query)) return s.number === Number(query);
  return s.name.replace(/\s+/g, "").toLowerCase().includes(query);
}

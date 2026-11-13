// 목록을 고정 크기 페이지로 나눈다. 범위를 벗어난 페이지 번호는 가장 가까운 페이지로 맞춘다
export function paginate<T>(xs: T[], page: number, size = 10): { items: T[]; page: number; pageCount: number } {
  const pageCount = Math.max(1, Math.ceil(xs.length / size));
  const p = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
  return { items: xs.slice((p - 1) * size, p * size), page: p, pageCount };
}

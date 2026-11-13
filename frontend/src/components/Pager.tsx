/** 목록 아래 쪽 번호. 한 쪽뿐이면 그리지 않는다 */
export function Pager({ page, pageCount, onChange, label = "학생 목록" }: { page: number; pageCount: number; onChange: (p: number) => void; label?: string }) {
  if (pageCount <= 1) return null;
  return (
    <nav className="pagination" aria-label={`${label} 쪽 이동`}>
      <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        이전
      </button>
      {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
        <button key={p} type="button" aria-current={p === page ? "page" : undefined} className={p === page ? "active" : ""} onClick={() => onChange(p)}>
          {p}
        </button>
      ))}
      <button type="button" disabled={page >= pageCount} onClick={() => onChange(page + 1)}>
        다음
      </button>
    </nav>
  );
}

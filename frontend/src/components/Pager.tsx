/** 목록 아래 쪽 번호. 한 쪽뿐이면 그리지 않는다 */
export function Pager({ page, pageCount, onChange, label = "학생 목록" }: { page: number; pageCount: number; onChange: (p: number) => void; label?: string }) {
  if (pageCount <= 1) return null;
  return (
    <nav className="mt-3 flex items-center justify-center gap-1 text-sm" aria-label={`${label} 쪽 이동`}>
      <button className="rounded-md px-2 py-1 text-stone-600 hover:bg-stone-100 disabled:opacity-40" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        이전
      </button>
      {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
        <button
          key={p}
          aria-current={p === page ? "page" : undefined}
          onClick={() => onChange(p)}
          className={`min-w-8 rounded-md px-2 py-1 tabular-nums ${p === page ? "bg-brand-50 font-semibold text-brand-700" : "text-stone-600 hover:bg-stone-100"}`}
        >
          {p}
        </button>
      ))}
      <button className="rounded-md px-2 py-1 text-stone-600 hover:bg-stone-100 disabled:opacity-40" disabled={page >= pageCount} onClick={() => onChange(page + 1)}>
        다음
      </button>
    </nav>
  );
}

/** 학생 목록 위 이름·번호 검색 */
export function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="mb-2 flex justify-end">
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="이름 또는 번호로 찾기"
        aria-label="학생 이름 또는 번호로 찾기"
        className="w-full rounded-lg border border-stone-300 px-3 py-1.5 text-sm sm:w-56"
      />
    </div>
  );
}

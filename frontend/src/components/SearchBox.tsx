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

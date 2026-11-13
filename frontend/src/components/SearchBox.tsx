import { Icon } from "./Icon";

/** 학생 목록 위 이름·번호 검색 */
export function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="filter-row">
      <div className="search">
        <Icon name="search" size={18} />
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="이름 또는 번호로 찾기"
          aria-label="학생 이름 또는 번호로 찾기"
        />
      </div>
    </div>
  );
}

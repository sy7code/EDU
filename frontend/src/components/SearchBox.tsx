import { Icon } from "./Icon";

/** 목록 위 검색칸. 기본 문구는 학생 이름·번호 검색 */
export function SearchBox({
  value,
  onChange,
  placeholder = "이름 또는 번호로 찾기",
  label = "학생 이름 또는 번호로 찾기",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label?: string;
}) {
  return (
    <div className="filter-row">
      <div className="search">
        <Icon name="search" size={18} />
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={label}
        />
      </div>
    </div>
  );
}

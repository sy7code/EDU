import { useEffect, useRef } from "react";
import { Link } from "react-router";
import { Button } from "../../components/ui";

/** 데모 전용: 돌아보기 저장 뒤 보여 주는 적립 안내(예시). 실제 적립은 하지 않는다 */
export function MileageEarnDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => prev?.focus?.();
  }, []);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const items = ref.current?.querySelectorAll<HTMLElement>("a[href],button");
    if (!items?.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  return (
    <div className="mile-overlay">
      <div
        ref={ref}
        className="mile-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mile-dlg-title"
        aria-describedby="mile-dlg-desc"
        tabIndex={-1}
        onKeyDown={onKey}
      >
        <h2 id="mile-dlg-title">성장 마일리지 +15 적립(예시)</h2>
        <ul className="mile-list" id="mile-dlg-desc">
          <li>
            <span>
              <strong>학습 마치기</strong>
            </span>
            <em>+10</em>
          </li>
          <li>
            <span>
              <strong>돌아보기</strong>
            </span>
            <em>+5</em>
          </li>
        </ul>
        <p className="mile-sub">예시 화면이에요. 실제로 적립되지 않아요.</p>
        <div className="mile-actions">
          <Link to="/student/mileage" className="button primary">
            마일리지 보러 가기
          </Link>
          <Button variant="secondary" onClick={onClose}>
            닫기
          </Button>
        </div>
      </div>
    </div>
  );
}

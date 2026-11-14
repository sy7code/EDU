import { useRef } from "react";
import type { KeyboardEvent } from "react";
import { Navigate, useParams, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api";
import { isRetryable } from "../../lib/retryable";
import { classLabel } from "../../lib/classLabel";
import { SUBJECTS } from "../../lib/checklists";
import { EmptyState, ErrorState, Spinner } from "../../components/ui";
import { SubjectClassView } from "./SubjectClassView";

/** 맡은 과목 화면의 주소: 선택은 쿼리(?subject=&class=)로 둔다 */
export function subjectPath(subject: string, classId?: string): string {
  const q = new URLSearchParams({ subject });
  if (classId) q.set("class", classId);
  return `/teacher/subject?${q.toString()}`;
}

const subjectRank = (s: string) => {
  const i = (SUBJECTS as readonly string[]).indexOf(s);
  return i < 0 ? SUBJECTS.length : i;
};

/** 옛 주소 /teacher/subjects/:classId/:subject → 새 화면 */
export function LegacySubjectClassRedirect() {
  const { classId = "", subject = "" } = useParams();
  return <Navigate to={subjectPath(subject, classId)} replace />;
}

/** 탭 목록: role=tablist, 화살표·Home·End로 옮기고 포커스된 탭을 고른다 */
function Tabs({ label, items, value, onSelect }: { label: string; items: Array<{ id: string; label: string }>; value: string; onSelect: (id: string) => void }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const onArrow = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const n = items.length;
    const k = e.key;
    const next = k === "ArrowRight" || k === "ArrowDown" ? (i + 1) % n : k === "ArrowLeft" || k === "ArrowUp" ? (i - 1 + n) % n : k === "Home" ? 0 : k === "End" ? n - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    onSelect(items[next].id);
    refs.current[next]?.focus();
  };
  return (
    <div className="tabs wide" role="tablist" aria-label={label}>
      {items.map((it, i) => (
        <button
          key={it.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="tab"
          id={`tab-${label}-${it.id}`}
          aria-selected={it.id === value}
          aria-controls={label === "반" ? "panel-class" : undefined}
          tabIndex={it.id === value ? 0 : -1}
          className={it.id === value ? "active" : ""}
          onClick={() => onSelect(it.id)}
          onKeyDown={(e) => onArrow(e, i)}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

/** /teacher/subject: (과목이 둘 이상이면 과목 탭) → 반 탭 → 그 반·과목 내용 */
export function SubjectPage() {
  const [params, setParams] = useSearchParams();
  const asg = useQuery({ queryKey: ["my-assignments"], queryFn: () => api.listMyAssignments() });
  if (asg.isLoading) return <Spinner />;
  if (asg.error) return <ErrorState error={asg.error} onRetry={isRetryable(asg.error) ? () => asg.refetch() : undefined} />;
  const all = asg.data ?? [];
  const subjects = [...new Set(all.map((a) => a.subject))].sort((a, b) => subjectRank(a) - subjectRank(b));
  if (subjects.length === 0) return <EmptyState title="맡은 과목이 없어요">배정되면 여기에 나타나요.</EmptyState>;

  const wantedSubject = params.get("subject");
  if (wantedSubject && !subjects.includes(wantedSubject)) return <EmptyState title="맡은 과목이 아니에요">왼쪽 메뉴의 '맡은 과목'에서 다시 골라 주세요.</EmptyState>;
  const subject = wantedSubject ?? subjects[0];
  const classes = all.filter((a) => a.subject === subject).map((a) => a.classId);
  const wantedClass = params.get("class");
  const classId = wantedClass && classes.includes(wantedClass) ? wantedClass : classes[0];
  const select = (s: string, c: string) => setParams({ subject: s, class: c }, { replace: true });

  return (
    <div className="subj-page">
      <h1>{subjects.length > 1 ? "맡은 과목" : subject}</h1>
      <p className="subj-lead">내가 맡은 반</p>
      {subjects.length > 1 && (
        <Tabs label="과목" items={subjects.map((s) => ({ id: s, label: s }))} value={subject} onSelect={(s) => select(s, all.find((a) => a.subject === s)!.classId)} />
      )}
      <Tabs label="반" items={classes.map((c) => ({ id: c, label: classLabel(c) }))} value={classId} onSelect={(c) => select(subject, c)} />
      <div role="tabpanel" id="panel-class" aria-labelledby={`tab-반-${classId}`}>
        <SubjectClassView classId={classId} subject={subject} />
      </div>
    </div>
  );
}

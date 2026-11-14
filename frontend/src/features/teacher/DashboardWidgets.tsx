import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { FEATURES } from "../../api";
import { Icon } from "../../components/Icon";
import { addMemo, browserStorage, loadMemos, MEMO_MAX, MEMO_TEXT_MAX, removeMemo, saveMemos, type Memo } from "../../lib/memo";

/** 반 대시보드 아래 작은 칸: 바로가기 (앱 안 고정 링크, 편집 없음) */
export function ShortcutWidget({ feedbackCount, onFeedback }: { feedbackCount: number; onFeedback: () => void }) {
  return (
    <section className="card compact-widget dash-shortcuts" aria-labelledby="dash-shortcuts-title">
      <div className="card-heading">
        <h2 id="dash-shortcuts-title">바로가기</h2>
      </div>
      <ul className="dash-shortcut-list">
        <li>
          <Link to="/teacher/analytics">
            <Icon name="chart" size={17} />
            <span>반 분석</span>
            <Icon name="chevron" size={15} />
          </Link>
        </li>
        {FEATURES.quiz && (
          <li>
            <Link to="/teacher/reports">
              <Icon name="alert" size={17} />
              <span>신고된 문제</span>
              <Icon name="chevron" size={15} />
            </Link>
          </li>
        )}
        <li>
          <button type="button" onClick={onFeedback}>
            <Icon name="pen" size={17} />
            <span>피드백 기다리는 학생{feedbackCount > 0 ? ` ${feedbackCount}명` : ""}</span>
            <Icon name="chevron" size={15} />
          </button>
        </li>
      </ul>
    </section>
  );
}

const newMemoId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** 반 대시보드 아래 작은 칸: 선생님 메모 (이 브라우저에만 저장) */
export function MemoWidget({ teacherId }: { teacherId: string }) {
  const [memos, setMemos] = useState<Memo[]>(() => loadMemos(browserStorage(), teacherId));
  const [loadedFor, setLoadedFor] = useState(teacherId);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  // 다른 선생님으로 바뀌면 그 선생님 메모를 다시 읽는다
  if (loadedFor !== teacherId) {
    setLoadedFor(teacherId);
    setMemos(loadMemos(browserStorage(), teacherId));
  }

  const commit = (next: Memo[]) => {
    if (saveMemos(browserStorage(), teacherId, next)) {
      setMemos(next);
      setError(null);
    } else {
      setError("이 브라우저에 저장하지 못했어요. 사생활 보호 모드인지 확인해 주세요.");
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next = addMemo(memos, draft, newMemoId(), new Date());
    if (!next) {
      if (memos.length >= MEMO_MAX) setError(`메모는 ${MEMO_MAX}개까지 남길 수 있어요. 다 쓴 메모를 지워 주세요.`);
      return;
    }
    commit(next);
    setDraft("");
  };

  const full = memos.length >= MEMO_MAX;
  return (
    <section className="card compact-widget dash-memo" aria-labelledby="dash-memo-title">
      <div className="card-heading">
        <h2 id="dash-memo-title">메모</h2>
        <small className="dash-memo-count">
          {memos.length}/{MEMO_MAX}
        </small>
      </div>
      <form className="dash-memo-form" onSubmit={submit}>
        <label htmlFor="dash-memo-input" className="sr-only">
          새 메모
        </label>
        <input
          id="dash-memo-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={MEMO_TEXT_MAX}
          placeholder={full ? "메모가 가득 찼어요" : "할 일을 짧게 적어 보세요"}
          disabled={full}
          autoComplete="off"
        />
        <button type="submit" disabled={full || !draft.trim()}>
          추가
        </button>
      </form>
      <p className="dash-memo-note">이 브라우저에만 저장돼요. 학생 이름 같은 개인정보는 적지 마세요.</p>
      {error && (
        <p className="dash-memo-error" role="alert">
          {error}
        </p>
      )}
      {memos.length > 0 ? (
        <ul className="dash-memo-list">
          {memos.map((m) => (
            <li key={m.id}>
              <span>{m.text}</span>
              <button type="button" aria-label={`메모 지우기: ${m.text.slice(0, 20)}`} onClick={() => commit(removeMemo(memos, m.id))}>
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="dash-memo-empty">아직 메모가 없어요.</p>
      )}
    </section>
  );
}

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useParams, useSearchParams } from "react-router";
import QRCode from "qrcode";
import { api, ApiError } from "../../api";
import { useHasConsent } from "../../auth/session";
import { Badge, Button, ButtonLink, EmptyState, ErrorState, Spinner } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { goalLabel } from "../../lib/checklists";
import { toJpegDataUrl } from "../../lib/image";
import { composerKind } from "../../lib/tabs";
import { elapsedLabel, formatTime } from "../../lib/time";
import type { EntryKind, LearningEntry, Visibility } from "../../types/domain";

const KIND_LABEL: Record<EntryKind, string> = {
  MEMO: "메모",
  QUESTION: "궁금한 점",
  QUIZ: "짧은 테스트",
  PAPER: "종이에 기록",
};

function useTick(ms = 1000) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

export function SessionPage() {
  const { id = "" } = useParams();
  const session = useQuery({ queryKey: ["session", id], queryFn: () => api.getSession(id) });
  const active = session.data?.status === "ACTIVE";
  // 실시간 연결이 안 되면 5초마다 다시 불러와 휴대폰에서 올린 기록을 보여 준다 (mock은 상태를 알리지 않아 폴링 없음)
  const [realtimeDown, setRealtimeDown] = useState(false);
  const entries = useQuery({
    queryKey: ["entries", id],
    queryFn: () => api.listEntries(id),
    refetchInterval: active && realtimeDown ? 5000 : false,
  });
  const [params] = useSearchParams();
  const initialKind = composerKind(params.get("kind"));
  const qc = useQueryClient();
  // 휴대폰에서 올린 기록이 PC 화면에 바로 보이게 (실서비스: Realtime, mock: 아무것도 안 함)
  useEffect(() => {
    if (!active) return;
    setRealtimeDown(false);
    let unsub: unknown;
    try {
      unsub = api.subscribeEntries(
        id,
        () => void qc.invalidateQueries({ queryKey: ["entries", id] }),
        (status) => setRealtimeDown(status === "unavailable"),
      );
    } catch {
      setRealtimeDown(true); // 구독을 못 하면 주기적으로 다시 불러온다
    }
    // 설정 누락 시 api는 모든 메서드가 Promise를 돌려주는 Proxy라 함수일 때만 해제
    if (unsub instanceof Promise) unsub.catch(() => {});
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [id, active, qc]);
  const aiOk = useHasConsent("AI");
  const shareOk = useHasConsent("LEARNING_RECORD");
  const [teacherView, setTeacherView] = useState(false);
  useTick();

  if (session.isLoading) return <Spinner />;
  if (session.error) return <ErrorState error={session.error} onRetry={() => session.refetch()} />;
  const s = session.data!;
  if (s.status === "ENDED") return <Navigate to={`/student/records?session=${s.id}`} replace />;

  const list = (entries.data ?? []).filter((e) => !teacherView || e.visibility === "TEACHER");

  return (
    <div>
      <div className="live-header">
        <div>
          <Badge tone="brand">학습 중</Badge>
          <div>
            <small className="live-meta">{formatTime(s.startedAt)} 시작 · 오늘의 목표</small>
            <h2>{goalLabel(s.goal)}</h2>
            {s.goal.note && <p className="live-note">{s.goal.note}</p>}
          </div>
        </div>
        <div className="timer" role="timer" aria-label="경과 시간">
          <Icon name="clock" />
          <strong>{elapsedLabel(s.startedAt)}</strong>
        </div>
        <ButtonLink to={`/student/session/${s.id}/end`} variant="secondary">
          학습 끝내기
        </ButtonLink>
      </div>

      {/* 데스크톱: 왼쪽 입력·기록, 오른쪽 AI / 좁은 화면: 입력 → AI → 기록 (기록이 쌓여도 AI를 찾으려고 끝까지 내리지 않게) */}
      <div className="study-layout">
        <div className="study-composer">
          <EntryComposer sessionId={s.id} shareOk={shareOk} initialKind={initialKind} />
        </div>

        <section className="study-records" aria-label="오늘의 기록">
          <div className="study-records-head">
            <h2 className="subheading">오늘의 기록</h2>
            <label className="teacher-view-toggle">
              <input type="checkbox" checked={teacherView} onChange={(e) => setTeacherView(e.target.checked)} />
              선생님이 보는 화면으로 보기
            </label>
          </div>
          {entries.isLoading && <Spinner />}
          {entries.error && <ErrorState error={entries.error} onRetry={() => entries.refetch()} />}
          {entries.data && list.length === 0 && (
            <EmptyState title={teacherView ? "선생님께 공개된 기록이 없어요" : "아직 기록이 없어요"}>
              공부하다가 알게 된 것, 궁금한 것을 짧게 남겨 보세요.
            </EmptyState>
          )}
          {list.length > 0 && (
            <ul className="timeline">
              {list.map((e) => (
                <EntryItem key={e.id} entry={e} />
              ))}
            </ul>
          )}
        </section>

        {aiOk ? <AiPanel sessionId={s.id} /> : <AiDisabled />}
      </div>
    </div>
  );
}

const DOT: Record<EntryKind, string> = { MEMO: "t0", QUESTION: "t1", QUIZ: "t2", PAPER: "t2" };

function EntryItem({ entry }: { entry: LearningEntry }) {
  return (
    <li className="timeline-item">
      <span className={`timeline-dot ${DOT[entry.kind]}`} aria-hidden />
      <small>
        {formatTime(entry.createdAt)} · {KIND_LABEL[entry.kind]} ·{" "}
        {entry.visibility === "PRIVATE" ? (
          <span className="entry-scope">
            <Icon name="lock" size={13} /> 나만 보기
          </span>
        ) : (
          "교사 공개"
        )}
      </small>
      {entry.content && <p className="entry-content">{entry.content}</p>}
      {entry.kind === "PAPER" && !entry.content && <p className="entry-content muted">공책·학습지에 직접 정리했어요</p>}
    </li>
  );
}

function EntryComposer({ sessionId, shareOk, initialKind }: { sessionId: string; shareOk: boolean; initialKind: EntryKind }) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<EntryKind>(initialKind);
  const [content, setContent] = useState("");
  const [visibility, setVisibility] = useState<Visibility>(shareOk ? "TEACHER" : "PRIVATE");

  // 보낸 값을 고정해 두고 입력창은 바로 비운다. 실패하면 되돌린다 (저장 중에 쓴 다음 내용이 지워지지 않게).
  const add = useMutation({
    mutationFn: (v: { kind: EntryKind; content: string }) =>
      api.addEntry({ sessionId, kind: v.kind, content: v.content, visibility: shareOk ? visibility : "PRIVATE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["entries", sessionId] }),
    onError: (_e, v) => setContent((cur) => cur || v.content),
  });

  const canSubmit = kind === "PAPER" || content.trim().length > 0;
  const submit = () => {
    add.mutate({ kind, content });
    setContent("");
  };

  return (
    <section className="card composer">
      <div className="tabs" role="tablist" aria-label="기록 종류">
        {(Object.keys(KIND_LABEL) as EntryKind[]).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => setKind(k)} className={kind === k ? "active" : ""}>
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        maxLength={2000}
        rows={3}
        aria-label="기록 내용"
        placeholder={
          kind === "PAPER"
            ? "공책에 정리했다면 그대로 저장해도 돼요. (한 줄 메모는 선택)"
            : kind === "QUESTION"
              ? "궁금한 점을 적어 두면 나중에 돌아볼 때 도움이 돼요"
              : "알게 된 것, 해 본 것을 짧게 적어요"
        }
      />
      {kind === "PAPER" && (
        <PaperTools
          sessionId={sessionId}
          // 이미 쓴 내용은 지우지 않고 아래에 붙인다 (입력칸 최대 2000자)
          onText={(t) => setContent((cur) => (cur.trim() ? [cur, t].join("\n") : t).slice(0, 2000))}
        />
      )}
      <div className="composer-foot">
        {shareOk ? (
          <div className="scope" role="radiogroup" aria-label="공개 범위">
            {(["TEACHER", "PRIVATE"] as Visibility[]).map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={visibility === v}
                onClick={() => setVisibility(v)}
                className={visibility === v ? "active" : ""}
              >
                <Icon name={v === "TEACHER" ? "users" : "lock"} size={16} /> {v === "TEACHER" ? "교사 공개" : "나만 보기"}
              </button>
            ))}
          </div>
        ) : (
          <span className="scope-note">기록 공유에 동의하지 않아 모든 기록은 나만 봐요</span>
        )}
        <Button disabled={!canSubmit || (kind === "PAPER" && add.isPending)} onClick={submit}>
          {kind === "PAPER" && !content.trim() ? "종이에 기록했어요" : "기록하기"}
        </Button>
      </div>
      {add.error && (
        <div className="study-err">
          <ErrorState error={add.error} />
        </div>
      )}
    </section>
  );
}

/** 종이 기록 도구: 사진 글자 인식 + (넓은 화면) 휴대폰으로 이어 올리기 QR */
function PaperTools({ sessionId, onText }: { sessionId: string; onText: (text: string) => void }) {
  const aiOk = useHasConsent("AI");
  return (
    <div className="paper-tools">
      {aiOk ? <PaperOcr sessionId={sessionId} onText={onText} /> : <p className="paper-note">AI 사용에 동의해야 사진 글자 인식을 쓸 수 있어요</p>}
      <PaperPhoneQr sessionId={sessionId} />
    </div>
  );
}

function PaperOcr({ sessionId, onText }: { sessionId: string; onText: (text: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [announce, setAnnounce] = useState("");
  // 사진은 줄여서 글자 인식에만 보내고, 화면·저장소 어디에도 남기지 않는다.
  // 변환은 mutation 밖에서 하고 data URL만 넘긴다. 성공·실패 모두 reset, gcTime 0으로 캐시에도 남기지 않는다
  const ocr = useMutation({
    mutationFn: (image: string) => api.ocrPaperPhoto(sessionId, image),
    gcTime: 0,
    onSuccess: (r) => {
      onText(r.text);
      setAnnounce("글자를 입력칸에 채웠어요. 고친 뒤 기록하세요.");
      ocr.reset();
    },
    onError: (err) => {
      setError(err);
      ocr.reset();
    },
  });
  const busy = reading || ocr.isPending;

  async function readPhoto(file: File) {
    setError(null);
    setAnnounce("");
    setReading(true);
    let image: string;
    try {
      image = await toJpegDataUrl(file);
    } catch {
      setError(new PhotoReadError());
      return;
    } finally {
      setReading(false);
    }
    ocr.mutate(image);
  }

  return (
    <div className="paper-ocr">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = ""; // 같은 사진을 다시 골라도 동작하게, 입력에 파일을 남기지 않게
          if (f) void readPhoto(f);
        }}
      />
      <Button variant="secondary" disabled={busy} onClick={() => fileRef.current?.click()}>
        사진으로 올리기
      </Button>
      {busy ? (
        <p className="paper-wait" role="status">
          사진에서 글자를 읽는 중이에요 · 보통 5초쯤
        </p>
      ) : (
        <small className="paper-note">찍은 글자를 입력칸에 채워 줘요. 고친 뒤 기록하세요. 사진은 저장하지 않아요.</small>
      )}
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
      {error != null &&
        (error instanceof ApiError && error.code === "RATE_LIMITED" ? (
          <div className="paper-limit" role="alert">
            AI는 1분에 10번까지 쓸 수 있어요. 1분쯤 뒤에 다시 올려 주세요.
          </div>
        ) : error instanceof PhotoReadError ? (
          <div className="paper-limit" role="alert">
            사진을 열지 못했어요. 다른 사진으로 다시 해 보세요.
          </div>
        ) : (
          <ErrorState error={error} />
        ))}
    </div>
  );
}

class PhotoReadError extends Error {}

function PaperPhoneQr({ sessionId }: { sessionId: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    // 학습 화면 주소만 담는다 (토큰·비밀번호 없음). 휴대폰은 같은 계정으로 따로 로그인
    const url = `${window.location.origin}/student/session/${encodeURIComponent(sessionId)}?kind=PAPER`;
    QRCode.toDataURL(url, { margin: 1, width: 168 })
      .then((d) => alive && setSrc(d))
      .catch(() => alive && setSrc(null));
    return () => {
      alive = false;
    };
  }, [sessionId]);
  if (!src) return null;
  return (
    <div className="paper-qr">
      <img src={src} width={112} height={112} alt="이 학습 화면으로 가는 QR" />
      <div>
        <strong>휴대폰으로 종이 기록 올리기</strong>
        <small>휴대폰 카메라로 찍고 같은 계정으로 로그인하면 이 학습의 '종이에 기록'이 열려요.</small>
      </div>
    </div>
  );
}

function AiDisabled() {
  return (
    <aside className="card ai-card ai-off">
      <div className="ai-title">
        <span>
          <Icon name="spark" />
        </span>
        <div>
          <strong>AI 도우미가 꺼져 있어요</strong>
          <small>AI 사용에 동의하지 않았어요. 필요하면 동의 설정에서 바꿀 수 있어요.</small>
        </div>
      </div>
      <Link to="/student/consent" className="button secondary ai-off-link">
        동의 설정
      </Link>
    </aside>
  );
}

function AiPanel({ sessionId }: { sessionId: string }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const msgs = useQuery({ queryKey: ["ai", sessionId], queryFn: () => api.listAiMessages(sessionId) });
  const ask = useMutation({
    mutationFn: (content: string) => api.askAi(sessionId, content),
    onMutate: () => setText(""),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai", sessionId] }),
    onError: (_e, sent) => setText((cur) => cur || sent),
  });

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [msgs.data, ask.isPending]);

  return (
    <aside className="card ai-card">
      <div className="ai-title">
        <span>
          <Icon name="spark" />
        </span>
        <div>
          <strong>AI 학습 도우미</strong>
          <small>개념은 바로 설명하고, 문제의 최종 답은 스스로 찾도록 도와요</small>
        </div>
      </div>
      <div className="ai-notice">
        <Icon name="alert" size={16} />
        이름·전화번호 같은 개인정보는 쓰지 마세요
      </div>
      <div ref={listRef} className="ai-messages" aria-live="polite">
        {msgs.isLoading && <Spinner />}
        {msgs.data?.length === 0 && <p className="ai-empty">막힌 부분을 물어보세요. 예: "꼭짓점 공식이 왜 이렇게 나와?"</p>}
        {msgs.data?.map((m) => (
          <div key={m.id} className={`chat ${m.role === "ai" ? "assistant" : "user"}`}>
            {m.content}
          </div>
        ))}
        {ask.isPending && (
          <div className="typing">
            <span />
            <span />
            <span /> 생각하는 중…
          </div>
        )}
        {ask.error &&
          (ask.error instanceof ApiError && ask.error.code === "RATE_LIMITED" ? (
            // 바로 다시 보내도 같은 제한에 걸리므로 다시 시도 버튼 대신 기다릴 시간을 안내
            <div className="ai-limit" role="alert">
              AI에게는 1분에 10번까지 물어볼 수 있어요. 1분쯤 뒤에 다시 보내 주세요. 쓴 질문은 입력칸에 남겨 뒀어요.
            </div>
          ) : (
            <ErrorState error={ask.error} onRetry={() => ask.variables && ask.mutate(ask.variables)} />
          ))}
      </div>
      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) ask.mutate(text);
        }}
      >
        <input
          value={text}
          maxLength={1000}
          onChange={(e) => setText(e.target.value)}
          placeholder="AI에게 물어보기"
          aria-label="AI에게 보낼 메시지"
        />
        <button type="submit" aria-label="보내기" disabled={!text.trim() || ask.isPending}>
          <Icon name="chevron" />
        </button>
      </form>
    </aside>
  );
}

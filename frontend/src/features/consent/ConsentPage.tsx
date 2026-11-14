import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router";
import { api, FEATURES } from "../../api";
import { useConsents, useMe } from "../../auth/session";
import { Icon } from "../../components/Icon";
import { Button, ErrorState, Spinner } from "../../components/ui";
import type { ConsentKind } from "../../types/domain";
import { afterConsentPath } from "../../lib/returnPath";
import { formatDateTime } from "../../lib/time";
import { consentPayload } from "../../lib/consentSave";

const ITEMS: Array<{
  kind: ConsentKind;
  title: string;
  body: string;
  ifNo: string;
}> = [
  {
    kind: "AI",
    title: "AI 학습 도우미 사용",
    body: "질문 내용은 이름·연락처를 가린 뒤 AI 서비스로 보내요. AI는 개념은 바로 설명하고, 문제의 최종 답은 스스로 찾도록 힌트를 줘요. 해외 서버로 전송될 수 있어요.",
    ifNo: "동의하지 않으면 AI 창이 보이지 않고, 기록 기능은 그대로 쓸 수 있어요.",
  },
  {
    kind: "LEARNING_RECORD",
    title: "학습 기록을 선생님과 공유",
    body: "'교사 공개'로 남긴 기록과 성찰만 선생님이 볼 수 있어요. '나만 보기' 기록은 선생님도 AI도 보지 않아요. 기록은 성적·징계에 쓰지 않아요.",
    ifNo: "동의하지 않으면 모든 기록이 '나만 보기'로 저장돼요.",
  },
  {
    kind: "SUBJECT_SHARE",
    title: "교과 선생님에게 공개",
    body: "수학으로 시작한 학습은 수학 선생님도 볼 수 있어요. 공개 기록·돌아보기·확인 테스트 결과가 보이고, '나만 보기' 기록은 보이지 않아요.",
    ifNo: "동의하지 않으면 담임 선생님만 볼 수 있어요.",
  },
];

const SUBJECT_NEEDS_RECORD = "먼저 '선생님에게 학습 기록 공개'에 동의해야 해요";

const ICON: Record<ConsentKind, string> = {
  AI: "spark",
  LEARNING_RECORD: "book",
  SUBJECT_SHARE: "book",
};

export function ConsentPage() {
  const me = useMe();
  const consents = useConsents();
  const qc = useQueryClient();
  const nav = useNavigate();
  // RequireRole이 동의 화면으로 보낼 때 넘긴 원래 주소 (휴대폰 QR → 로그인 → 동의 → 그 학습 화면)
  const from = (useLocation().state as { from?: unknown } | null)?.from;
  const [values, setValues] = useState<Record<ConsentKind, boolean | null>>({
    AI: null,
    LEARNING_RECORD: null,
    SUBJECT_SHARE: null,
  });
  const [guardian, setGuardian] = useState(false);

  useEffect(() => {
    if (!consents.data?.length) return;
    const next = {
      AI: null,
      LEARNING_RECORD: null,
      SUBJECT_SHARE: null,
    } as Record<ConsentKind, boolean | null>;
    for (const c of consents.data) next[c.kind] = c.granted;
    setValues(next);
    setGuardian(consents.data.some((c) => c.byGuardian));
  }, [consents.data]);

  const items = ITEMS.filter(
    (i) => i.kind !== "SUBJECT_SHARE" || FEATURES.subjectTeacher,
  );
  const save = useMutation({
    mutationFn: () =>
      api.saveConsents(
        consentPayload(
          items.map((i) => i.kind),
          values,
          !!me.data?.under14 && guardian,
        ),
      ),
    onSuccess: async () => {
      const firstSave = !consents.data?.length; // 저장 전 동의 기록이 없었으면 처음 저장
      await qc.invalidateQueries({ queryKey: ["consents"] });
      nav(afterConsentPath(from, firstSave));
    },
  });

  if (consents.isLoading || me.isLoading) return <Spinner />;
  const recordOn = values.LEARNING_RECORD === true;
  // 이미 동의를 저장한 학생이 새로 생긴 교과 공개 항목을 안 골라도 나머지는 저장할 수 있다 (null = 미동의로 저장)
  const hasSaved = !!consents.data?.length;
  const allDecided = items.every(
    (i) =>
      values[i.kind] !== null ||
      (i.kind === "SUBJECT_SHARE" &&
        (values.LEARNING_RECORD === false || hasSaved)),
  );
  const needGuardian = !!me.data?.under14;
  // 거부·철회는 보호자 동의 없이도 된다 (서버 4-7과 같은 규칙). "동의해요"를 하나라도 골랐을 때만 막는다
  const anyGranted = items.some((i) => values[i.kind] === true);

  return (
    <div className="consent-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">내 정보와 기록</p>
          <h1>이용 동의</h1>
          <p>항목마다 따로 고를 수 있고, 언제든 이 화면에서 바꿀 수 있어요.</p>
        </div>
      </div>
      <div className="card consent-card">
        {items.map((i) => {
          const locked = i.kind === "SUBJECT_SHARE" && !recordOn;
          return (
            <div className="consent-row" key={i.kind}>
              <span className="consent-icon">
                <Icon name={ICON[i.kind]} />
              </span>
              <div>
                <h2>{i.title}</h2>
                <p>{i.body}</p>
                <small>{i.ifNo}</small>
                {i.kind === "SUBJECT_SHARE" && !locked && values.SUBJECT_SHARE === null && hasSaved && (
                  <small className="subj-consent-lock">선택하지 않으면 공개하지 않아요</small>
                )}
                {locked && (
                  <small className="subj-consent-lock" id="subj-consent-lock">
                    {SUBJECT_NEEDS_RECORD}
                  </small>
                )}
              </div>
              <div
                className="segmented"
                role="radiogroup"
                aria-label={i.title}
                aria-disabled={locked || undefined}
                aria-describedby={locked ? "subj-consent-lock" : undefined}
              >
                {[true, false].map((v) => (
                  <button
                    key={String(v)}
                    type="button"
                    role="radio"
                    aria-checked={(locked ? false : values[i.kind]) === v}
                    disabled={locked}
                    onClick={() =>
                      setValues((s) => ({
                        ...s,
                        [i.kind]: v,
                        // 학습 기록을 거절로 바꾸면 교과 공개도 거절
                        ...(i.kind === "LEARNING_RECORD" && !v
                          ? { SUBJECT_SHARE: false }
                          : {}),
                      }))
                    }
                    className={
                      (locked ? null : values[i.kind]) === v
                        ? v
                          ? "active"
                          : "active no"
                        : ""
                    }
                  >
                    {v ? "동의해요" : "동의하지 않아요"}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        {needGuardian && (
          <label className="guardian">
            <input
              type="checkbox"
              checked={guardian}
              onChange={(e) => setGuardian(e.target.checked)}
            />
            <span>
              만 14세 미만이라 보호자 동의를 받았어요. (실제 서비스에서는 보호자
              본인 확인 절차를 거쳐요)
            </span>
          </label>
        )}
        {save.error && (
          <div className="consent-error">
            <ErrorState error={save.error} />
          </div>
        )}
        <Button
          className="w-full consent-save"
          disabled={
            !allDecided ||
            (needGuardian && anyGranted && !guardian) ||
            save.isPending
          }
          onClick={() => save.mutate()}
        >
          저장하고 시작하기
        </Button>
      </div>
      {FEATURES.audit && consents.data && consents.data.length > 0 && (
        <ViewLog />
      )}
    </div>
  );
}

/** 누가 언제 내 기록을 열어 봤는지 (교사 열람 기록) */
function ViewLog() {
  const logs = useQuery({
    queryKey: ["audit-logs"],
    queryFn: () => api.listAuditLogs(),
  });
  return (
    <section className="view-log">
      <div className="section-title">
        <h2>내 기록을 본 사람</h2>
        <span>최근 10개</span>
      </div>
      <p className="view-log-note">
        선생님이 '학생 상세' 화면에서 내 기록을 열면 남아요 (최근 10개). 반 전체
        통계·대시보드를 볼 때는 남지 않아요.
      </p>
      <div className="card access-list">
        {logs.isLoading && <Spinner />}
        {logs.error && (
          <ErrorState error={logs.error} onRetry={() => logs.refetch()} />
        )}
        {logs.data?.length === 0 && (
          <div>
            <p>아직 없어요</p>
          </div>
        )}
        {logs.data?.map((l) => (
          <div key={l.id}>
            <span>
              <Icon name="users" />
            </span>
            <p>
              {l.actorName ? `${l.actorName} 선생님` : "선생님"}
              {l.subject ? `(${l.subject})` : ""}이 내 기록을 봤어요
            </p>
            <small className="access-time">{formatDateTime(l.createdAt)}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

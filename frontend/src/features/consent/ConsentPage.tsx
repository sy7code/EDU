import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { api, FEATURES } from "../../api";
import { useConsents, useMe } from "../../auth/session";
import { Button, Card, ErrorState, PageTitle, Spinner } from "../../components/ui";
import type { ConsentKind } from "../../types/domain";
import { formatDateTime } from "../../lib/time";

const ITEMS: Array<{ kind: ConsentKind; title: string; body: string; ifNo: string }> = [
  {
    kind: "FACEPASS",
    title: "얼굴 인증(토스 페이스패스)으로 학습 시작·종료 확인",
    body: "얼굴 정보는 토스가 암호화해 보관하고, 성장 페이스는 얼굴 사진이나 특징값을 받지 않아요. 인증 결과(누가, 언제, 어느 단말기)만 받아요.",
    ifNo:
      FEATURES.codeAuth || FEATURES.manualAuth
        ? "동의하지 않아도 QR·학생증 바코드·선생님 확인으로 똑같이 쓸 수 있어요."
        : "동의하지 않아도 학습 시작·종료 인증은 할 수 있어요(지금은 데모 인증, QR·학생증 바코드는 준비 중).",
  },
  {
    kind: "AI",
    title: "AI 학습 도우미 사용",
    body: "질문 내용은 이름·연락처를 가린 뒤 AI 서비스로 보내요. AI는 답을 대신 써 주지 않고, 스스로 생각하도록 질문과 힌트를 줘요. 해외 서버로 전송될 수 있어요.",
    ifNo: "동의하지 않으면 AI 창이 보이지 않고, 기록 기능은 그대로 쓸 수 있어요.",
  },
  {
    kind: "LEARNING_RECORD",
    title: "학습 기록을 선생님과 공유",
    body: "'교사 공개'로 남긴 기록과 성찰만 선생님이 볼 수 있어요. '나만 보기' 기록은 선생님도 AI도 보지 않아요. 기록은 성적·징계에 쓰지 않아요.",
    ifNo: "동의하지 않으면 모든 기록이 '나만 보기'로 저장돼요.",
  },
];

export function ConsentPage() {
  const me = useMe();
  const consents = useConsents();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [values, setValues] = useState<Record<ConsentKind, boolean | null>>({
    FACEPASS: null,
    AI: null,
    LEARNING_RECORD: null,
  });
  const [guardian, setGuardian] = useState(false);

  useEffect(() => {
    if (!consents.data?.length) return;
    const next = { FACEPASS: null, AI: null, LEARNING_RECORD: null } as Record<ConsentKind, boolean | null>;
    for (const c of consents.data) next[c.kind] = c.granted;
    setValues(next);
    setGuardian(consents.data.some((c) => c.byGuardian));
  }, [consents.data]);

  const save = useMutation({
    mutationFn: () =>
      api.saveConsents(
        ITEMS.map((i) => ({ kind: i.kind, granted: values[i.kind] === true, byGuardian: !!me.data?.under14 && guardian })),
      ),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["consents"] });
      nav("/student");
    },
  });

  if (consents.isLoading || me.isLoading) return <Spinner />;
  const allDecided = ITEMS.every((i) => values[i.kind] !== null);
  const needGuardian = !!me.data?.under14;
  // 거부·철회는 보호자 동의 없이도 된다 (서버 4-7과 같은 규칙). "동의해요"를 하나라도 골랐을 때만 막는다
  const anyGranted = ITEMS.some((i) => values[i.kind] === true);

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle sub="항목마다 따로 고를 수 있고, 언제든 이 화면에서 바꿀 수 있어요.">이용 동의</PageTitle>
      <div className="space-y-3">
        {ITEMS.map((i) => (
          <Card key={i.kind}>
            <h2 className="font-semibold">{i.title}</h2>
            <p className="mt-1 text-sm text-stone-600">{i.body}</p>
            <p className="mt-1 text-xs text-stone-500">{i.ifNo}</p>
            <div className="mt-3 flex gap-2" role="radiogroup" aria-label={i.title}>
              {[true, false].map((v) => (
                <button
                  key={String(v)}
                  role="radio"
                  aria-checked={values[i.kind] === v}
                  onClick={() => setValues((s) => ({ ...s, [i.kind]: v }))}
                  className={`rounded-lg border px-4 py-2 text-sm ${
                    values[i.kind] === v ? "border-brand-500 bg-brand-50 font-semibold text-brand-700" : "border-stone-300"
                  }`}
                >
                  {v ? "동의해요" : "동의하지 않아요"}
                </button>
              ))}
            </div>
          </Card>
        ))}
        {needGuardian && (
          <Card className="border-amber-300 bg-amber-50">
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1 accent-brand-600" checked={guardian} onChange={(e) => setGuardian(e.target.checked)} />
              만 14세 미만이라 보호자 동의를 받았어요. (실제 서비스에서는 보호자 본인 확인 절차를 거쳐요)
            </label>
          </Card>
        )}
      </div>
      {save.error && <div className="mt-3"><ErrorState error={save.error} /></div>}
      <Button className="mt-5 w-full" disabled={!allDecided || (needGuardian && anyGranted && !guardian) || save.isPending} onClick={() => save.mutate()}>
        저장하고 시작하기
      </Button>
      {FEATURES.audit && consents.data && consents.data.length > 0 && <ViewLog />}
    </div>
  );
}

/** 누가 언제 내 기록을 열어 봤는지 (교사 열람 기록) */
function ViewLog() {
  const logs = useQuery({ queryKey: ["audit-logs"], queryFn: () => api.listAuditLogs() });
  return (
    <Card className="mt-8">
      <h2 className="font-semibold">내 기록을 본 사람</h2>
      <p className="text-xs text-stone-500">선생님이 내 학습 기록을 열면 여기에 남아요 (최근 10개)</p>
      {logs.isLoading && <Spinner />}
      {logs.error && <ErrorState error={logs.error} onRetry={() => logs.refetch()} />}
      {logs.data?.length === 0 && <p className="mt-2 text-sm text-stone-500">아직 없어요</p>}
      <ul className="mt-2 divide-y divide-stone-100 text-sm">
        {logs.data?.slice(0, 10).map((l) => (
          <li key={l.id} className="flex justify-between gap-2 py-2">
            <span>{l.actorName || "선생님"} 선생님이 내 기록을 봤어요</span>
            <span className="text-xs text-stone-500">{formatDateTime(l.createdAt)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

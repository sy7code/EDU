import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, FEATURES, USE_MOCK } from "../../api";
import { useHasConsent, useMe } from "../../auth/session";
import { Button, Card, ErrorState, METHOD_LABEL } from "../../components/ui";
import type { AuthEvent } from "../../types/domain";

const DEMO_DEVICE = "kiosk-study-room-1";

/**
 * 단말기 인증을 기다린다. 학생 기기는 본인의 최근 2분 내 미사용 인증 이벤트를 받아 진행한다.
 * 실서비스: Realtime 구독 / 지금: 1.5초 폴링
 */
export function AuthWait({ purpose, onAuth }: { purpose: "start" | "end"; onAuth: (ev: AuthEvent) => void }) {
  const me = useMe();
  const faceOk = useHasConsent("FACEPASS");
  const [qr, setQr] = useState<{ token: string; expiresAt: string } | null>(null);
  const clearQr = useCallback(() => setQr(null), []);
  const pending = useQuery({
    queryKey: ["pending-auth"],
    queryFn: () => api.getPendingAuthEvent(),
    refetchInterval: 1500,
    gcTime: 0,
  });

  useEffect(() => {
    if (pending.data) onAuth(pending.data);
  }, [pending.data, onAuth]);

  const issueQr = useMutation({ mutationFn: () => api.issueQrToken(), onSuccess: setQr });

  const simulate = useMutation({
    mutationFn: async (kind: "face" | "qr") => {
      if (kind === "face") return api.simulateFaceAuth(DEMO_DEVICE, me.data!.id, true);
      // 데모: 키오스크가 학생 화면의 QR을 스캔한 것처럼
      const t = qr ?? (await api.issueQrToken());
      return api.submitCodeAuth(DEMO_DEVICE, "QR", t.token);
    },
    onSuccess: () => pending.refetch(),
  });

  return (
    <Card className="text-center">
      <div className="mx-auto mb-3 h-10 w-10 animate-pulse rounded-full bg-brand-100" aria-hidden />
      <h2 className="text-lg font-semibold">
        자습실 단말기에서 {purpose === "start" ? "학습 시작" : "학습 종료"} 인증을 해 주세요
      </h2>
      <p className="mt-1 text-sm text-stone-500">
        {faceOk ? `${METHOD_LABEL.FACEPASS}, ` : ""}QR, 학생증 바코드로 인증하면 이 화면이 자동으로 넘어가요.
      </p>
      <p className="mt-1 text-xs text-stone-400">기기를 쓰기 어렵다면 선생님께 확인을 요청할 수 있어요.</p>

      {FEATURES.codeAuth && (
        <div className="mt-4">
          {qr ? (
            <QrBox token={qr.token} expiresAt={qr.expiresAt} onExpired={clearQr} />
          ) : (
            <Button variant="secondary" onClick={() => issueQr.mutate()} disabled={issueQr.isPending}>
              단말기에 보여줄 QR 만들기
            </Button>
          )}
          {issueQr.error && <div className="mt-2"><ErrorState error={issueQr.error} /></div>}
        </div>
      )}

      {pending.error && <div className="mt-3"><ErrorState error={pending.error} /></div>}
      {/* 데모 인증: mock·실제 백엔드(/dev/facepass/simulate) 모두 지원 */}
      <div className="mt-5 flex flex-wrap justify-center gap-2 border-t border-dashed border-stone-200 pt-4">
        <span className="w-full text-xs text-stone-400">데모 전용 버튼{USE_MOCK ? "" : " (실제 단말기 연동 전)"}</span>
        {(faceOk || !FEATURES.codeAuth) && ( /* 대체 수단(QR)이 없는 실제 모드에선 막히지 않게 항상 표시 */
          <Button variant="secondary" onClick={() => simulate.mutate("face")} disabled={simulate.isPending}>
            단말기 얼굴 인증 흉내
          </Button>
        )}
        {FEATURES.codeAuth && (
          <Button variant="secondary" onClick={() => simulate.mutate("qr")} disabled={simulate.isPending}>
            단말기 QR 스캔 흉내
          </Button>
        )}
      </div>
      {simulate.error && <div className="mt-2"><ErrorState error={simulate.error} /></div>}
    </Card>
  );
}

/** 1회용 QR 토큰 표시. 실서비스에서는 QR 이미지로 그린다. */
function QrBox({ token, expiresAt, onExpired }: { token: string; expiresAt: string; onExpired: () => void }) {
  const [left, setLeft] = useState(() => Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000));
  useEffect(() => {
    const t = setInterval(() => {
      const s = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000);
      setLeft(s);
      if (s <= 0) onExpired();
    }, 1000);
    return () => clearInterval(t);
  }, [expiresAt, onExpired]);
  return (
    <div className="mx-auto max-w-xs rounded-lg border-2 border-dashed border-stone-300 p-4">
      <p className="text-xs text-stone-500">단말기 카메라에 이 코드를 보여 주세요 · 한 번만 쓸 수 있어요</p>
      <p className="mt-2 break-all font-mono text-sm">{token}</p>
      <p className="mt-2 text-xs text-amber-700">{Math.max(0, left)}초 뒤 만료</p>
    </div>
  );
}

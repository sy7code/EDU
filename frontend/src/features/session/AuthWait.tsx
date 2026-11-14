import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, FEATURES, USE_MOCK } from "../../api";
import { Button, ErrorState } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { QrImage } from "../../components/QrImage";
import type { AuthEvent } from "../../types/domain";

const DEMO_DEVICE = "kiosk-study-room-1";

/**
 * 단말기 인증을 기다린다. 학생 기기는 본인의 최근 2분 내 미사용 인증 이벤트를 받아 진행한다.
 * 실서비스: Realtime 구독 / 지금: 1.5초 폴링
 */
export function AuthWait({ purpose, onAuth, note }: { purpose: "start" | "end"; onAuth: (ev: AuthEvent) => void; note?: string }) {
  const [qr, setQr] = useState<{ token: string; expiresAt: string } | null>(null);
  const [expired, setExpired] = useState(false);
  const onExpired = useCallback(() => {
    setQr(null);
    setExpired(true);
  }, []);
  const pending = useQuery({
    queryKey: ["pending-auth"],
    queryFn: () => api.getPendingAuthEvent(),
    refetchInterval: 1500,
    gcTime: 0,
  });

  useEffect(() => {
    if (pending.data) onAuth(pending.data);
  }, [pending.data, onAuth]);

  const issueQr = useMutation({ mutationFn: () => api.issueQrToken(), onSuccess: (q) => { setExpired(false); setQr(q); } });

  const simulate = useMutation({
    mutationFn: async (kind: "skip" | "qr") => {
      // 실제 모드 개발용 건너뛰기 (백엔드 QR 배포 후 제거)
      if (kind === "skip") return api.devSkipAuth();
      // 데모: 키오스크가 학생 화면의 QR을 스캔한 것처럼
      const t = qr ?? (await api.issueQrToken());
      return api.submitCodeAuth(DEMO_DEVICE, t.token);
    },
    onSuccess: () => pending.refetch(),
  });

  return (
    <section className="card auth-card">
      <div className="auth-pulse">
        <span>
          <Icon name={purpose === "start" ? "users" : "check"} size={32} />
        </span>
      </div>
      <p className="eyebrow">{purpose === "start" ? "학습 시작 인증" : "학습 종료 인증"}</p>
      <h1>
        자습실 단말기에서
        <br />
        {purpose === "start" ? "학습 시작" : "학습 종료"} 인증을 해 주세요
      </h1>
      {note && <p className="study-auth-note">{note}</p>}
      <p>
        휴대폰에 QR을 띄워 교실 단말기에 보여 주세요. 인증되면 이 화면이 자동으로 넘어가요.
      </p>
      <div className="waiting" role="status">
        <span className="spinner" aria-hidden /> 인증을 기다리고 있어요
      </div>

      {FEATURES.codeAuth && (
        <div className="study-qr">
          <p className="qr-help" role="status" aria-live="polite">{expired && !qr ? "QR이 만료됐어요." : ""}</p>
          {qr ? (
            <QrBox token={qr.token} expiresAt={qr.expiresAt} onExpired={onExpired} />
          ) : (
            <>
              <Button variant="secondary" onClick={() => issueQr.mutate()} disabled={issueQr.isPending}>
                {expired ? "다시 만들기" : "QR 만들기"}
              </Button>
            </>
          )}
          {issueQr.error && <div className="study-err"><ErrorState error={issueQr.error} /></div>}
        </div>
      )}

      {pending.error && <div className="study-err"><ErrorState error={pending.error} /></div>}
      {/* 데모 인증: mock은 QR 스캔 흉내, 실제 모드는 개발용 건너뛰기(/dev/facepass/simulate) */}
      <div className="demo-box">
        <span className="demo-note">데모 전용 버튼{USE_MOCK ? "" : " (실제 단말기 연동 전)"}</span>
        {!USE_MOCK && ( /* 백엔드 QR 배포 전 실제 모드에서 막히지 않게 */
          <Button variant="secondary" onClick={() => simulate.mutate("skip")} disabled={simulate.isPending}>
            인증 건너뛰기 (개발용)
          </Button>
        )}
        {FEATURES.codeAuth && (
          <Button variant="secondary" onClick={() => simulate.mutate("qr")} disabled={simulate.isPending}>
            단말기 QR 스캔 흉내
          </Button>
        )}
      </div>
      {simulate.error && <div className="study-err"><ErrorState error={simulate.error} /></div>}
    </section>
  );
}

/** 1회용 QR 이미지 + 토큰 글자(스캐너 없을 때 입력용) + 남은 시간 */
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
    <div className="qr-box">
      <p className="qr-help">단말기 스캐너에 이 QR을 보여 주세요 · 한 번만 쓸 수 있어요</p>
      <div className="qr-image">
        <QrImage value={token} size={240} displaySize={192} alt="학습 인증용 QR" />
      </div>
      <p className="qr-token" aria-label="QR 코드 글자">{token}</p>
      <p className="qr-left">{Math.max(0, left)}초 뒤 만료</p>
    </div>
  );
}

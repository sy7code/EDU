import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { api, errorMessage } from "../../api";
import { METHOD_LABEL } from "../../components/ui";
import { Icon } from "../../components/Icon";
import type { AuthEvent } from "../../types/domain";
import { formatTime } from "../../lib/time";

const DEVICE_ID = import.meta.env.VITE_KIOSK_DEVICE_ID || "kiosk-study-room-1";
const RESET_MS = 5000;

type View =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "done"; event: AuthEvent }
  | { kind: "error"; message: string };

export function KioskPage() {
  const [view, setView] = useState<View>({ kind: "idle" });
  const [code, setCode] = useState("");
  const codeInput = useRef<HTMLInputElement>(null);

  // 결과 화면은 5초 뒤 초기화 (다음 학생에게 이름이 남지 않게)
  useEffect(() => {
    if (view.kind !== "done" && view.kind !== "error") return;
    const t = setTimeout(() => {
      setView({ kind: "idle" });
      setCode("");
      codeInput.current?.focus();
    }, RESET_MS);
    return () => clearTimeout(t);
  }, [view]);

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    const token = code.trim();
    if (!token) return;
    setView({ kind: "working" });
    try {
      const ev = await api.submitCodeAuth(DEVICE_ID, token);
      setView(ev.success ? { kind: "done", event: ev } : { kind: "error", message: "인식할 수 없는 코드예요. 선생님께 알려 주세요." });
    } catch (err) {
      setView({ kind: "error", message: errorMessage(err) });
    }
  }

  return (
    <div className="study-kiosk">
      <header className="study-kiosk-head">
        <span>성장 페이스 · 자습실 단말기</span>
        <span>{DEVICE_ID}</span>
      </header>

      <main className="study-kiosk-main">
        {view.kind === "idle" && (
          <>
            <span className="study-kiosk-pulse" aria-hidden>
              <span>
                <Icon name="users" size={36} />
              </span>
            </span>
            <h1 className="study-kiosk-title">학습을 시작하거나 마칠 때</h1>
            <p className="study-kiosk-sub">휴대폰의 QR을 찍어 주세요</p>
          </>
        )}

        {view.kind === "working" && (
          <div role="status" className="study-kiosk-working">
            <span className="study-kiosk-spinner" aria-hidden />
            <p className="study-kiosk-sub">확인하고 있어요…</p>
          </div>
        )}

        {view.kind === "done" && (
          <div role="status" className="study-kiosk-done">
            <span className="study-kiosk-pulse" aria-hidden>
              <span>
                <Icon name="check" size={40} />
              </span>
            </span>
            <p className="study-kiosk-title">{view.event.maskedName} 학생, 확인되었어요</p>
            <p className="study-kiosk-sub">
              {METHOD_LABEL[view.event.method]} · {formatTime(view.event.verifiedAt)}
            </p>
            <p className="study-kiosk-hint">내 태블릿에서 학습 화면을 이어서 진행하세요 (2분 안에)</p>
          </div>
        )}

        {view.kind === "error" && (
          <div role="alert" className="study-kiosk-error">
            <p className="study-kiosk-error-text">{view.message}</p>
            <button type="button" onClick={() => setView({ kind: "idle" })} className="study-kiosk-ghost">
              처음으로
            </button>
          </div>
        )}
      </main>

      <footer className="study-kiosk-foot">
        <form onSubmit={submitCode} className="study-kiosk-code">
          <label className="sr-only" htmlFor="code">QR 코드</label>
          <input
            id="code"
            ref={codeInput}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="QR 스캔 또는 코드 입력"
            autoComplete="off"
          />
          <button type="submit">확인</button>
        </form>
        <p className="study-kiosk-privacy">
          QR은 1분 동안 한 번만 쓸 수 있어요 · <Link to="/">처음 화면</Link>
        </p>
      </footer>
    </div>
  );
}

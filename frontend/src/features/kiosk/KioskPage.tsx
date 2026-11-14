import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { api, FEATURES, USE_MOCK } from "../../api";
import { clearKioskToken, kioskError, loadKioskToken, saveKioskToken } from "../../lib/kioskToken";
import { browserStorage } from "../../lib/memo";
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
  | { kind: "error"; message: string; needsSetup?: boolean };

export function KioskPage() {
  // 실제 모드: QR 인증이 꺼져 있으면 API를 부르지 않고 안내만 보인다
  if (!FEATURES.codeAuth) {
    return (
      <div className="study-kiosk">
        <header className="study-kiosk-head">
          <span>성장 페이스 · 자습실 단말기</span>
          <span>{DEVICE_ID}</span>
        </header>
        <main className="study-kiosk-main">
          <p className="study-kiosk-sub" role="status">
            실제 서비스에서는 아직 교실 단말기를 쓸 수 없어요.
          </p>
        </main>
        <footer className="study-kiosk-foot">
          <p className="study-kiosk-privacy"><Link to="/">처음 화면</Link></p>
        </footer>
      </div>
    );
  }
  return <KioskWithSetup />;
}

/** 실제 모드는 단말기 토큰이 있어야 스캔한다. mock은 토큰 없이 동작 */
function KioskWithSetup() {
  const [configured, setConfigured] = useState(() => USE_MOCK || loadKioskToken(browserStorage()) !== null);
  const [setupNote, setSetupNote] = useState("");
  if (!configured) return <KioskSetup note={setupNote} onSaved={() => setConfigured(true)} />;
  return (
    <KioskScanner
      onNeedSetup={(message) => {
        setSetupNote(message);
        setConfigured(false);
      }}
    />
  );
}

/** 단말기 설정: 토큰을 한 번 입력해 이 브라우저에만 저장. 저장 뒤에는 값을 다시 보이지 않는다 */
function KioskSetup({ note, onSaved }: { note: string; onSaved: () => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const saved = loadKioskToken(browserStorage()) !== null;

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) {
      setError("단말기 토큰을 입력해 주세요.");
      return;
    }
    if (!saveKioskToken(browserStorage(), value)) {
      setError("이 브라우저에 저장할 수 없어요. 사생활 보호 모드인지 확인해 주세요.");
      return;
    }
    setValue("");
    setError("");
    onSaved();
  }

  return (
    <div className="study-kiosk">
      <header className="study-kiosk-head">
        <span>성장 페이스 · 자습실 단말기</span>
        <span>{DEVICE_ID}</span>
      </header>
      <main className="study-kiosk-main">
        <h1 className="study-kiosk-title">단말기 설정</h1>
        {note && <p className="study-kiosk-error-text" role="alert">{note}</p>}
        <p className="study-kiosk-sub">
          선생님이 받은 단말기 토큰을 한 번 입력해 주세요. 이 브라우저에만 저장되고 화면에 다시 보이지 않아요.
          {saved && " (지금 설정됨)"}
        </p>
        <form onSubmit={save} className="study-kiosk-code study-kiosk-setup">
          <label htmlFor="kiosk-token">단말기 토큰</label>
          <input
            id="kiosk-token"
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoComplete="off"
            autoFocus
          />
          <button type="submit">저장</button>
        </form>
        {error && <p className="study-kiosk-error-text" role="alert">{error}</p>}
      </main>
      <footer className="study-kiosk-foot">
        <p className="study-kiosk-privacy"><Link to="/">처음 화면</Link></p>
      </footer>
    </div>
  );
}

function KioskScanner({ onNeedSetup }: { onNeedSetup: (message: string) => void }) {
  const [view, setView] = useState<View>({ kind: "idle" });
  const [code, setCode] = useState("");
  const codeInput = useRef<HTMLInputElement>(null);

  // 스캐너는 키보드처럼 입력하므로 항상 입력칸에 포커스를 둔다
  useEffect(() => {
    codeInput.current?.focus();
  }, []);

  // 결과 화면은 5초 뒤 초기화 (다음 학생에게 이름이 남지 않게)
  useEffect(() => {
    if (view.kind !== "done" && view.kind !== "error") return;
    const t = setTimeout(() => {
      setView({ kind: "idle" });
      codeInput.current?.focus();
    }, RESET_MS);
    return () => clearTimeout(t);
  }, [view]);

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    const token = code.trim();
    if (!token) return;
    setView({ kind: "working" });
    let ok = false;
    try {
      const ev = await api.submitCodeAuth(DEVICE_ID, token);
      ok = ev.success;
      setView(ev.success ? { kind: "done", event: ev } : { kind: "error", message: "인식할 수 없는 코드예요. 선생님께 알려 주세요." });
    } catch (err) {
      const k = kioskError(err);
      setView({ kind: "error", message: k.message, needsSetup: k.needsSetup });
    }
    // 성공할 때만 비운다. 실패하면 글자를 남기고 선택해 고치거나 다음 스캔이 덮어쓰게 한다
    if (ok) setCode("");
    codeInput.current?.focus();
    if (!ok) codeInput.current?.select();
  }

  return (
    <div className="study-kiosk">
      <header className="study-kiosk-head">
        <span>성장 페이스 · 자습실 단말기</span>
        <span>{DEVICE_ID}</span>
      </header>

      <main className="study-kiosk-main" aria-live="polite">
        {view.kind === "idle" && (
          <>
            <span className="study-kiosk-pulse" aria-hidden>
              <span>
                <Icon name="users" size={36} />
              </span>
            </span>
            <h1 className="study-kiosk-title">학습을 시작하거나 마칠 때</h1>
            <p className="study-kiosk-sub">학생 휴대폰의 QR을 스캐너로 읽거나 아래 글자를 입력하세요</p>
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
            {view.needsSetup && !USE_MOCK && (
              <button type="button" onClick={() => onNeedSetup(view.message)} className="study-kiosk-ghost">
                단말기 토큰 다시 입력
              </button>
            )}
            <button type="button" onClick={() => { setView({ kind: "idle" }); codeInput.current?.focus(); codeInput.current?.select(); }} className="study-kiosk-ghost">
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
            placeholder="QR 스캔 또는 글자 입력 후 Enter"
            autoFocus
            autoComplete="off"
          />
          <button type="submit">확인</button>
        </form>
        <p className="study-kiosk-privacy">
          QR은 1분 동안 한 번만 쓸 수 있어요 · {!USE_MOCK && (
            <>
              단말기 토큰 설정됨 ·{" "}
              <button type="button" className="study-kiosk-link" onClick={() => { clearKioskToken(browserStorage()); onNeedSetup(""); }}>
                단말기 설정 지우기
              </button>{" "}
              ·{" "}
            </>
          )}
          <Link to="/">처음 화면</Link>
        </p>
      </footer>
    </div>
  );
}

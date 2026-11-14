import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { api, errorMessage, USE_MOCK } from "../../api";
import { createSeed } from "../../api/mockData";
import {
  detectTossSdk,
  FACEPASS_RESULT_TEXT,
  MockFacePassProvider,
  TossFacePassProvider,
  type FaceAuthProvider,
} from "../../facepass/provider";
import { METHOD_LABEL } from "../../components/ui";
import { Icon } from "../../components/Icon";
import type { AuthEvent } from "../../types/domain";
import { formatTime } from "../../lib/time";

const DEVICE_ID = import.meta.env.VITE_KIOSK_DEVICE_ID || "kiosk-study-room-1";
const RESET_MS = 5000;

type View =
  | { kind: "idle" }
  | { kind: "pick" }
  | { kind: "working" }
  | { kind: "done"; event: AuthEvent }
  | { kind: "error"; message: string };

export function KioskPage() {
  const [view, setView] = useState<View>({ kind: "idle" });
  const [code, setCode] = useState("");
  const pickResolver = useRef<((v: { serial: string | null; fail?: boolean }) => void) | null>(null);
  const codeInput = useRef<HTMLInputElement>(null);

  // 데모용: 단말기 밖에서는 화면에서 '얼굴'을 고른다
  const demoStudents = useMemo(
    () => (USE_MOCK ? createSeed(new Date()).users.filter((u) => u.role === "student" && u.classId === "c1") : []),
    [],
  );

  const provider: FaceAuthProvider = useMemo(() => {
    const sdk = detectTossSdk();
    if (sdk) return new TossFacePassProvider(sdk);
    return new MockFacePassProvider(
      () =>
        new Promise((resolve) => {
          pickResolver.current = (v) => {
            setView({ kind: "working" }); // 고르자마자 '확인 중'으로
            resolve(v);
          };
          setView({ kind: "pick" });
        }),
    );
  }, []);

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

  async function startFace() {
    setView({ kind: "working" });
    try {
      const raw = await provider.authenticate();
      setView({ kind: "working" });
      if (!raw.authenticated) {
        setView({ kind: "error", message: FACEPASS_RESULT_TEXT[raw.result] });
        return;
      }
      const ev = await api.submitFaceAuth(DEVICE_ID, raw);
      setView(ev.success ? { kind: "done", event: ev } : { kind: "error", message: "등록되지 않았거나 얼굴 인증에 동의하지 않은 사용자예요. QR·바코드를 써 주세요." });
    } catch (e) {
      setView({ kind: "error", message: e instanceof Error && e.message === "FACEPASS_RENDER_FAILED"
          ? "인증 화면을 열지 못했어요. QR·바코드를 써 주세요."
          : e instanceof Error && e.message === "FACEPASS_TIMEOUT"
            ? "인증 시간이 지났어요. 다시 시도하거나 QR·바코드를 써 주세요."
            : errorMessage(e) });
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    const token = code.trim();
    if (!token) return;
    setView({ kind: "working" });
    try {
      // 학생 기기 QR은 'QR' 접두어, 학생증 바코드는 숫자
      const method = token.startsWith("QR") ? "QR" : "BARCODE";
      const ev = await api.submitCodeAuth(DEVICE_ID, method, token);
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
            <p className="study-kiosk-sub">얼굴을 비추거나 QR·학생증 바코드를 찍어 주세요</p>
            <button type="button" onClick={startFace} className="study-kiosk-face">
              얼굴로 인증하기
            </button>
          </>
        )}

        {view.kind === "pick" && (
          <div className="study-kiosk-pick">
            <h1 className="study-kiosk-pick-title">[데모] 단말기 카메라 대신 인증할 학생을 고르세요</h1>
            <p className="study-kiosk-sub small">실제 단말기에서는 토스 FacePass 화면이 열리고, 시리얼 번호만 전달돼요.</p>
            <div className="study-kiosk-grid">
              {demoStudents.map((s) => (
                <button type="button" key={s.id} onClick={() => pickResolver.current?.({ serial: `serial-${s.id}` })}>
                  {s.number}번
                </button>
              ))}
            </div>
            <button type="button" className="study-kiosk-ghost" onClick={() => pickResolver.current?.({ serial: null, fail: true })}>
              인식 실패 상황 보기
            </button>
          </div>
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
          <label className="sr-only" htmlFor="code">QR·바코드</label>
          <input
            id="code"
            ref={codeInput}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="QR·학생증 바코드 스캔"
            autoComplete="off"
          />
          <button type="submit">확인</button>
        </form>
        <p className="study-kiosk-privacy">
          얼굴 정보는 저장하지 않아요 · <Link to="/">처음 화면</Link>
        </p>
      </footer>
    </div>
  );
}

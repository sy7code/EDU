import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, useLocation, useNavigate } from "react-router";
import { returnPath } from "../../lib/returnPath";
import { api, USE_MOCK } from "../../api";
import { useMe } from "../../auth/session";
import { Icon } from "../../components/Icon";
import { Button, ButtonLink, ErrorState, Spinner } from "../../components/ui";

function LoginMessage({ sub }: { sub: string }) {
  return (
    <div className="login-message">
      <span className="brandmark">
        <Icon name="leaf" size={22} />
      </span>
      <p className="eyebrow">나의 배움을 천천히 기록하는 곳</p>
      <h1>
        오늘의 공부가
        <br />
        내일의 성장으로 이어지도록
      </h1>
      <p>{sub}</p>
    </div>
  );
}

function MobileBrand() {
  return (
    <div className="brand mobile-login-brand">
      <span className="brandmark">
        <Icon name="leaf" size={21} />
      </span>
      <span>성장 페이스</span>
    </div>
  );
}

/** 실제 백엔드 모드: 이메일·비밀번호 로그인 (Supabase Auth). 비밀번호는 사용자가 직접 입력 */
function RealLogin() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const from = (useLocation().state as { from?: unknown } | null)?.from;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const login = useMutation({
    mutationFn: () => api.signIn(email, password),
    onSuccess: async (u) => {
      setPassword("");
      qc.clear();
      await qc.invalidateQueries();
      nav(returnPath(from, u.role));
    },
  });
  return (
    <div className="login-page">
      <LoginMessage sub="성장 페이스는 점수보다 과정과 질문을 소중하게 기록합니다." />
      <form
        className="card login-card"
        onSubmit={(e) => {
          e.preventDefault();
          login.mutate();
        }}
      >
        <MobileBrand />
        <h2>학교 계정으로 로그인</h2>
        <p>학교에서 안내받은 이메일과 비밀번호를 입력해 주세요.</p>
        <label htmlFor="email">이메일</label>
        <input id="email" type="email" autoComplete="username" placeholder="name@school.kr" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label htmlFor="password">비밀번호</label>
        <input id="password" type="password" autoComplete="current-password" placeholder="비밀번호 입력" value={password} onChange={(e) => setPassword(e.target.value)} />
        {login.error && (
          <p className="login-error" role="alert">
            이메일이나 비밀번호를 확인해 주세요.
          </p>
        )}
        <Button type="submit" className="w-full login-submit" disabled={!email || !password || login.isPending}>
          {login.isPending ? "로그인 중…" : "로그인"}
        </Button>
        <div className="school-account">
          <Icon name="lock" />
          <p>
            <strong>학교 계정을 잊었나요?</strong>
            담임 선생님이나 학교 담당자에게 문의해 주세요.
          </p>
        </div>
      </form>
    </div>
  );
}

// 데모용 로그인: 실제 백엔드 모드에서는 RealLogin
export function LoginPage() {
  const me = useMe();
  const from = (useLocation().state as { from?: unknown } | null)?.from;
  if (me.data) return <Navigate to={returnPath(from, me.data.role)} replace />;
  if (!USE_MOCK) return me.isLoading ? <Spinner /> : <RealLogin />;
  return <DemoLogin />;
}

function DemoLogin() {
  const me = useMe();
  const qc = useQueryClient();
  const nav = useNavigate();
  const from = (useLocation().state as { from?: unknown } | null)?.from;
  const users = useQuery({ queryKey: ["demo-users"], queryFn: () => api.listDemoUsers() });
  const login = useMutation({
    mutationFn: (id: string) => api.login(id),
    onSuccess: async (u) => {
      qc.clear();
      await qc.invalidateQueries();
      nav(returnPath(from, u.role));
    },
  });

  if (me.data) return <Navigate to={returnPath(from, me.data.role)} replace />;

  const teachers = users.data?.filter((u) => u.role === "teacher") ?? [];
  const students = users.data?.filter((u) => u.role === "student") ?? [];

  return (
    <div className="login-page">
      <LoginMessage sub="AI와 함께 스스로 공부한 과정을 기록하고, 선생님과 함께 돌아보는 자기주도학습 플랫폼" />
      <div className="card login-card demo-login">
        <MobileBrand />
        <h2>성장 페이스</h2>
        <p>데모 계정으로 둘러볼 수 있어요.</p>

        <div className="school-account demo-kiosk">
          <Icon name="lock" />
          <p>
            <strong>교실 단말기</strong>
            얼굴·QR·바코드로 학습 시작과 끝을 인증해요.
          </p>
          <ButtonLink to="/kiosk" variant="secondary">
            단말기 화면 열기
          </ButtonLink>
        </div>

        <h3 className="demo-h3">데모 계정으로 들어가기</h3>
        {users.isLoading && <Spinner />}
        {users.error && <ErrorState error={users.error} onRetry={() => users.refetch()} />}
        {login.error && <ErrorState error={login.error} />}
        <div className="demo-teachers">
          {teachers.map((t) => (
            <Button key={t.id} variant="secondary" onClick={() => login.mutate(t.id)} disabled={login.isPending}>
              {t.name} 선생님 {t.classId === "c1" ? "(2학년 3반)" : t.classId === "" ? "(교과 선생님)" : "(다른 반)"}
            </Button>
          ))}
        </div>
        <p className="demo-hint">학생 (3번: 얼굴 인증 거부·QR 사용 / 4번: AI 사용 거부)</p>
        <div className="demo-students">
          {students.map((s) => (
            <button key={s.id} type="button" className="demo-student" onClick={() => login.mutate(s.id)} disabled={login.isPending}>
              <span>{s.number}</span> {s.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

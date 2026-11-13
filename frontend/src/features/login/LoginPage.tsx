import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, useNavigate } from "react-router";
import { api } from "../../api";
import { useMe } from "../../auth/session";
import { Button, ButtonLink, Card, ErrorState, PageTitle, Spinner } from "../../components/ui";

// 데모용 로그인: 실제 서비스에서는 Supabase Auth(학교 계정)로 바뀐다.
export function LoginPage() {
  const me = useMe();
  const qc = useQueryClient();
  const nav = useNavigate();
  const users = useQuery({ queryKey: ["demo-users"], queryFn: () => api.listDemoUsers() });
  const login = useMutation({
    mutationFn: (id: string) => api.login(id),
    onSuccess: async (u) => {
      qc.clear();
      await qc.invalidateQueries();
      nav(u.role === "teacher" ? "/teacher" : "/student");
    },
  });

  if (me.data) return <Navigate to={me.data.role === "teacher" ? "/teacher" : "/student"} replace />;

  const teachers = users.data?.filter((u) => u.role === "teacher") ?? [];
  const students = users.data?.filter((u) => u.role === "student") ?? [];

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle sub="AI와 함께 스스로 공부한 과정을 기록하고, 선생님과 함께 돌아보는 자기주도학습 플랫폼">
        성장 페이스
      </PageTitle>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <h2 className="font-semibold">교실 단말기</h2>
          <p className="mt-1 text-sm text-stone-500">얼굴·QR·바코드로 학습 시작과 끝을 인증해요.</p>
          <ButtonLink to="/kiosk" className="mt-4">
            단말기 화면 열기
          </ButtonLink>
        </Card>

        <Card className="md:col-span-2">
          <h2 className="font-semibold">데모 계정으로 들어가기</h2>
          {users.isLoading && <Spinner />}
          {users.error && <ErrorState error={users.error} onRetry={() => users.refetch()} />}
          {login.error && <ErrorState error={login.error} />}
          <div className="mt-3 flex flex-wrap gap-2">
            {teachers.map((t) => (
              <Button key={t.id} variant="secondary" onClick={() => login.mutate(t.id)} disabled={login.isPending}>
                {t.name} 선생님 {t.classId === "c1" ? "(2학년 3반)" : "(다른 반)"}
              </Button>
            ))}
          </div>
          <p className="mt-4 text-xs text-stone-500">학생 (3번: 얼굴 인증 거부·QR 사용 / 4번: AI 사용 거부)</p>
          <div className="mt-2 grid max-h-64 grid-cols-3 gap-1.5 overflow-y-auto sm:grid-cols-5">
            {students.map((s) => (
              <button
                key={s.id}
                className="rounded-md border border-stone-200 px-2 py-1.5 text-left text-sm hover:border-brand-500 hover:bg-brand-50"
                onClick={() => login.mutate(s.id)}
                disabled={login.isPending}
              >
                <span className="text-stone-400">{s.number}</span> {s.name}
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

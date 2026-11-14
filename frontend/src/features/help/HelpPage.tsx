import { Link, Navigate, useLocation } from "react-router";
import { FEATURES } from "../../api";
import { useMe } from "../../auth/session";
import { Spinner } from "../../components/ui";
import { Icon } from "../../components/Icon";

type Guide = { icon: string; title: string; points: string[]; link?: { to: string; label: string } };

const TEACHER_GUIDES: Guide[] = [
  {
    icon: "users",
    title: "반 대시보드: 카드와 필터",
    points: [
      "'챙길 학생' 카드를 누르면 아래 학생 표가 그 조건(지금 학습 중, 이야기 나눠 볼 학생, 피드백 기다림)으로 걸러져요. 한 번 더 누르면 반 전체로 돌아가요.",
      "검색 칸에 이름이나 번호를 넣으면 표에서 바로 찾을 수 있어요.",
      "'학습 현황 내려받기'는 지금 표에 보이는 학생만 CSV 파일로 저장해요. 기록 공유를 하지 않은 학생은 질문·테스트 칸이 비어 있어요.",
      "메모는 이 브라우저에만 저장되고 로그아웃해도 남아요. 여럿이 쓰는 컴퓨터라면 다 쓴 메모를 지우고, 학생 이름 같은 개인정보는 적지 마세요.",
    ],
    link: { to: "/teacher", label: "반 대시보드로 가기" },
  },
  {
    icon: "book",
    title: "학생 상세: 탭으로 나눠 보기",
    points: [
      "표에서 학생 이름을 누르면 '요약', '학습 기록', 'AI 질문' 탭으로 나눠 볼 수 있어요.",
      "학생이 '교사 공개'로 남긴 기록만 보여요. 기록 공유에 동의하지 않은 학생은 내용 대신 횟수·시간만 보여요.",
      ...(FEATURES.audit ? ["학생 상세를 열면 열람 기록이 남고, 학생은 '동의 설정'에서 이를 볼 수 있어요."] : []),
    ],
  },
  {
    icon: "pen",
    title: "피드백 남기기",
    points: [
      "학생 상세의 '학습 기록' 탭에서 학생이 학습을 마치고 남긴 돌아보기에 짧은 한마디를 남길 수 있어요.",
      "'피드백 기다림' 카드나 오늘 칸의 '피드백 보기'로 기다리는 학생을 바로 모아 볼 수 있어요.",
    ],
  },
  ...(FEATURES.quiz
    ? [
        {
          icon: "alert",
          title: "신고된 문제 처리",
          points: [
            "학생이 확인 테스트 문항이 이상하다고 신고하면 '신고된 문제'에 모여요.",
            "'문항이 잘못됐어요 · 앞으로 제외' 또는 '문항은 괜찮아요 · 신고 기각(재채점)' 중에서 골라 주세요.",
            "AI가 먼저 살펴본 의견이 있으면 함께 보여요.",
          ],
          link: { to: "/teacher/reports", label: "신고된 문제 보기" },
        },
      ]
    : []),
  {
    icon: "chart",
    title: "Pace 지수는 이렇게 읽어요",
    points: [
      "Pace 지수는 하루 100점으로, 지속성 25 · 과정 기록 25 · 성찰 20 · 목표 달성 30을 더해요.",
      "다른 학생과 비교하지 않고 그 학생의 평소(지난 28일)를 기준으로 봐요. 성적이나 순위가 아니에요.",
      "숫자 하나로 판단하기보다, 학생과 이야기를 시작하는 단서로 써 주세요.",
    ],
    link: { to: "/teacher/analytics", label: "반 분석 보기" },
  },
];

const STUDENT_GUIDES: Guide[] = [
  {
    icon: "pen",
    title: "학습 시작하기와 인증",
    points: [
      "'학습하기'에서 오늘 공부할 목표를 정하고 시작해요.",
      "학습을 시작할 때와 마칠 때 본인 확인을 해요. 기기를 쓰기 어렵다면 선생님께 확인을 요청할 수 있어요.",
    ],
    link: { to: "/student/start", label: "학습 시작하기" },
  },
  {
    icon: "book",
    title: "기록 종류와 공개 범위",
    points: [
      "학습 중에 메모, 질문, 종이 기록을 남길 수 있어요.",
      "기록마다 '교사 공개'와 '나만 보기'를 고를 수 있어요. '나만 보기' 기록은 선생님도 AI도 보지 않아요.",
      "기록 공유에 동의하지 않으면 모든 기록이 '나만 보기'로 저장돼요.",
    ],
    link: { to: "/student/records", label: "내 기록 보기" },
  },
  {
    icon: "spark",
    title: "AI 도우미는 이렇게 도와요",
    points: [
      "AI 도우미는 개념은 바로 설명하고, 문제의 최종 답은 스스로 찾도록 힌트를 줘요.",
      "AI가 만든 답변은 참고용이에요. 이상하면 선생님께 물어보세요.",
      "이름·전화번호 같은 개인정보는 쓰지 마세요.",
    ],
  },
  {
    icon: "home",
    title: "종이 사진 올리기와 휴대폰 QR",
    points: [
      "종이에 푼 내용은 학습 화면의 종이 기록에서 사진으로 올릴 수 있어요. AI 사용에 동의하면 사진 속 글자를 읽어 줘요.",
      "화면에 보이는 QR을 휴대폰으로 찍으면, 휴대폰에서 로그인한 뒤 그 학습에 바로 사진을 이어서 올릴 수 있어요.",
    ],
  },
  {
    icon: "check",
    title: "돌아보기와 확인 테스트",
    points: [
      "학습을 마치면 오늘 무엇을 알게 됐는지 짧게 돌아봐요. 선생님이 한마디를 남겨 줄 수 있어요.",
      ...(FEATURES.quiz ? ["확인 테스트로 오늘 공부한 내용을 점검해요. 이상한 문제는 신고하면 AI가 먼저 확인하고, 오류가 있으면 채점에서 빠져요."] : []),
    ],
  },
  ...(FEATURES.consent
    ? [
        {
          icon: "settings",
          title: "동의 설정",
          points: [
            "얼굴 인증, AI 학습 도우미, 학습 기록 공유에 대한 동의를 '동의 설정'에서 언제든 바꿀 수 있어요.",
            "동의하지 않아도 학습과 기록은 할 수 있어요. 무엇이 달라지는지는 동의 설정 화면에 적혀 있어요.",
          ],
          link: { to: "/student/consent", label: "동의 설정 보기" },
        },
      ]
    : []),
];

/** 사용 방법 안내 (선생님·학생 공용, 로그인한 사람만) */
export function HelpPage() {
  const me = useMe();
  const loc = useLocation();
  if (me.isLoading) return <Spinner />;
  if (!me.data) return <Navigate to="/" replace state={{ from: loc.pathname }} />;
  const teacher = me.data.role === "teacher";
  const guides = teacher ? TEACHER_GUIDES : STUDENT_GUIDES;

  return (
    <div className="help-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">도움말</p>
          <h1>사용 방법</h1>
          <p>{teacher ? "반 학생들의 자기주도학습을 살펴보는 방법을 모았어요." : "성장 페이스로 스스로 공부하는 방법을 모았어요."}</p>
        </div>
      </div>
      <div className="help-grid">
        {guides.map((g) => (
          <section className="card help-card" key={g.title}>
            <h2>
              <span className="help-icon" aria-hidden="true">
                <Icon name={g.icon} size={18} />
              </span>
              {g.title}
            </h2>
            <ul>
              {g.points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            {g.link && (
              <Link to={g.link.to} className="help-link">
                {g.link.label} <Icon name="chevron" size={15} />
              </Link>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

import type { DashboardRow, TopicGrowth } from "../types/domain";
import { UNDERSTANDING_LABELS } from "./checklists";
import type { QuestionType } from "./questionType";

export type InsightInput = {
  /** 기간 이름 (문장에 그대로): "최근 7일", "최근 4주" */
  period: string;
  shared: boolean;
  sessionCount: number;
  classAvgSessions?: number | null;
  lastSessionAt?: string | null;
  quizRate?: number | null;
  classAvgQuizRate?: number | null;
  types?: Record<QuestionType, number> | null;
  topics?: TopicGrowth[];
  openQuestionCount?: number;
  hasReflectionWithoutFeedback?: boolean;
};
export type Insight = { tone: "warn" | "good" | "info"; text: string; evidence: string; action: string };

const pct = (v: number) => `${Math.round(v * 100)}%`;
const round1 = (v: number) => Math.round(v * 10) / 10;
const ORDER: Record<Insight["tone"], number> = { warn: 0, good: 1, info: 2 };
const MIN_QUESTIONS = 4; // 질문이 이보다 적으면 비율로 판단하지 않는다
const LOW_RATE = 0.4;
const GROWTH = 0.2;

/** 교사가 빨리 판단하도록, 숫자에서 규칙으로 뽑은 문장 (근거 숫자·할 일 함께). 경고 → 좋은 점 → 안내 순, 최대 4개 */
export function studentInsights(input: InsightInput): Insight[] {
  const out: Insight[] = [];
  const { period, sessionCount, classAvgSessions } = input;

  if (sessionCount === 0) {
    out.push({
      tone: "warn",
      text: `${period} 학습 기록 없음`,
      evidence: input.lastSessionAt ? `마지막 학습 ${input.lastSessionAt.slice(0, 10)}` : "학습 기록이 아직 없어요",
      action: "학습 계획을 같이 세워 보기",
    });
  } else if (classAvgSessions && sessionCount < classAvgSessions / 2) {
    out.push({
      tone: "warn",
      text: "학습 횟수가 반 평균의 절반 아래",
      evidence: `${sessionCount}회 / 반 평균 ${round1(classAvgSessions)}회`,
      action: "공부 시간이 부족한 이유 물어보기",
    });
  }

  // 아래는 기록 내용에서 나온 판단이라 기록 공유에 동의한 학생만
  if (input.shared) {
    for (const t of input.topics ?? []) {
      if (t.signal === "OVERCONFIDENT") {
        out.push({
          tone: "warn",
          text: `${t.name}: 이해했다는데 점수가 낮음`,
          evidence: `최근 정답률 ${t.lastRate === null ? "-" : pct(t.lastRate)} · 이해도 '${UNDERSTANDING_LABELS[3]}'`,
          action: "개념을 직접 설명해 보게 하기",
        });
      } else if (t.signal === "LOW_SCORE") {
        out.push({ tone: "warn", text: `${t.name}: 정답률 낮음`, evidence: `최근 정답률 ${t.lastRate === null ? "-" : pct(t.lastRate)}`, action: "기본 개념 다시 보기 권하기" });
      }
    }

    if (typeof input.quizRate === "number" && input.quizRate < LOW_RATE) {
      out.push({
        tone: "warn",
        text: "확인 테스트 정답률 낮음",
        evidence: typeof input.classAvgQuizRate === "number" ? `${pct(input.quizRate)} / 반 평균 ${pct(input.classAvgQuizRate)}` : pct(input.quizRate),
        action: "틀린 문항을 같이 보기",
      });
    }

    const types = input.types;
    const total = types ? types.CONCEPT + types.CHECK + types.ANSWER + types.OTHER : 0;
    if (types && total >= MIN_QUESTIONS && types.ANSWER / total >= 0.5) {
      out.push({
        tone: "warn",
        text: "AI에 답을 바로 묻는 편",
        evidence: `질문 ${total}개 중 답 요청 ${types.ANSWER}개 (${pct(types.ANSWER / total)})`,
        action: "풀이 과정을 먼저 써 보게 하기",
      });
    }

    if ((input.openQuestionCount ?? 0) >= 3) {
      out.push({ tone: "warn", text: "남은 질문이 쌓임", evidence: `돌아보기 남은 질문 ${input.openQuestionCount}개`, action: "질문을 같이 풀어 보기" });
    }

    for (const t of input.topics ?? []) {
      if (t.attempts >= 2 && t.firstRate !== null && t.lastRate !== null && t.lastRate - t.firstRate >= GROWTH - 1e-9) {
        out.push({ tone: "good", text: `${t.name}: 정답률이 올랐음`, evidence: `${pct(t.firstRate)} → ${pct(t.lastRate)}`, action: "오른 점을 짚어 칭찬하기" });
      }
    }

    if (input.hasReflectionWithoutFeedback) {
      out.push({ tone: "info", text: "피드백 기다리는 돌아보기 있음", evidence: "돌아보기에 아직 피드백이 없어요", action: "학습 기록 탭에서 피드백 남기기" });
    }
  } else {
    out.push({ tone: "info", text: "기록 공유 미동의 — 횟수·시간으로만 판단", evidence: "내용·정답률은 볼 수 없어요", action: "" });
  }

  if (out.length === 0) out.push({ tone: "info", text: "특별히 챙길 신호 없음", evidence: "", action: "" });
  return out.sort((a, b) => ORDER[a.tone] - ORDER[b.tone]).slice(0, 4);
}

/** 대시보드 한 줄: 그 학생의 첫 경고 (최근 7일). 기록 공유 미동의면 횟수 규칙만 */
export function dashboardRowWarning(r: DashboardRow, classAvgSessions: number | null): Insight | undefined {
  return studentInsights({
    period: "최근 7일",
    shared: r.shared,
    sessionCount: r.sessionCount,
    classAvgSessions,
    lastSessionAt: r.lastSessionAt,
    quizRate: r.lastQuizRate,
    openQuestionCount: r.openQuestionCount,
  }).find((x) => x.tone === "warn");
}

// 단원·문제 시드 (가짜 데모 데이터)
import type { QuizQuestion, Unit } from "../types/domain";

export const SEED_UNITS: Unit[] = [
  { id: "u-math-1", classId: "c1", subject: "수학", order: 1, title: "이차함수의 그래프", standard: "이차함수의 그래프를 그리고 꼭짓점, 축, 볼록성을 설명할 수 있다." },
  { id: "u-math-2", classId: "c1", subject: "수학", order: 2, title: "일차부등식", standard: "일차부등식을 풀고 그 해를 수직선 위에 나타낼 수 있다." },
  { id: "u-math-3", classId: "c1", subject: "수학", order: 3, title: "경우의 수", standard: "합의 법칙과 곱의 법칙을 이용해 경우의 수를 구할 수 있다." },
  { id: "u-eng-1", classId: "c1", subject: "영어", order: 1, title: "관계대명사", standard: "관계대명사 who, which, that의 쓰임을 구별해 문장을 이해할 수 있다." },
  { id: "u-eng-2", classId: "c1", subject: "영어", order: 2, title: "현재완료", standard: "현재완료 시제의 의미(경험, 계속, 완료, 결과)를 구별할 수 있다." },
  { id: "u-kor-1", classId: "c1", subject: "국어", order: 1, title: "설명문 읽기", standard: "설명문의 설명 방법(정의, 예시, 비교·대조)을 파악할 수 있다." },
  { id: "u-sci-1", classId: "c1", subject: "과학", order: 1, title: "화학 반응과 질량 보존", standard: "화학 반응 전후에 물질의 총질량이 보존됨을 설명할 수 있다." },
  { id: "u-sci-2", classId: "c1", subject: "과학", order: 2, title: "물질의 상태 변화", standard: "" }, // 성취기준 미입력 (AI 초안 불가 데모)
  { id: "u-c2-1", classId: "c2", subject: "수학", order: 1, title: "이차함수의 그래프", standard: "이차함수의 그래프를 그릴 수 있다." },
];

let n = 0;
function q(unitId: string, type: "MCQ" | "OX", prompt: string, choices: string[], answerIndex: number, explanation: string, status: "DRAFT" | "APPROVED" = "APPROVED"): QuizQuestion {
  const unit = SEED_UNITS.find((u) => u.id === unitId)!;
  return { id: `q-seed-${++n}`, unitId, type, prompt, choices, answerIndex, explanation, source: "TEACHER", status, evidence: unit.standard };
}
const OX = ["O", "X"];

export const SEED_QUESTIONS: QuizQuestion[] = [
  // 수학 1: 승인 6개 + 초안 1개 (최대 5개 출제·초안 제외 확인용)
  q("u-math-1", "MCQ", "y = (x-2)² + 3 의 꼭짓점은?", ["(2, 3)", "(-2, 3)", "(2, -3)", "(3, 2)"], 0, "y = a(x-p)² + q 꼴에서 꼭짓점은 (p, q)예요."),
  q("u-math-1", "OX", "y = -x² 의 그래프는 아래로 볼록하다.", OX, 1, "x²의 계수가 음수이면 위로 볼록해요."),
  q("u-math-1", "MCQ", "y = 2(x+1)² - 4 의 축의 방정식은?", ["x = 1", "x = -1", "x = -4", "x = 2"], 1, "축은 꼭짓점의 x좌표를 지나는 직선 x = p 예요."),
  q("u-math-1", "OX", "y = x² 의 그래프를 x축 방향으로 3만큼 평행이동하면 y = (x-3)² 이다.", OX, 0, "x축 방향으로 p만큼 이동하면 x 대신 x-p를 넣어요."),
  q("u-math-1", "MCQ", "y = x² - 4x + 1 을 완전제곱식으로 바꾸면?", ["(x-2)² - 3", "(x+2)² - 3", "(x-4)² + 1", "(x-2)² + 1"], 0, "x² - 4x = (x-2)² - 4 이므로 (x-2)² - 3 이에요."),
  q("u-math-1", "OX", "이차함수 y = ax² 에서 |a|가 클수록 그래프의 폭이 좁아진다.", OX, 0, "|a|가 클수록 y값이 빨리 커져서 폭이 좁아져요."),
  q("u-math-1", "OX", "[초안] 꼭짓점은 항상 원점이다.", OX, 1, "평행이동하면 달라져요.", "DRAFT"),
  // 수학 2
  q("u-math-2", "MCQ", "2x - 3 > 5 의 해는?", ["x > 4", "x < 4", "x > 1", "x > -4"], 0, "2x > 8 이므로 x > 4 예요."),
  q("u-math-2", "OX", "부등식의 양변에 음수를 곱하면 부등호 방향이 바뀐다.", OX, 0, "음수를 곱하거나 나누면 방향이 반대가 돼요."),
  q("u-math-2", "MCQ", "-x ≤ 3 의 해는?", ["x ≤ -3", "x ≥ -3", "x ≥ 3", "x ≤ 3"], 1, "양변에 -1을 곱하면 x ≥ -3 이에요."),
  // 수학 3: 승인 문제 없음 (빈 퀴즈 데모)
  // 영어 1
  q("u-eng-1", "MCQ", "I have a friend ___ lives in Busan.", ["which", "who", "whose", "what"], 1, "선행사가 사람(friend)이고 주격이므로 who예요."),
  q("u-eng-1", "OX", "관계대명사 that은 사람과 사물 모두에 쓸 수 있다.", OX, 0, "that은 사람·사물 모두 가능해요(일부 예외 제외)."),
  q("u-eng-1", "MCQ", "This is the book ___ I bought yesterday.", ["who", "which", "whom", "whose"], 1, "선행사가 사물이고 목적격이므로 which(또는 that)예요."),
  // 영어 2
  q("u-eng-2", "MCQ", "'I have lived here for 3 years.' 의 현재완료 용법은?", ["경험", "계속", "완료", "결과"], 1, "for + 기간 → 지금까지 계속되는 일이에요."),
  q("u-eng-2", "OX", "현재완료는 yesterday 같은 과거 시점 부사와 함께 쓸 수 있다.", OX, 1, "명확한 과거 시점과는 과거 시제를 써요."),
  q("u-eng-2", "MCQ", "'Have you ever been to Jeju?' 의 용법은?", ["경험", "계속", "완료", "결과"], 0, "ever와 함께 '~해 본 적 있니'는 경험이에요."),
  // 국어 1
  q("u-kor-1", "MCQ", "'광합성이란 식물이 빛 에너지로 양분을 만드는 과정이다.'에 쓰인 설명 방법은?", ["예시", "정의", "비교", "대조"], 1, "'~란 ~이다' 형식으로 뜻을 밝히는 것은 정의예요."),
  q("u-kor-1", "OX", "공통점을 들어 설명하는 방법은 대조이다.", OX, 1, "공통점은 비교, 차이점은 대조예요."),
  q("u-kor-1", "MCQ", "구체적인 사례를 들어 설명하는 방법은?", ["정의", "분류", "예시", "분석"], 2, "구체적 사례를 드는 방법은 예시예요."),
  // 과학 1
  q("u-sci-1", "OX", "밀폐된 용기에서 반응이 일어나면 반응 전후 총질량은 같다.", OX, 0, "원자의 종류와 수가 변하지 않아 질량이 보존돼요."),
  q("u-sci-1", "MCQ", "열린 용기에서 나무를 태운 뒤 질량이 줄어든 까닭은?", ["질량이 사라져서", "기체가 빠져나가서", "원자가 없어져서", "온도가 올라서"], 1, "생성된 기체가 빠져나가 측정 질량이 줄어요."),
  q("u-sci-1", "OX", "질량 보존 법칙은 물리 변화에서는 성립하지 않는다.", OX, 1, "물리 변화에서도 질량은 보존돼요."),
  // 다른 반
  q("u-c2-1", "OX", "y = x² 의 꼭짓점은 원점이다.", OX, 0, "평행이동이 없으면 꼭짓점은 (0, 0)이에요."),
];

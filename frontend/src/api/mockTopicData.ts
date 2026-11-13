// mock AI: 키워드 사전으로 주제를 추출하고, 주제별 고정 난이도 문항 풀을 제공한다.
// 실제 서비스에서는 백엔드 LLM 함수가 같은 역할(주제 추출·문항 생성)을 한다. (docs/api-spec.md v0.5)

export type TopicLevel = "CONCEPT" | "APPLY";

export type PoolQuestion = {
  type: "MCQ" | "OX";
  level: TopicLevel;
  prompt: string;
  choices: string[];
  answerIndex: number;
  explanation: string;
};

export type DictionaryTopic = {
  key: string;
  name: string; // 개념 단위 짧은 이름 (반 주제 사전의 표준 이름)
  subject: string;
  keywords: string[];
  pool: PoolQuestion[]; // 개념 확인 3개 이상 + 적용 2개 이상
};

const OX = ["O", "X"];

export const TOPIC_DICTIONARY: DictionaryTopic[] = [
  {
    key: "quadratic-vertex",
    name: "이차함수 꼭짓점",
    subject: "수학",
    keywords: ["꼭짓점", "완전제곱식", "이차함수", "-b/2a", "축의 방정식", "볼록"],
    pool: [
      { type: "MCQ", level: "CONCEPT", prompt: "y = a(x-p)² + q 의 꼭짓점은?", choices: ["(p, q)", "(-p, q)", "(q, p)", "(p, -q)"], answerIndex: 0, explanation: "표준형 a(x-p)²+q 에서 꼭짓점은 (p, q)예요." },
      { type: "OX", level: "CONCEPT", prompt: "x²의 계수가 음수이면 그래프는 위로 볼록하다.", choices: OX, answerIndex: 0, explanation: "a<0 이면 위로 볼록(∩ 모양)이에요." },
      { type: "MCQ", level: "CONCEPT", prompt: "이차함수 그래프의 축은 어느 점을 지나는가?", choices: ["꼭짓점", "y절편", "원점", "x절편"], answerIndex: 0, explanation: "축은 꼭짓점을 지나는 세로선 x = p 예요." },
      { type: "MCQ", level: "APPLY", prompt: "y = x² - 6x + 5 의 꼭짓점은?", choices: ["(3, -4)", "(-3, -4)", "(3, 5)", "(6, 5)"], answerIndex: 0, explanation: "(x-3)² - 4 이므로 꼭짓점은 (3, -4)예요." },
      { type: "MCQ", level: "APPLY", prompt: "y = 2x² + 8x + 1 의 축의 방정식은?", choices: ["x = -2", "x = 2", "x = -4", "x = 4"], answerIndex: 0, explanation: "x = -b/2a = -8/4 = -2 예요." },
      { type: "OX", level: "APPLY", prompt: "y = -(x+1)² + 3 의 최댓값은 3이다.", choices: OX, answerIndex: 0, explanation: "위로 볼록이고 꼭짓점 (-1, 3)에서 최댓값 3이에요." },
    ],
  },
  {
    key: "linear-inequality",
    name: "일차부등식",
    subject: "수학",
    keywords: ["부등식", "부등호", "수직선"],
    pool: [
      { type: "OX", level: "CONCEPT", prompt: "부등식의 양변에 음수를 곱하면 부등호 방향이 바뀐다.", choices: OX, answerIndex: 0, explanation: "음수를 곱하거나 나누면 방향이 반대가 돼요." },
      { type: "OX", level: "CONCEPT", prompt: "부등식의 양변에 같은 수를 더하면 부등호 방향이 바뀐다.", choices: OX, answerIndex: 1, explanation: "더하거나 빼도 방향은 그대로예요." },
      { type: "MCQ", level: "CONCEPT", prompt: "x > 2 를 수직선에 나타낼 때 2에 찍는 점은?", choices: ["빈 점(○)", "채운 점(●)", "점을 찍지 않음", "화살표만"], answerIndex: 0, explanation: "2를 포함하지 않으므로 빈 점이에요." },
      { type: "MCQ", level: "APPLY", prompt: "2x - 3 > 5 의 해는?", choices: ["x > 4", "x < 4", "x > 1", "x > -4"], answerIndex: 0, explanation: "2x > 8 이므로 x > 4 예요." },
      { type: "MCQ", level: "APPLY", prompt: "-3x ≤ 9 의 해는?", choices: ["x ≥ -3", "x ≤ -3", "x ≥ 3", "x ≤ 3"], answerIndex: 0, explanation: "양변을 -3으로 나누면 방향이 바뀌어 x ≥ -3 이에요." },
    ],
  },
  {
    key: "relative-pronoun",
    name: "관계대명사",
    subject: "영어",
    keywords: ["관계대명사", "who", "which", "선행사"],
    pool: [
      { type: "OX", level: "CONCEPT", prompt: "관계대명사 that은 사람과 사물 모두에 쓸 수 있다.", choices: OX, answerIndex: 0, explanation: "that은 사람·사물 모두 가능해요." },
      { type: "MCQ", level: "CONCEPT", prompt: "선행사가 사람이고 주격일 때 쓰는 관계대명사는?", choices: ["who", "which", "whose", "what"], answerIndex: 0, explanation: "사람·주격은 who예요." },
      { type: "OX", level: "CONCEPT", prompt: "관계대명사 what은 선행사를 포함한다.", choices: OX, answerIndex: 0, explanation: "what = the thing which 로 선행사를 포함해요." },
      { type: "MCQ", level: "APPLY", prompt: "This is the book ___ I bought yesterday.", choices: ["which", "who", "whose", "what"], answerIndex: 0, explanation: "사물 선행사, 목적격 → which(또는 that)예요." },
      { type: "MCQ", level: "APPLY", prompt: "I know a girl ___ father is a doctor.", choices: ["whose", "who", "which", "that"], answerIndex: 0, explanation: "소유격(그녀의 아버지) → whose 예요." },
    ],
  },
  {
    key: "mass-conservation",
    name: "질량 보존 법칙",
    subject: "과학",
    keywords: ["질량 보존", "질량", "화학 반응"],
    pool: [
      { type: "OX", level: "CONCEPT", prompt: "밀폐된 용기에서 화학 반응이 일어나면 반응 전후 총질량은 같다.", choices: OX, answerIndex: 0, explanation: "원자의 종류와 수가 변하지 않아 질량이 보존돼요." },
      { type: "MCQ", level: "CONCEPT", prompt: "질량 보존 법칙이 성립하는 까닭은?", choices: ["원자의 종류와 수가 변하지 않아서", "분자 수가 늘어서", "에너지가 생겨서", "부피가 같아서"], answerIndex: 0, explanation: "원자가 재배열될 뿐 사라지거나 생기지 않아요." },
      { type: "OX", level: "CONCEPT", prompt: "질량 보존 법칙은 물리 변화에서는 성립하지 않는다.", choices: OX, answerIndex: 1, explanation: "물리 변화에서도 질량은 보존돼요." },
      { type: "MCQ", level: "APPLY", prompt: "열린 용기에서 나무를 태운 뒤 질량이 줄어든 까닭은?", choices: ["생성된 기체가 빠져나가서", "질량이 사라져서", "원자가 없어져서", "온도가 올라서"], answerIndex: 0, explanation: "기체가 빠져나가 측정 질량이 줄어요." },
      { type: "MCQ", level: "APPLY", prompt: "철 5.6g과 황 3.2g이 모두 반응하면 황화철은 몇 g?", choices: ["8.8g", "2.4g", "5.6g", "9.0g"], answerIndex: 0, explanation: "반응 전 총질량 5.6+3.2 = 8.8g 이 보존돼요." },
    ],
  },
];

/** 텍스트에 사전 키워드가 몇 번 나오는지 */
export function keywordHits(text: string, topic: DictionaryTopic): number {
  const t = text.toLowerCase();
  return topic.keywords.reduce((n, k) => n + (t.includes(k.toLowerCase()) ? 1 : 0), 0);
}

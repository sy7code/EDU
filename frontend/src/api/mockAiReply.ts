import { keywordHits, TOPIC_DICTIONARY, type DictionaryTopic } from "./mockTopicData";

const WANTS_ANSWER = /알려\s*줘|정답|답만|풀어\s*줘|대신|다\s*써|해\s*줘|그냥/;
const FEELS_HARD = /어려워|어렵다|모르겠|헷갈/;
const ASKS = /[?？]|왜|어떻게|뭐|무엇|언제|어디/;

function bigrams(s: string): Set<string> {
  const t = s.replace(/\s+/g, "");
  const out = new Set<string>();
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  return out;
}

/** 질문 글자에서만 주제를 찾는다. 학습 목표로 대신 찾으면 다른 개념을 물었을 때 엉뚱한 설명이 나간다 */
function findTopic(text: string): DictionaryTopic | null {
  let top: DictionaryTopic | null = null;
  let score = 0;
  for (const d of TOPIC_DICTIONARY) {
    const n = keywordHits(text, d);
    if (n > score) [top, score] = [d, n];
  }
  return top;
}

/** 그 주제의 개념 확인 해설 중 질문과 글자가 가장 많이 겹치는 것 (없으면 첫 번째) */
function conceptFor(topic: DictionaryTopic, text: string): string {
  const q = bigrams(text);
  const concepts = topic.pool.filter((p) => p.level === "CONCEPT");
  let pick = concepts[0];
  let score = -1;
  for (const c of concepts) {
    const b = bigrams(`${c.prompt} ${c.explanation}`);
    const n = [...q].filter((x) => b.has(x)).length;
    if (n > score) [pick, score] = [c, n];
  }
  return pick.explanation;
}

/**
 * mock AI 도우미 답변 (서버를 거치지 않음). 실제 서버 프롬프트(v0.7 이후)와 같은 방향:
 * 개념은 바로 설명, 과제·문제의 최종 답만 보류, 되묻는 질문은 최대 1개, 해요체, 마크다운 없음.
 */
export function mockAiReply(text: string): string {
  const topic = findTopic(text);
  const concept = topic ? conceptFor(topic, text) : null;

  if (FEELS_HARD.test(text)) {
    return concept
      ? `어렵게 느껴질 수 있어요. ${concept} 이 내용부터 천천히 확인하고, 막히는 단계를 알려 주세요.`
      : "어렵게 느껴질 수 있어요. 지금 공부하는 개념 이름이나 막힌 문제를 보내 주면 바로 설명할게요.";
  }
  if (WANTS_ANSWER.test(text)) {
    return concept
      ? `${concept} 이 개념으로 문제를 직접 한 단계씩 풀어 보세요. 마지막 계산 결과를 알려 주면 맞는지 같이 확인할게요.`
      : "풀이에 필요한 개념은 바로 설명해 줄 수 있어요. 어떤 문제인지 보내 주면 필요한 개념부터 짚어 줄게요.";
  }
  if (concept) return ASKS.test(text) ? `${concept} 이 설명에서 더 궁금한 부분이 있나요?` : `${concept} 기록한 내용을 이 설명과 비교해 보면 정리에 도움이 돼요.`;
  if (ASKS.test(text)) return "지금 공부하는 개념 이름이나 문제를 함께 보내 주면 바로 설명할게요.";
  return "기록한 내용을 내 말로 한 문장으로 정리해 두면 나중에 돌아볼 때 도움이 돼요.";
}

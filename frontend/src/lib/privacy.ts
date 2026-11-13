// 개인정보 보호용 순수 함수. 서버에서도 같은 규칙을 적용해야 한다 (docs/api-spec.md 6.4).
// 원칙: 놓치는 것보다 과하게 가리는 쪽을 택한다.

/** "김민수" → "김*수", "이준" → "이*", 외자/빈값 처리 */
export function maskName(name: string): string {
  const chars = Array.from(name.trim());
  if (chars.length === 0) return "";
  if (chars.length === 1) return "*";
  if (chars.length === 2) return `${chars[0]}*`;
  return `${chars[0]}${"*".repeat(chars.length - 2)}${chars[chars.length - 1]}`;
}

// 숫자 앞뒤가 다른 숫자에 붙어 있지 않을 때만 (날짜·수식 일부를 잘못 잡지 않게)
const NB = "(?<!\\d)";
const NA = "(?!\\d)";
const SEP = "[\\s.\\-]?";

const PATTERNS: Array<[RegExp, string]> = [
  // 주민등록번호: 하이픈·공백 유무 모두
  [new RegExp(`${NB}\\d{6}[\\s\\-]?[1-4]\\d{6}${NA}`, "g"), "[주민번호]"],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[이메일]"],
  // 휴대전화: 010, +82 10, 구분자 . - 공백
  [new RegExp(`(?:\\+82${SEP}|${NB}0)1[016789]${SEP}\\d{3,4}${SEP}\\d{4}${NA}`, "g"), "[연락처]"],
  // 유선: 02, 031 등 지역번호 (구분자 필수로 날짜 등과 구분)
  [new RegExp(`${NB}0\\d{1,2}[\\s.\\-]\\d{3,4}[\\s.\\-]\\d{4}${NA}`, "g"), "[연락처]"],
  // 그 밖의 8자리 이상 숫자열 (계좌·학번 등)
  [new RegExp(`${NB}\\d{8,}${NA}`, "g"), "[숫자]"],
];

/** 이름 목록에서 치환할 토큰을 만든다: 전체 이름 + 성을 뺀 이름(2자 이상) */
export function nameTokens(names: string[]): string[] {
  const set = new Set<string>();
  for (const raw of names) {
    const n = raw.trim();
    if (Array.from(n).length >= 2) set.add(n);
    const given = Array.from(n).slice(1).join("");
    if (Array.from(given).length >= 2) set.add(given);
  }
  return [...set].sort((a, b) => b.length - a.length); // 긴 것부터 치환
}

/** AI로 보내기 전·저장 전 학생 입력에서 개인정보로 보이는 부분을 치환한다. */
export function maskPii(text: string, knownNames: string[] = []): string {
  let out = text;
  for (const [re, label] of PATTERNS) out = out.replace(re, label);
  for (const n of nameTokens(knownNames)) out = out.split(n).join("[이름]");
  return out;
}

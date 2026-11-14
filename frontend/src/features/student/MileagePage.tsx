import { Link } from "react-router";
import { Icon } from "../../components/Icon";
import { Badge, Card } from "../../components/ui";

/** 데모 전용: 로직 없는 정적 화면. 학교 성장 마일리지 제도 연동 방향을 보여 준다 */
const RECENT: Array<[string, string, number]> = [
  ["학습 마치기", "오늘", 10],
  ["돌아보기 작성", "오늘", 5],
  ["선생님 피드백 확인", "어제", 2],
  ["확인 테스트 응시", "어제", 3],
  ["남은 질문 해결", "2일 전", 5],
];

const RULES: Array<[string, number]> = [
  ["학습 마치기", 10],
  ["돌아보기 작성", 5],
  ["남은 질문 해결", 5],
  ["확인 테스트 응시", 3],
  ["선생님 피드백 확인", 2],
];

const USES: Array<[string, string]> = [
  ["학교 성장 마일리지 제도와 연동 예정", "쌓은 점수를 학교 제도에 반영하는 방법을 학교와 정할 예정이에요."],
  ["우수 학습자 추천", "꾸준히 쌓은 학생을 선생님이 추천할 때 참고할 수 있어요."],
  ["자기주도학습 인증서", "학기 말에 내 학습 노력을 정리한 인증서로 만들어 줄 수 있어요."],
];

export function MileagePage() {
  return (
    <div className="mile-page">
      <Link to="/student" className="mile-back">
        <Icon name="home" size={16} /> 홈으로
      </Link>
      <div className="page-heading">
        <div>
          <p className="eyebrow">성장 마일리지</p>
          <h1>꾸준히 공부한 만큼 쌓여요</h1>
        </div>
      </div>

      <p className="mile-notice" role="note">
        <Icon name="alert" size={18} />
        <span>예시 화면이에요 · 적립 규칙과 학교 성장 마일리지 제도 연동은 준비 중이에요</span>
      </p>

      <Card className="mile-total">
        <small>내 성장 마일리지</small>
        <strong>
          245<span>점</span>
        </strong>
        <Badge tone="brand">이번 주 +35</Badge>
      </Card>

      <div className="mile-grid">
        <Card>
          <h2>최근 적립</h2>
          <ul className="mile-list">
            {RECENT.map(([name, when, pt]) => (
              <li key={name}>
                <span>
                  <strong>{name}</strong>
                  <small>{when}</small>
                </span>
                <em>+{pt}</em>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2>이렇게 쌓여요</h2>
          <p className="mile-sub">예시예요. 실제 규칙은 학교와 정해요.</p>
          <ul className="mile-list">
            {RULES.map(([name, pt]) => (
              <li key={name}>
                <span>
                  <strong>{name}</strong>
                </span>
                <em>+{pt}</em>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <section>
        <div className="section-title">
          <h2>쓸 수 있는 곳</h2>
        </div>
        <div className="mile-uses">
          {USES.map(([title, desc]) => (
            <Card key={title} className="mile-use">
              <Badge tone="amber">준비 중</Badge>
              <strong>{title}</strong>
              <p>{desc}</p>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

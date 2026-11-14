-- 성장 페이스 시드 (전부 가명 데모 데이터)
-- 먼저 Supabase Auth에 데모 계정 2개를 만들어 두면 users와 연결된다:
--   teacher@growth-pace.test, student01@growth-pace.test
-- 다시 실행하면 기존 데모 데이터를 지우고 새로 만든다.
-- AI 질문 유형(question_type)은 비워 두고, 시드 후 실제 분류기로 채운다 (scripts/backfill 참고).

create temp table keep_device_tokens on commit drop as select id, token_hash from devices;  -- 발급한 기기 토큰 유지
truncate classes, users, devices cascade;
alter table entries disable trigger entries_active;   -- 과거(ENDED) 세션에 기록을 넣기 위해 시드 동안만 끔

do $$
declare
  -- 목표 = 주제 1:1. 목표마다 메모·질문·AI 질문·확인 테스트 5문항(개념 3 + 적용 2, 정답은 choices[0], 출제 시 섞음)
  catalog jsonb := $json$[
  {"goal":"이차함수 꼭짓점 구하는 법 이해하기","topic":"이차함수 꼭짓점","subject":"수학",
   "memos":["완전제곱식으로 바꾸면 꼭짓점이 바로 보인다","예제 2번은 부호를 헷갈려서 틀림","a의 부호로 위로 볼록·아래로 볼록을 먼저 확인"],
   "questions":["꼭짓점 공식은 왜 -b/2a 인가?","판별식과 꼭짓점은 어떤 관계가 있지?"],
   "ai":["꼭짓점 x좌표가 왜 -b/2a인지 설명해줘","y=x^2-4x+1 꼭짓점 (2,-3) 맞아?","그냥 꼭짓점 구하는 답 알려줘","오늘 공부 몇 분 했는지 알려줄래?"],
   "quiz":[
    {"type":"OX","level":"CONCEPT","prompt":"y=a(x-p)^2+q 의 꼭짓점 좌표는 (p, q)이다.","choices":["O","X"],"answer":0,"exp":"표준형에서 x=p일 때 제곱 항이 0이 되어 y=q가 된다."},
    {"type":"MCQ","level":"CONCEPT","prompt":"y=ax^2+bx+c 의 꼭짓점 x좌표는?","choices":["-b/2a","b/2a","-c/a","b/a"],"answer":0,"exp":"완전제곱식으로 바꾸면 x=-b/2a에서 꼭짓점을 가진다."},
    {"type":"OX","level":"CONCEPT","prompt":"a<0 이면 이차함수는 꼭짓점에서 최솟값을 가진다.","choices":["O","X"],"answer":1,"exp":"a<0이면 위로 볼록이라 꼭짓점에서 최댓값을 가진다."},
    {"type":"MCQ","level":"APPLY","prompt":"y=x^2-4x+1 의 꼭짓점 좌표는?","choices":["(2, -3)","(-2, 13)","(2, 1)","(4, 1)"],"answer":0,"exp":"x=-(-4)/2=2, y=4-8+1=-3."},
    {"type":"MCQ","level":"APPLY","prompt":"y=-2(x+1)^2+5 의 최댓값은?","choices":["5","-1","1","-5"],"answer":0,"exp":"a=-2<0이고 꼭짓점 (-1, 5)에서 최댓값 5."}]},
  {"goal":"영어 지문에서 주제문 찾기 연습","topic":"영어 주제문 찾기","subject":"영어",
   "memos":["첫 문장과 마지막 문장을 먼저 읽는 게 효과 있음","However 뒤 문장에 밑줄 치기","반복되는 단어를 세 번 이상 나오면 표시"],
   "questions":["주제문이 중간에 있으면 어떻게 찾지?","예시 문장과 주제문은 어떻게 구분하지?"],
   "ai":["주제문은 왜 However 뒤에 자주 나와?","이 지문 주제문 두 번째 문장 맞아?","3번 지문 정답 몇 번이야?","영어 공부 순서 추천해줄래?"],
   "quiz":[
    {"type":"OX","level":"CONCEPT","prompt":"주제문은 항상 지문의 첫 문장에 있다.","choices":["O","X"],"answer":1,"exp":"주제문은 처음·중간·끝 어디에나 올 수 있다."},
    {"type":"MCQ","level":"CONCEPT","prompt":"주제문을 찾을 때 가장 먼저 확인할 단서는?","choices":["반복되는 핵심어","고유명사","숫자","감탄문"],"answer":0,"exp":"글 전체에서 반복되는 핵심어가 주제를 가리킨다."},
    {"type":"OX","level":"CONCEPT","prompt":"However 뒤에는 글쓴이의 주장이 오는 경우가 많다.","choices":["O","X"],"answer":0,"exp":"역접 연결어 뒤에서 통념을 뒤집고 주장을 펴는 경우가 많다."},
    {"type":"MCQ","level":"APPLY","prompt":"'For example'로 시작하는 문장은 대개 어떤 역할을 하는가?","choices":["주장을 뒷받침하는 예시","글의 결론","새 주제 제시","반론"],"answer":0,"exp":"예시는 앞의 주장을 뒷받침한다."},
    {"type":"MCQ","level":"APPLY","prompt":"첫 문장이 통념이고 둘째 문장이 'But'으로 시작하면 주제문은?","choices":["But으로 시작하는 문장 쪽","첫 문장","마지막 예시","제목"],"answer":0,"exp":"통념-반박 구조에서는 반박하는 문장이 주제문이다."}]},
  {"goal":"비문학 지문 구조 파악하기","topic":"비문학 지문 구조","subject":"국어",
   "memos":["문단마다 핵심어에 동그라미 치면서 읽음","접속어(따라서, 그러나)에 표시","문단 요약을 한 줄씩 적어봄"],
   "questions":["비교와 대조 구조는 어떻게 알아보지?","문단 중심 문장이 없으면 어떻게 하지?"],
   "ai":["비교와 대조는 뭐가 다른 거야?","내가 쓴 문단 요약 이거 맞아?","이 지문 구조 정답만 말해줘","국어 지문 하루에 몇 개 읽는 게 좋아?"],
   "quiz":[
    {"type":"OX","level":"CONCEPT","prompt":"문단의 중심 문장은 그 문단의 내용을 대표한다.","choices":["O","X"],"answer":0,"exp":"중심 문장은 문단의 핵심 내용을 담는다."},
    {"type":"MCQ","level":"CONCEPT","prompt":"두 대상의 공통점과 차이점을 밝히는 전개 방식은?","choices":["비교와 대조","분류","인과","정의"],"answer":0,"exp":"공통점은 비교, 차이점은 대조다."},
    {"type":"OX","level":"CONCEPT","prompt":"'따라서'는 앞 내용과 반대되는 내용을 이을 때 쓴다.","choices":["O","X"],"answer":1,"exp":"'따라서'는 앞 내용의 결과·결론을 이을 때 쓴다."},
    {"type":"MCQ","level":"APPLY","prompt":"'원인-결과' 구조의 지문에서 먼저 찾아야 할 것은?","choices":["현상이 일어난 이유","글쓴이 이름","예시의 개수","제목의 길이"],"answer":0,"exp":"인과 구조는 원인과 그 결과의 연결을 파악해야 한다."},
    {"type":"MCQ","level":"APPLY","prompt":"문단마다 핵심어를 표시하는 주된 목적은?","choices":["글 전체 흐름 파악","맞춤법 확인","글자 수 세기","어휘 암기"],"answer":0,"exp":"핵심어를 이으면 글 전체 흐름이 보인다."}]},
  {"goal":"조건부확률 개념 정리","topic":"조건부확률","subject":"수학",
   "memos":["분모가 바뀌는 이유를 그림으로 그려봄","표본공간이 B로 줄어든다고 생각하니 이해됨","벤 다이어그램으로 A∩B 표시"],
   "questions":["독립사건과 배반사건은 뭐가 다르지?","P(A|B)와 P(B|A)는 왜 다르지?"],
   "ai":["조건부확률에서 분모가 왜 P(B)야?","P(A|B)=0.4 로 구했는데 맞아?","이 문제 답 그냥 알려줘","확률 단원 끝나면 뭐 배워?"],
   "quiz":[
    {"type":"MCQ","level":"CONCEPT","prompt":"P(A|B)의 정의는?","choices":["P(A∩B)/P(B)","P(A∩B)/P(A)","P(A)P(B)","P(A)+P(B)"],"answer":0,"exp":"B가 일어났을 때 A의 확률이므로 B를 표본공간으로 본다."},
    {"type":"OX","level":"CONCEPT","prompt":"A, B가 독립이면 P(A|B)=P(A)이다.","choices":["O","X"],"answer":0,"exp":"독립이면 B가 일어나도 A의 확률이 변하지 않는다."},
    {"type":"OX","level":"CONCEPT","prompt":"배반사건이면 항상 독립사건이다.","choices":["O","X"],"answer":1,"exp":"확률이 0이 아닌 배반사건은 한쪽이 일어나면 다른 쪽이 불가능해 독립이 아니다."},
    {"type":"MCQ","level":"APPLY","prompt":"P(B)=0.5, P(A∩B)=0.2 일 때 P(A|B)는?","choices":["0.4","0.1","0.7","0.25"],"answer":0,"exp":"0.2/0.5=0.4."},
    {"type":"MCQ","level":"APPLY","prompt":"주사위를 던져 짝수가 나왔을 때 그 수가 4 이상일 확률은?","choices":["2/3","1/2","1/3","1/6"],"answer":0,"exp":"짝수 {2,4,6} 중 4 이상은 {4,6}이므로 2/3."}]},
  {"goal":"몰 개념과 화학식량 복습","topic":"몰과 화학식량","subject":"화학",
   "memos":["단위 환산을 표로 정리함","질량 ÷ 화학식량 = 몰 수 공식 정리","원자량 표를 외우지 말고 옆에 두고 풀기"],
   "questions":["아보가드로수는 왜 그 값이지?","몰 질량과 화학식량은 뭐가 다르지?"],
   "ai":["몰이라는 단위를 왜 쓰는 거야?","CO2 44g이 1몰 맞지?","몰 계산 문제 답만 줘","화학 실험은 언제 해?"],
   "quiz":[
    {"type":"OX","level":"CONCEPT","prompt":"1몰에는 약 6.02×10^23개의 입자가 있다.","choices":["O","X"],"answer":0,"exp":"이 수가 아보가드로수다."},
    {"type":"MCQ","level":"CONCEPT","prompt":"물(H2O)의 화학식량은? (H=1, O=16)","choices":["18","17","16","34"],"answer":0,"exp":"1×2+16=18."},
    {"type":"OX","level":"CONCEPT","prompt":"같은 온도·압력에서 같은 몰수의 기체는 부피가 같다.","choices":["O","X"],"answer":0,"exp":"아보가드로 법칙이다."},
    {"type":"MCQ","level":"APPLY","prompt":"CO2 44g은 몇 몰인가? (C=12, O=16)","choices":["1몰","2몰","0.5몰","44몰"],"answer":0,"exp":"CO2 화학식량 44이므로 44/44=1몰."},
    {"type":"MCQ","level":"APPLY","prompt":"물 36g은 몇 몰인가?","choices":["2몰","1몰","3몰","0.5몰"],"answer":0,"exp":"36/18=2몰."}]},
  {"goal":"근현대사 흐름 연표로 정리","topic":"일제 강점기 통치 방식","subject":"한국사",
   "memos":["1910·1920·1930년대 통치 방식을 표로 정리","3·1 운동을 기준으로 앞뒤를 나눠서 외움","사건 옆에 연도를 꼭 같이 적기"],
   "questions":["1910년대와 1920년대 통치 방식 차이는?","문화 통치는 정말 완화된 걸까?"],
   "ai":["문화 통치로 바뀐 이유가 뭐야?","3·1 운동이 1919년 맞지?","연표 순서 정답 알려줘","한국사 시험 범위가 어디까지야?"],
   "quiz":[
    {"type":"OX","level":"CONCEPT","prompt":"3·1 운동 이후 일제는 이른바 '문화 통치'로 방식을 바꾸었다.","choices":["O","X"],"answer":0,"exp":"3·1 운동 이후 통치 방식을 바꾸었지만 감시는 오히려 강화되었다."},
    {"type":"MCQ","level":"CONCEPT","prompt":"1910년대 일제의 통치 방식은?","choices":["무단 통치","문화 통치","민족 말살 통치","신탁 통치"],"answer":0,"exp":"헌병 경찰을 앞세운 무단 통치였다."},
    {"type":"OX","level":"CONCEPT","prompt":"대한민국 임시 정부는 1919년 상하이에서 수립되었다.","choices":["O","X"],"answer":0,"exp":"1919년 4월 상하이에서 수립되었다."},
    {"type":"MCQ","level":"APPLY","prompt":"다음 중 1930년대 이후 민족 말살 통치 정책은?","choices":["창씨개명 강요","토지 조사 사업","회사령 제정","헌병 경찰제"],"answer":0,"exp":"나머지는 1910년대 정책이다."},
    {"type":"MCQ","level":"APPLY","prompt":"사건을 시간 순으로 바르게 나열한 것은?","choices":["3·1 운동 → 임시 정부 수립 → 6·10 만세 운동","6·10 만세 운동 → 3·1 운동 → 임시 정부 수립","임시 정부 수립 → 3·1 운동 → 6·10 만세 운동","3·1 운동 → 6·10 만세 운동 → 임시 정부 수립"],"answer":0,"exp":"1919년 3월 → 1919년 4월 → 1926년."}]}
  ]$json$;
  changes text[] := array[
    '공식을 외우기만 했는데 원리를 알게 됨', '틀린 이유가 개념이 아니라 계산 실수라는 걸 알게 됨',
    '핵심어를 먼저 찾으니 읽는 속도가 빨라짐', '그림으로 그려 보니 헷갈리던 게 정리됨'];
  checklist text[] := array['모르는 것을 질문했다', '예제를 직접 풀어 봤다', '틀린 이유를 적었다', '배운 것을 내 말로 정리했다'];
  cls uuid := gen_random_uuid();
  teacher uuid := coalesce((select id from auth.users where email = 'teacher@growth-pace.test'), gen_random_uuid());
  topic_ids uuid[] := '{}';
  stu uuid; sid uuid; tid uuid; eid uuid; started timestamptz;
  item jsonb; q jsonb; served jsonb; items jsonb;
  ability numeric; und int; correct_n int; chosen int; rot int; n_choices int;
  i int; n int; k int; g int; j int;
begin
  perform setseed(0.42);

  insert into classes (id, name) values (cls, '2학년 3반');
  insert into users (id, name, role, class_id) values (teacher, '김교사', 'teacher', cls);
  insert into devices (id, class_id) values ('kiosk-study-room-1', cls);

  -- 반 주제 사전 + 문항 풀
  for g in 0..jsonb_array_length(catalog) - 1 loop
    item := catalog -> g;
    insert into topics (class_id, name, subject) values (cls, item ->> 'topic', item ->> 'subject') returning id into tid;
    topic_ids := topic_ids || tid;
    for j in 0..jsonb_array_length(item -> 'quiz') - 1 loop
      q := item -> 'quiz' -> j;
      insert into topic_questions (topic_id, type, level, prompt, choices, answer_index, explanation)
        values (tid, q ->> 'type', q ->> 'level', q ->> 'prompt',
                array(select jsonb_array_elements_text(q -> 'choices')), (q ->> 'answer')::int, q ->> 'exp');
    end loop;
  end loop;

  for i in 1..30 loop
    stu := case when i = 1
                then coalesce((select id from auth.users where email = 'student01@growth-pace.test'), gen_random_uuid())
                else gen_random_uuid() end;
    insert into users (id, name, role, class_id, number, facepass_key)
      values (stu, '학생' || lpad(i::text, 2, '0'), 'student', cls, i,
              case when i = 1 then 'TEST-STUDENT01' end);   -- 임시: 실제 FacePass 키 매핑은 2일차 확인 후 교체
    if i = 3 then                                           -- 데모: 학생03은 기록 공유 미동의 → 교사 화면에서 가려짐
      insert into consents (student_id, kind, granted, policy_version) values (stu, 'LEARNING_RECORD', false, 'v1');
    end if;

    -- 학생별 실력(정답 확률). 학생09는 "이해했다는데 점수 낮음"(OVERCONFIDENT) 데모
    ability := case when i = 9 then 0.15 else 0.35 + random() * 0.6 end;

    n := case when i in (1, 3, 9) then 3 else floor(random() * 7)::int end;   -- 세션 0~6개 (데모용 학생01·03·09는 3개)
    for k in 1..n loop
      g := floor(random() * jsonb_array_length(catalog))::int;
      item := catalog -> g;
      tid := topic_ids[g + 1];
      started := now() - (random() * interval '14 days');
      insert into sessions (student_id, goal, subject, started_at, ended_at, start_auth, end_auth, status)
        values (stu, item ->> 'goal',
                case item ->> 'subject' when '화학' then '과학' when '한국사' then '사회' else item ->> 'subject' end, started, started + (20 + floor(random() * 70)::int) * interval '1 minute',
                case when random() < 0.85 then 'FACEPASS' else 'QR' end, 'FACEPASS', 'ENDED')
        returning id into sid;

      -- 기록 3~6개: 첫 기록은 항상 교사 공개(주제 근거), 이후 15%는 나만 보기
      for j in 1..(3 + floor(random() * 4)::int) loop
        insert into entries (session_id, kind, content, visibility, created_at)
          values (sid,
                  case when j % 2 = 1 then 'MEMO' when random() < 0.8 then 'QUESTION' else 'QUIZ' end,
                  case when j % 2 = 1 then item -> 'memos' ->> floor(random() * jsonb_array_length(item -> 'memos'))::int
                       else item -> 'questions' ->> floor(random() * jsonb_array_length(item -> 'questions'))::int end,
                  case when j = 1 or random() < 0.85 then 'TEACHER' else 'PRIVATE' end,
                  started + j * interval '5 minutes')
          returning id into eid;
        if j = 1 then
          insert into session_topics (session_id, topic_id, evidence_ids) values (sid, tid, array[eid::text]);
        end if;
      end loop;

      -- AI 질문 1~2개 (개념·확인·답 요청·기타가 섞이도록)
      for j in 1..(1 + floor(random() * 2)::int) loop
        insert into ai_messages (session_id, role, content, created_at) values
          (sid, 'student', item -> 'ai' ->> floor(random() * 4)::int, started + (10 + j * 3) * interval '1 minute'),
          (sid, 'ai', '좋은 질문이야. 지금 알고 있는 것부터 하나씩 적어볼래? 어디서 막혔는지 같이 찾아보자.',
           started + (10 + j * 3) * interval '1 minute' + interval '5 seconds');
      end loop;

      -- 확인 테스트 (세션의 65%): 출제 스냅샷(선택지 회전 + 정답 보정) + 응시 채점
      correct_n := 0;
      if random() < 0.65 then
        served := '[]'; items := '[]';
        for q in select jsonb_build_object('id', tq.id, 'type', tq.type, 'prompt', tq.prompt, 'choices', to_jsonb(tq.choices),
                                           'answerIndex', tq.answer_index, 'explanation', tq.explanation)
                 from topic_questions tq where tq.topic_id = tid order by tq.level desc, tq.created_at loop
          n_choices := jsonb_array_length(q -> 'choices');
          rot := case when q ->> 'type' = 'MCQ' then floor(random() * n_choices)::int else 0 end;
          q := jsonb_set(q, '{choices}', (select jsonb_agg(q -> 'choices' -> ((x + rot) % n_choices)) from generate_series(0, n_choices - 1) x));
          q := jsonb_set(q, '{answerIndex}', to_jsonb(((q ->> 'answerIndex')::int - rot + n_choices) % n_choices));
          chosen := case when random() < ability then (q ->> 'answerIndex')::int
                         else ((q ->> 'answerIndex')::int + 1 + floor(random() * (n_choices - 1))::int) % n_choices end;
          if chosen = (q ->> 'answerIndex')::int then correct_n := correct_n + 1; end if;
          served := served || jsonb_build_array(q);
          items := items || jsonb_build_array(jsonb_build_object(
            'questionId', q -> 'id', 'prompt', q -> 'prompt', 'choices', q -> 'choices', 'chosen', chosen,
            'answerIndex', q -> 'answerIndex', 'correct', chosen = (q ->> 'answerIndex')::int,
            'explanation', q -> 'explanation', 'reported', false, 'excluded', false));
        end loop;
        insert into quiz_serves (session_id, topic_id, questions, created_at) values (sid, tid, served, least(now(), started + interval '95 minutes'));
        insert into quiz_attempts (session_id, topic_id, student_id, correct, total, items, created_at)
          values (sid, tid, stu, correct_n, jsonb_array_length(items), items, least(now(), started + interval '100 minutes'));
      end if;

      if random() < 0.8 or i = 9 then                       -- 성찰 대부분 작성 (체크리스트·이해도)
        und := case when i = 9 then 3 else least(3, greatest(1, round(ability * 3 + random() - 0.5)::int)) end;
        insert into reflections (session_id, changed, checks, understanding, remaining_questions)
          values (sid, changes[1 + floor(random() * 4)::int],
                  (select coalesce(array_agg(c), '{}') from unnest(checklist) c where random() < 0.6),
                  und,
                  (select coalesce(array_agg(x), '{}') from
                    (select item -> 'questions' ->> floor(random() * jsonb_array_length(item -> 'questions'))::int as x
                     from generate_series(1, floor(random() * 3)::int)) t));
        if random() < 0.45 then
          insert into feedback (session_id, teacher_id, content, created_at, read_at)
            values (sid, teacher,
                    (array['남은 질문 좋아요. 다음 시간에 같이 봐요.', '그림으로 정리한 방법이 좋아요. 다른 문제에도 써 봐요.',
                           '틀린 이유를 적은 게 큰 도움이 돼요.', '이해도를 높게 적었는데 테스트를 한 번 더 확인해 봐요.'])[1 + floor(random() * 4)::int],
                    least(now(), started + interval '1 day'),
                    case when random() < 0.6 then least(now(), started + interval '2 days') end);   -- 60%는 읽음
        end if;
      end if;
    end loop;
  end loop;
end $$;

alter table entries enable trigger entries_active;
update devices d set token_hash = k.token_hash from keep_device_tokens k where k.id = d.id;

-- 교과 교사 데모 (v0.9·v1.1): 담임 아님(class_id 없음), 2학년 3반 수학 현재 학기 배정
-- 학생 10명은 기록 공유·교과 공유·AI 동의 → 질문 핵심 요약 데모. 학생03(미동의 데모)은 제외
do $$
declare
  cls uuid := (select id from classes where name = '2학년 3반');
  sub uuid := coalesce((select id from auth.users where email = 'subject@growth-pace.test'), gen_random_uuid());
begin
  insert into users (id, name, role, class_id) values (sub, '이교과', 'teacher', null);
  insert into teacher_assignments (teacher_id, class_id, subject, term) values (sub, cls, '수학', current_term());
  -- 김교사(담임)도 자기 반 수학 배정 → 담임 계정으로 질문 핵심 데모
  insert into teacher_assignments (teacher_id, class_id, subject, term)
    select id, cls, '수학', current_term() from users where class_id = cls and role = 'teacher';
  insert into consents (student_id, kind, granted, policy_version)
    select u.id, k, true, 'v1' from users u, unnest(array['LEARNING_RECORD','SUBJECT_SHARE','AI']) k
    where u.class_id = cls and u.role = 'student' and u.number in (1, 2, 7, 10, 12, 13, 14, 17, 20, 25);
end $$;

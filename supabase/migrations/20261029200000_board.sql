-- 게시판 board_posts (화면 20) — harness/d7-data.md §30 (2026-10-29), design/rules.json 1.32 board · auth.board_exception
--
-- 1) 테이블 board_posts: category ∈ {faq, bug, idea}, title 1~100자, body 1~5000자, author_id(auth.users) ·
--    author_school_id(schools) — FAQ 는 둘 다 null, 오류 문의·개선 제안은 둘 다 필수. answer · answered_at(같이 있거나 같이 없음),
--    hidden_at, created_at · updated_at(트리거). 상태('접수'·'답변 완료')는 저장하지 않는다 — answer 유무로 판단.
-- 2) RLS (N1 예외 — 게시판 글만 학교를 넘어 보인다):
--    select = 프로필이 있는 로그인 사용자(학생 포함; 데모 학교는 프로필을 가질 수 없음) · hidden_at is null 인 모든 학교 글.
--             anon 은 테이블 권한 자체가 없다(0행).
--    insert = 교사·admin · category ∈ {bug, idea} · author_id = auth.uid() · author_school_id = 자기 학교(데모 아님) ·
--             answer · answered_at · hidden_at = null. 열 단위 insert 권한도 그 5개 열만.
--    update = 글쓴이 본인 · answer is null · 숨기지 않은 글 · category ∈ {bug, idea}. 열 단위 update 권한 = title · body · category 만,
--             + 가드 트리거(로그인·anon 역할이면 answer · answered_at · hidden_at · author_* · created_at 변경과 faq 를 막음).
--    delete = 글쓴이 본인(답변이 달린 뒤에도 가능).
--    → RLS 경로로는 누구도 answer · hidden_at · category 'faq' 를 쓰지 못한다. 운영자 쓰기는 서버(service role)만.
-- 3) 읽기 함수 (글쓴이 표시 = 학교명만 — 이름·이메일·역할·author_id 는 돌려주지 않는다. profiles·schools RLS 는 그대로):
--    board_posts_list(category, limit, offset) · board_post(id) · board_my_answered_count()
--    public = security invoker(board_posts RLS 적용, anon 실행 불가) → 학교명만 private.board_post_school_name(definer)으로.
-- 4) FAQ seed 16개: public/guide/index.html '자주 묻는 질문' 14개(문구 그대로) + rules board.faq_examples 2개.
--    순서 = created_at 오름차순(가이드 순서 → 뒤에 2개). 같은 제목의 FAQ 가 있으면 넣지 않는다(not exists) — 다시 실행해도 중복 없음.
--
-- 이 파일의 구문: create table if not exists · 제약 · 인덱스 · 함수 · 트리거 · 정책 · 권한 · insert … where not exists.
-- drop table · delete · truncate 없음. 기존 테이블·행은 건드리지 않는다.

-- ---------- 1. 테이블 ----------
create table if not exists public.board_posts (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  title text not null,
  body text not null,
  author_id uuid references auth.users (id) on delete cascade,
  author_school_id uuid references public.schools (id),
  answer text,
  answered_at timestamptz,
  hidden_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint board_posts_category_check check (category in ('faq', 'bug', 'idea')),
  constraint board_posts_title_len check (char_length(title) between 1 and 100 and char_length(btrim(title)) >= 1),
  constraint board_posts_body_len check (char_length(body) between 1 and 5000 and char_length(btrim(body)) >= 1),
  constraint board_posts_answer_len check (answer is null or (char_length(answer) between 1 and 5000 and char_length(btrim(answer)) >= 1)),
  constraint board_posts_answer_pair check ((answer is null) = (answered_at is null)),
  -- FAQ = 운영자 글(글쓴이·학교 없음, 답변 없음) / 오류 문의·개선 제안 = 글쓴이·학교 필수
  constraint board_posts_author_by_category check (
    (category = 'faq' and author_id is null and author_school_id is null and answer is null)
    or (category in ('bug', 'idea') and author_id is not null and author_school_id is not null)
  ),
  constraint board_posts_not_demo_school check (author_school_id is null or author_school_id <> private.demo_school_id())
);

create index if not exists board_posts_list_idx
  on public.board_posts (category, created_at desc, id desc) where hidden_at is null;
create index if not exists board_posts_author_id_idx on public.board_posts (author_id);
create index if not exists board_posts_author_school_id_idx on public.board_posts (author_school_id);

-- ---------- 2. updated_at · 가드 트리거 ----------
create or replace function private.board_posts_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- 로그인 사용자 경로(RLS)에서는 답변·숨김·글쓴이·작성 시각·FAQ 를 바꿀 수 없다 (열 권한과 같은 규칙을 한 번 더).
  -- 운영자 쓰기(service role)·마이그레이션(postgres)은 통과.
  if current_user in ('authenticated', 'anon') then
    if new.answer is distinct from old.answer
       or new.answered_at is distinct from old.answered_at
       or new.hidden_at is distinct from old.hidden_at
       or new.author_id is distinct from old.author_id
       or new.author_school_id is distinct from old.author_school_id
       or new.created_at is distinct from old.created_at
       or new.category not in ('bug', 'idea') then
      raise exception 'board post field not editable' using errcode = '42501';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.board_posts_before_update() from public, anon, authenticated;

drop trigger if exists board_posts_before_update on public.board_posts;
create trigger board_posts_before_update
  before update on public.board_posts
  for each row execute function private.board_posts_before_update();

-- ---------- 3. 권한 · RLS ----------
alter table public.board_posts enable row level security;

revoke all on table public.board_posts from public, anon, authenticated;
grant select, delete on table public.board_posts to authenticated;
grant insert (category, title, body, author_id, author_school_id) on table public.board_posts to authenticated;
grant update (title, body, category) on table public.board_posts to authenticated;
grant all on table public.board_posts to service_role;

drop policy if exists board_posts_select_members on public.board_posts;
create policy board_posts_select_members on public.board_posts
  for select to authenticated
  using (hidden_at is null and (select private.current_school_id()) is not null);

drop policy if exists board_posts_insert_staff on public.board_posts;
create policy board_posts_insert_staff on public.board_posts
  for insert to authenticated
  with check (
    category in ('bug', 'idea')
    and author_id = (select auth.uid())
    and author_school_id = (select private.current_school_id())
    and author_school_id <> (select private.demo_school_id())
    and (select private.is_staff())
    and answer is null
    and answered_at is null
    and hidden_at is null
  );

drop policy if exists board_posts_update_author on public.board_posts;
create policy board_posts_update_author on public.board_posts
  for update to authenticated
  using (
    author_id = (select auth.uid())
    and (select private.current_school_id()) is not null
    and answer is null
    and hidden_at is null
    and category in ('bug', 'idea')
  )
  with check (
    author_id = (select auth.uid())
    and answer is null
    and hidden_at is null
    and category in ('bug', 'idea')
  );

drop policy if exists board_posts_delete_author on public.board_posts;
create policy board_posts_delete_author on public.board_posts
  for delete to authenticated
  using (author_id = (select auth.uid()) and (select private.current_school_id()) is not null);

-- ---------- 4. 읽기 함수 ----------
-- 글쓴이 학교명 (schools RLS 는 자기 학교만이라 definer 로). 부른 사람이 회원이고 그 글이 숨겨지지 않았을 때만 이름을 준다.
create or replace function private.board_post_school_name(p_post_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.name
    from public.board_posts b
    join public.schools s on s.id = b.author_school_id
   where b.id = p_post_id
     and b.hidden_at is null
     and exists (select 1 from public.profiles p where p.user_id = auth.uid())
$$;
revoke all on function private.board_post_school_name(uuid) from public, anon;
grant execute on function private.board_post_school_name(uuid) to authenticated;

-- 목록: 분류별. FAQ = 오래된 순(가이드 순서), 오류 문의·개선 제안 = 최신순. 화면은 limit 20 + 1 로 '더 보기' 여부를 안다.
create or replace function public.board_posts_list(
  p_category text,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  category text,
  title text,
  body text,
  school_name text,
  answered boolean,
  created_at timestamptz,
  updated_at timestamptz,
  is_mine boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select b.id, b.category, b.title, b.body,
         private.board_post_school_name(b.id),
         b.answer is not null,
         b.created_at, b.updated_at,
         coalesce(b.author_id = (select auth.uid()), false)
    from public.board_posts b
   where b.category = p_category
     and b.hidden_at is null
   order by
     case when p_category = 'faq' then b.created_at end asc,
     case when p_category <> 'faq' then b.created_at end desc,
     b.id desc
   limit least(greatest(coalesce(p_limit, 20), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0)
$$;
revoke all on function public.board_posts_list(text, integer, integer) from public, anon;
grant execute on function public.board_posts_list(text, integer, integer) to authenticated;

-- 글 하나 (답변 포함). 숨긴 글·없는 글 = 0행 (운영자의 숨긴 글 보기는 서버 service role 경로)
create or replace function public.board_post(p_id uuid)
returns table (
  id uuid,
  category text,
  title text,
  body text,
  school_name text,
  answer text,
  answered_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  is_mine boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select b.id, b.category, b.title, b.body,
         private.board_post_school_name(b.id),
         b.answer, b.answered_at, b.created_at, b.updated_at,
         coalesce(b.author_id = (select auth.uid()), false)
    from public.board_posts b
   where b.id = p_id
     and b.hidden_at is null
$$;
revoke all on function public.board_post(uuid) from public, anon;
grant execute on function public.board_post(uuid) to authenticated;

-- 관리 탭 board-link 요약 '답변 완료 N' — 내가 쓴 글 중 답변이 달린 글 수
create or replace function public.board_my_answered_count()
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*)::integer
    from public.board_posts b
   where b.author_id = (select auth.uid())
     and b.answer is not null
     and b.hidden_at is null
$$;
revoke all on function public.board_my_answered_count() from public, anon;
grant execute on function public.board_my_answered_count() to authenticated;

-- ---------- 5. FAQ seed 16개 ----------
insert into public.board_posts (category, title, body, created_at, updated_at)
select 'faq', s.title, s.body,
       timestamptz '2026-10-29 00:00:00+09' + make_interval(secs => s.ord),
       timestamptz '2026-10-29 00:00:00+09' + make_interval(secs => s.ord)
  from (values
    (1, $q$학교를 잘못 골라 가입했어요.$q$, $q$가입한 뒤에는 화면에서 학교를 바꿀 수 없어요. 그 학교 관리자가 사용자 화면에서 내보내면, 같은 이메일로 회원가입을 다시 하면서 학교를 고를 수 있어요.$q$),
    (2, $q$선생님인데 학생으로 가입됐어요.$q$, $q$처음 가입자 다음부터는 학생으로 시작해요. 관리자에게 사용자 화면에서 역할을 교사로 바꿔 달라고 하세요. 앞으로는 관리자가 미리 교사로 초대해 두면 가입하자마자 교사예요.$q$),
    (3, $q$초대 메일이 안 와요.$q$, $q$초대는 메일을 보내지 않아요. 관리자가 "초대 링크 복사"로 받은 가입 주소를 직접 전해 주면, 초대받은 이메일로 같은 학교를 골라 가입하세요.$q$),
    (4, $q$가입 확인 메일이 안 와요.$q$, $q$스팸함을 먼저 보세요. 확인을 마친 뒤 개인 이메일과 비밀번호로 로그인하면 돼요.$q$),
    (5, $q$관리자를 다른 선생님께 넘기고 싶어요.$q$, $q$사용자 화면에서 그 선생님의 역할을 admin으로 바꾸세요. 그다음 새 admin이 내 역할을 바꾸거나 나를 학교에서 내보내면 돼요. 학교에는 admin이 최소 1명 있어야 해서 마지막 admin은 바꾸거나 내보낼 수 없고, 자기 자신은 내보낼 수 없어요.$q$),
    (6, $q$재고 부족 알림이 안 떠요.$q$, $q$재주문 기준이 0이면 알림이 없어요. 시약 상세에서 기준을 직접 적거나, 실험 매뉴얼로 채우거나, 사용 · 입고 기록이 쌓이면 자동 기준이 계산돼요.$q$),
    (7, $q$자동 기준이 예전 값 같아요.$q$, $q$자동 기준은 그 시약의 사용 · 입고를 기록할 때 다시 계산해요. 매일 저절로 다시 계산하지는 않아서, 오래 기록이 없던 시약은 다음 기록 때 맞춰져요.$q$),
    (8, $q$AI가 읽은 값이 틀려요.$q$, $q$저장 전 확인 표에서 바로 고치면 돼요. 틀린 행은 빼거나 삭제하고, 같은 파일로 다시 읽을 수도 있어요. 확인하기 전에는 아무것도 저장되지 않아요.$q$),
    (9, $q$"AI 추출을 쓸 수 없어요(서버 설정)"이 나와요.$q$, $q$서버의 AI 연결이 꺼져 있을 때 나오는 문구예요. 그동안에는 직접 입력으로 입고 · 등록할 수 있어요.$q$),
    (10, $q$MSDS를 못 찾아요.$q$, $q$공단에는 학교에서 부르는 이름과 다른 물질명으로 올라 있는 경우가 많아요(예: 염산 → 염화수소). CAS 번호가 있으면 더 잘 찾아요. 그래도 없으면 MSDS 주소를 직접 넣으세요.$q$),
    (11, $q$사용 기록을 잘못 입력했어요.$q$, $q$사용 기록은 하나씩 고치거나 지우는 기능이 없어요. 관리자의 기록 삭제는 날짜 기준으로 한꺼번에 지우는 기능이라 신중히 쓰세요.$q$),
    (12, $q$삭제한 시약을 되살릴 수 있나요?$q$, $q$되살릴 수 없어요. 그 시약의 사용 · 입고 기록은 "삭제된 시약"으로 남아요. 같은 이름으로 새로 등록할 수는 있어요.$q$),
    (13, $q$QR 스캔에서 카메라가 안 켜져요.$q$, $q$브라우저에서 카메라 권한을 허용했는지 보세요. 쓸 수 없으면 "번호로 찾기"에 시약장 번호를 적으면 같은 결과가 나와요.$q$),
    (14, $q$둘러보기에서 저장이 안 돼요.$q$, $q$둘러보기는 데모 학교를 보기만 하는 곳이에요. 가입하면 우리 학교 데이터로 모든 기능을 쓸 수 있어요.$q$),
    (15, $q$온라인학교는 회원가입에서 어디에 있나요?$q$, $q$학교급에서 '고등학교'를 고르면 시·도 온라인학교(예: 충북온라인학교)가 함께 나와요.$q$),
    (16, $q$만 14세 미만 학생도 가입할 수 있나요?$q$, $q$아니요. 만 14세 미만은 보호자 동의가 필요해서 Lab_Stock에 가입할 수 없어요.$q$)
  ) as s (ord, title, body)
 where not exists (
   select 1 from public.board_posts b where b.category = 'faq' and b.title = s.title
 );

-- PostgREST 스키마 캐시 갱신 (새 테이블·새 함수)
notify pgrst, 'reload schema';

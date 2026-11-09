-- Garante que todo usuário em auth.users tenha uma linha correspondente em
-- public.profiles. O trigger on_auth_user_created cuida disso normalmente
-- a cada novo cadastro; este backfill só cobre contas criadas antes desse
-- trigger existir (ex.: durante a configuração inicial do projeto).
-- Seguro para rodar mais de uma vez (idempotente).

insert into public.profiles (id, display_name)
select u.id, coalesce(u.raw_user_meta_data ->> 'name', split_part(u.email, '@', 1))
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

-- The Instrumentalist X
-- Migration: planos, assinaturas e pagamentos simulados
-- Executar depois de 20261018000000_security_progress_and_admin.sql

begin;

-- 1. Planos cadastrados e gerenciados pelo administrador.
create table public.plans (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    description text not null default '',
    price numeric(10, 2) not null check (price >= 0),
    billing_period text not null
        check (billing_period in ('monthly', 'quarterly', 'semiannual', 'annual')),
    duration_days integer not null check (duration_days > 0),
    features jsonb not null default '[]'::jsonb
        check (jsonb_typeof(features) = 'array'),
    is_active boolean not null default true,
    is_featured boolean not null default false,
    created_by uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    constraint plans_name_not_blank check (length(trim(name)) > 0)
);

create trigger plans_set_updated_at
before update on public.plans
for each row execute function public.set_updated_at();

create index plans_active_idx
on public.plans (is_active, created_at desc);

-- 2. Assinaturas simuladas.
-- Os campos *_snapshot preservam os dados do plano no momento da contratação.
create table public.user_subscriptions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    plan_id uuid not null references public.plans(id) on delete restrict,
    plan_name_snapshot text not null,
    amount_snapshot numeric(10, 2) not null check (amount_snapshot >= 0),
    billing_period_snapshot text not null,
    duration_days_snapshot integer not null check (duration_days_snapshot > 0),
    status text not null
        check (status in ('pending', 'active', 'failed', 'canceled', 'expired')),
    start_date timestamptz,
    end_date timestamptz,
    created_at timestamptz not null default timezone('utc', now()),
    constraint subscription_dates_check check (
        (start_date is null and end_date is null)
        or (start_date is not null and end_date is not null and end_date > start_date)
    )
);

create index user_subscriptions_user_idx
on public.user_subscriptions (user_id, created_at desc);

create index user_subscriptions_plan_idx
on public.user_subscriptions (plan_id);

-- 3. Histórico de pagamentos fictícios.
create table public.simulated_payments (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    subscription_id uuid not null references public.user_subscriptions(id) on delete restrict,
    amount numeric(10, 2) not null check (amount >= 0),
    payment_method text not null
        check (payment_method in ('pix', 'credit_card')),
    status text not null
        check (status in ('approved', 'rejected', 'pending', 'canceled')),
    created_at timestamptz not null default timezone('utc', now())
);

create index simulated_payments_user_idx
on public.simulated_payments (user_id, created_at desc);

create index simulated_payments_subscription_idx
on public.simulated_payments (subscription_id);

-- 4. RLS: planos.
alter table public.plans enable row level security;

create policy "Users view active plans and admins view all"
on public.plans for select to authenticated
using (is_active or public.is_admin());

create policy "Admins create plans"
on public.plans for insert to authenticated
with check (public.is_admin() and (created_by is null or created_by = auth.uid()));

create policy "Admins update plans"
on public.plans for update to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Não concedemos DELETE: a remoção deve ser lógica, via is_active = false.
revoke all on public.plans from anon, authenticated;
grant select on public.plans to authenticated;
grant insert (name, description, price, billing_period, duration_days,
              features, is_active, is_featured, created_by)
on public.plans to authenticated;
grant update (name, description, price, billing_period, duration_days,
              features, is_active, is_featured)
on public.plans to authenticated;

-- 5. RLS: assinaturas.
alter table public.user_subscriptions enable row level security;

create policy "Users view own subscriptions and admins view all"
on public.user_subscriptions for select to authenticated
using (user_id = auth.uid() or public.is_admin());

revoke all on public.user_subscriptions from anon, authenticated;
grant select on public.user_subscriptions to authenticated;

-- 6. RLS: pagamentos.
alter table public.simulated_payments enable row level security;

create policy "Users view own simulated payments and admins view all"
on public.simulated_payments for select to authenticated
using (user_id = auth.uid() or public.is_admin());

revoke all on public.simulated_payments from anon, authenticated;
grant select on public.simulated_payments to authenticated;

-- 7. Função para registrar uma contratação simulada.
-- O resultado é fictício e não processa nem cobra dinheiro real.
-- A função usa o preço e a duração salvos no banco, não valores enviados pelo navegador.
create or replace function public.simulate_plan_purchase(
    p_plan_id uuid,
    p_payment_method text,
    p_result text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user uuid := auth.uid();
    v_plan public.plans%rowtype;
    v_subscription_id uuid;
    v_payment_id uuid;
    v_subscription_status text;
    v_start_date timestamptz;
    v_end_date timestamptz;
begin
    if v_user is null then
        raise exception 'Faça login para contratar um plano.'
            using errcode = '28000';
    end if;

    if p_payment_method not in ('pix', 'credit_card') then
        raise exception 'Forma de pagamento inválida.'
            using errcode = '22023';
    end if;

    if p_result not in ('approved', 'rejected', 'pending', 'canceled') then
        raise exception 'Resultado de pagamento inválido.'
            using errcode = '22023';
    end if;

    select *
    into v_plan
    from public.plans
    where id = p_plan_id and is_active = true;

    if not found then
        raise exception 'Plano não encontrado ou indisponível.'
            using errcode = 'P0002';
    end if;

    v_subscription_status := case p_result
        when 'approved' then 'active'
        when 'rejected' then 'failed'
        when 'pending' then 'pending'
        when 'canceled' then 'canceled'
    end;

    if p_result = 'approved' then
        v_start_date := now();
        v_end_date := now() + make_interval(days => v_plan.duration_days);
    end if;

    insert into public.user_subscriptions (
        user_id, plan_id, plan_name_snapshot, amount_snapshot,
        billing_period_snapshot, duration_days_snapshot,
        status, start_date, end_date
    )
    values (
        v_user, v_plan.id, v_plan.name, v_plan.price,
        v_plan.billing_period, v_plan.duration_days,
        v_subscription_status, v_start_date, v_end_date
    )
    returning id into v_subscription_id;

    insert into public.simulated_payments (
        user_id, subscription_id, amount, payment_method, status
    )
    values (
        v_user, v_subscription_id, v_plan.price, p_payment_method, p_result
    )
    returning id into v_payment_id;

    return jsonb_build_object(
        'subscription_id', v_subscription_id,
        'payment_id', v_payment_id,
        'plan_name', v_plan.name,
        'amount', v_plan.price,
        'payment_status', p_result,
        'subscription_status', v_subscription_status,
        'start_date', v_start_date,
        'end_date', v_end_date,
        'simulated', true
    );
end;
$$;

revoke execute on function public.simulate_plan_purchase(uuid, text, text)
from public, anon;

grant execute on function public.simulate_plan_purchase(uuid, text, text)
to authenticated;

commit;

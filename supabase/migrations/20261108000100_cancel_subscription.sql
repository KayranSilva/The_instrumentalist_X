-- The Instrumentalist X
-- Migration: cancelamento de assinatura simulada
-- Executar depois de 20261108000000_plans_and_simulated_payments.sql

begin;

-- O aluno não tem permissão de gravar em user_subscriptions nem em
-- simulated_payments; o cancelamento passa por esta função, que só mexe
-- em assinaturas do próprio usuário (auth.uid()).
--
-- Regras:
--   * 'active'  -> vira 'canceled' e o fim da vigência passa a ser agora.
--                  O pagamento aprovado continua como está (não há estorno).
--   * 'pending' -> vira 'canceled' e o pagamento pendente também é cancelado.
--   * qualquer outro status (failed, canceled, expired) não pode ser cancelado.
-- Nada disso envolve dinheiro real, e o acesso às aulas nunca depende da assinatura.
create or replace function public.cancel_subscription(p_subscription_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user uuid := auth.uid();
    v_sub public.user_subscriptions%rowtype;
    v_end_date timestamptz;
begin
    if v_user is null then
        raise exception 'Faça login para cancelar uma assinatura.'
            using errcode = '28000';
    end if;

    -- Trava a linha para dois cancelamentos simultâneos não se atropelarem.
    select *
    into v_sub
    from public.user_subscriptions
    where id = p_subscription_id and user_id = v_user
    for update;

    if not found then
        raise exception 'Assinatura não encontrada.'
            using errcode = 'P0002';
    end if;

    if v_sub.status = 'canceled' then
        raise exception 'Esta assinatura já foi cancelada.'
            using errcode = '22023';
    end if;

    if v_sub.status = 'active' and v_sub.end_date <= now() then
        raise exception 'Esta assinatura já expirou e não pode ser cancelada.'
            using errcode = '22023';
    end if;

    if v_sub.status not in ('active', 'pending') then
        raise exception 'Só é possível cancelar assinaturas ativas ou pendentes.'
            using errcode = '22023';
    end if;

    v_end_date := v_sub.end_date;
    if v_sub.status = 'active' then
        -- A constraint subscription_dates_check exige end_date > start_date.
        v_end_date := greatest(now(), v_sub.start_date + interval '1 second');
    end if;

    update public.user_subscriptions
    set status = 'canceled',
        end_date = v_end_date
    where id = v_sub.id;

    update public.simulated_payments
    set status = 'canceled'
    where subscription_id = v_sub.id and status = 'pending';

    return jsonb_build_object(
        'subscription_id', v_sub.id,
        'plan_name', v_sub.plan_name_snapshot,
        'previous_status', v_sub.status,
        'subscription_status', 'canceled',
        'start_date', v_sub.start_date,
        'end_date', v_end_date,
        'simulated', true
    );
end;
$$;

revoke execute on function public.cancel_subscription(uuid)
from public, anon;

grant execute on function public.cancel_subscription(uuid)
to authenticated;

commit;

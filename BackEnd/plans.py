"""Planos, assinaturas e pagamentos simulados.

Nenhum valor real é cobrado: a "contratação" só grava linhas no banco pela
função SQL simulate_plan_purchase. O RLS continua sendo quem decide o que cada
usuário pode ler ou gravar; aqui validamos a entrada, conferimos o papel de
administrador (defesa extra) e montamos a resposta para o frontend.

A assinatura NÃO bloqueia o acesso às aulas: este módulo não toca em conteúdo.
"""

import re
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any, Dict, List, Optional, Tuple

import supabase_client
from content import is_uuid
from supabase_client import SupabaseError

Response = Tuple[Dict[str, object], int]

BILLING_PERIODS = {"monthly", "quarterly", "semiannual", "annual"}
PAYMENT_METHODS = {"pix", "credit_card"}
PAYMENT_RESULTS = {"approved", "rejected", "pending", "canceled"}

MAX_PRICE = Decimal("99999999.99")  # limite de numeric(10, 2)
MAX_NAME = 120
MAX_DESCRIPTION = 1000
MAX_FEATURES = 12
MAX_FEATURE_LENGTH = 120
MAX_DURATION_DAYS = 3650
LIST_LIMIT = 500

PLAN_COLUMNS = (
    "id,name,description,price,billing_period,duration_days,features,"
    "is_active,is_featured,created_at,updated_at"
)
SUBSCRIPTION_COLUMNS = (
    "id,plan_id,plan_name_snapshot,amount_snapshot,billing_period_snapshot,"
    "duration_days_snapshot,status,start_date,end_date,created_at"
)
PAYMENT_COLUMNS = "id,subscription_id,amount,payment_method,status,created_at"

PURCHASE_MESSAGES = {
    "approved": "Pagamento aprovado! Sua assinatura está ativa.",
    "rejected": "Pagamento recusado.",
    "pending": "Pagamento pendente. A assinatura ainda não está ativa.",
    "canceled": "Pagamento cancelado.",
}


def _fail(message: str, status: int = 400, field: Optional[str] = None) -> Response:
    body: Dict[str, object] = {"success": False, "message": message}
    if field:
        body["field"] = field
    return body, status


# ---------- validação de planos ----------

class _InvalidPlan(Exception):
    def __init__(self, message: str, field: str):
        super().__init__(message)
        self.message = message
        self.field = field


def _clean_name(value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        raise _InvalidPlan("Informe o nome do plano.", "name")
    text = value.strip()
    if len(text) > MAX_NAME:
        raise _InvalidPlan(f"O nome pode ter no máximo {MAX_NAME} caracteres.", "name")
    return text


def _clean_description(value: Any) -> str:
    if value is None:
        return ""
    if not isinstance(value, str):
        raise _InvalidPlan("Descrição inválida.", "description")
    text = value.strip()
    if len(text) > MAX_DESCRIPTION:
        raise _InvalidPlan(f"A descrição pode ter no máximo {MAX_DESCRIPTION} caracteres.", "description")
    return text


def _clean_price(value: Any) -> float:
    if value is None or isinstance(value, bool) or str(value).strip() == "":
        raise _InvalidPlan("Informe o preço do plano.", "price")
    try:
        price = Decimal(str(value).strip().replace(",", "."))
    except InvalidOperation:
        raise _InvalidPlan("Preço inválido.", "price")
    if not price.is_finite() or price < 0:
        raise _InvalidPlan("O preço deve ser zero ou maior.", "price")
    if price > MAX_PRICE:
        raise _InvalidPlan("O preço informado é alto demais.", "price")
    rounded = price.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    if rounded != price:
        raise _InvalidPlan("Use no máximo duas casas decimais no preço.", "price")
    return float(rounded)


def _clean_period(value: Any) -> str:
    if value not in BILLING_PERIODS:
        raise _InvalidPlan("Escolha um período de cobrança válido.", "billing_period")
    return str(value)


def _clean_duration(value: Any) -> int:
    if value is None or isinstance(value, bool):
        raise _InvalidPlan("Informe a duração do plano em dias.", "duration_days")
    try:
        days = int(str(value).strip())
    except ValueError:
        raise _InvalidPlan("A duração deve ser um número inteiro de dias.", "duration_days")
    if days < 1 or days > MAX_DURATION_DAYS:
        raise _InvalidPlan(f"A duração deve ficar entre 1 e {MAX_DURATION_DAYS} dias.", "duration_days")
    return days


def _clean_features(value: Any) -> List[str]:
    if value is None:
        return []
    if isinstance(value, str):
        items: List[Any] = value.splitlines()
    elif isinstance(value, list):
        items = value
    else:
        raise _InvalidPlan("Benefícios inválidos.", "features")
    result: List[str] = []
    for item in items:
        if not isinstance(item, str):
            raise _InvalidPlan("Benefícios inválidos.", "features")
        text = item.strip()
        if not text:
            continue
        if len(text) > MAX_FEATURE_LENGTH:
            raise _InvalidPlan(f"Cada benefício pode ter no máximo {MAX_FEATURE_LENGTH} caracteres.", "features")
        result.append(text)
    if len(result) > MAX_FEATURES:
        raise _InvalidPlan(f"Cadastre no máximo {MAX_FEATURES} benefícios.", "features")
    return result


def _flag(field: str, default: bool):
    def clean(value: Any) -> bool:
        if value is None:
            return default
        if isinstance(value, bool):
            return value
        if isinstance(value, str) and value.lower() in {"true", "false"}:
            return value.lower() == "true"
        raise _InvalidPlan("Valor inválido.", field)
    return clean


_CLEANERS = {
    "name": _clean_name,
    "description": _clean_description,
    "price": _clean_price,
    "billing_period": _clean_period,
    "duration_days": _clean_duration,
    "features": _clean_features,
    "is_active": _flag("is_active", True),
    "is_featured": _flag("is_featured", False),
}


def _validate_plan(payload: Dict[str, Any], partial: bool) -> Dict[str, Any]:
    """Valida o corpo. Em modo parcial (PATCH) só olha os campos enviados."""
    clean: Dict[str, Any] = {}
    for field, cleaner in _CLEANERS.items():
        if partial and field not in payload:
            continue
        clean[field] = cleaner(payload.get(field))
    return clean


# ---------- utilitários ----------

def _require_admin(token: str) -> Tuple[Optional[str], Optional[Response]]:
    """Confere no banco se o dono do token é administrador."""
    try:
        user = supabase_client.get_auth_user(token)
        rows = supabase_client.rest_select(
            "profiles", token, {"select": "role", "id": f"eq.{user['id']}"}
        )
    except SupabaseError as error:
        return None, _fail(error.message, error.status)
    if not rows or rows[0].get("role") != "admin":
        return None, _fail("Apenas administradores podem gerenciar planos.", 403)
    return str(user["id"]), None


def _current_user_id(token: str) -> Tuple[Optional[str], Optional[Response]]:
    try:
        user = supabase_client.get_auth_user(token)
    except SupabaseError as error:
        return None, _fail(error.message, error.status)
    return str(user["id"]), None


_FRACTION = re.compile(r"\.(\d+)")


def _parse_timestamp(value: Any) -> Optional[datetime]:
    if not isinstance(value, str) or not value.strip():
        return None
    text = value.strip().replace("Z", "+00:00")
    # Python < 3.11 só aceita frações com 3 ou 6 dígitos.
    text = _FRACTION.sub(lambda m: "." + m.group(1)[:6].ljust(6, "0"), text, count=1)
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _effective_status(row: Dict[str, Any]) -> Any:
    """Nada no banco expira assinaturas sozinho: quem passou do fim vira "expired"."""
    status = row.get("status")
    if status == "active":
        end = _parse_timestamp(row.get("end_date"))
        if end and end <= datetime.now(timezone.utc):
            return "expired"
    return status


def _embedded(row: Dict[str, Any], key: str) -> Dict[str, Any]:
    """Tira (e achata) um recurso embutido do PostgREST (objeto ou lista de 1)."""
    value = row.pop(key, None)
    if isinstance(value, list):
        value = value[0] if value else None
    return value if isinstance(value, dict) else {}


def _select(table: str, token: str, params: Dict[str, str]) -> Tuple[Optional[List[Dict[str, Any]]], Optional[Response]]:
    try:
        return supabase_client.rest_select(table, token, params), None
    except SupabaseError as error:
        return None, _fail(error.message, error.status)


# ---------- aluno ----------

def list_active_plans(token: str) -> Response:
    """Planos que o aluno pode contratar (o administrador também só vê os ativos aqui)."""
    rows, failure = _select("plans", token, {
        "select": PLAN_COLUMNS,
        "is_active": "eq.true",
        "order": "is_featured.desc,price.asc,created_at.asc",
    })
    if failure:
        return failure
    return {"success": True, "plans": rows}, 200


def purchase_plan(token: str, payload: Dict[str, Any]) -> Response:
    """Contratação simulada. Preço e duração vêm do banco, nunca do navegador."""
    plan_id = str(payload.get("plan_id") or "")
    method = str(payload.get("payment_method") or "")
    result = str(payload.get("result") or "")
    if not is_uuid(plan_id):
        return _fail("Plano não encontrado ou indisponível.", 404, "plan_id")
    if method not in PAYMENT_METHODS:
        return _fail("Escolha uma forma de pagamento válida.", 400, "payment_method")
    if result not in PAYMENT_RESULTS:
        return _fail("Resultado de pagamento inválido.", 400, "result")
    try:
        purchase = supabase_client.rpc("simulate_plan_purchase", token, {
            "p_plan_id": plan_id,
            "p_payment_method": method,
            "p_result": result,
        })
    except SupabaseError as error:
        return _fail(error.message, error.status)
    return {"success": True, "message": PURCHASE_MESSAGES[result], "purchase": purchase}, 200


def cancel_my_subscription(token: str, payload: Dict[str, Any]) -> Response:
    """Cancela uma assinatura do próprio aluno (ativa ou pendente).

    As regras ficam na função SQL cancel_subscription, que só enxerga
    assinaturas do usuário do token e devolve mensagens em português.
    """
    subscription_id = str(payload.get("subscription_id") or "")
    if not is_uuid(subscription_id):
        return _fail("Assinatura não encontrada.", 404, "subscription_id")
    try:
        result = supabase_client.rpc("cancel_subscription", token, {"p_subscription_id": subscription_id})
    except SupabaseError as error:
        return _fail(error.message, error.status)
    return {"success": True, "message": "Assinatura cancelada.", "subscription": result}, 200


def my_subscriptions(token: str) -> Response:
    user_id, failure = _current_user_id(token)
    if failure:
        return failure
    rows, failure = _select("user_subscriptions", token, {
        "select": SUBSCRIPTION_COLUMNS,
        "user_id": f"eq.{user_id}",
        "order": "created_at.desc",
        "limit": "100",
    })
    if failure:
        return failure
    for row in rows or []:
        row["status"] = _effective_status(row)
    return {"success": True, "subscriptions": rows}, 200


def my_payments(token: str) -> Response:
    user_id, failure = _current_user_id(token)
    if failure:
        return failure
    rows, failure = _select("simulated_payments", token, {
        "select": f"{PAYMENT_COLUMNS},user_subscriptions(plan_name_snapshot)",
        "user_id": f"eq.{user_id}",
        "order": "created_at.desc",
        "limit": "100",
    })
    if failure:
        return failure
    for row in rows or []:
        row["plan_name"] = _embedded(row, "user_subscriptions").get("plan_name_snapshot") or "Plano"
    return {"success": True, "payments": rows}, 200


# ---------- administrador ----------

def admin_list_plans(token: str) -> Response:
    _, failure = _require_admin(token)
    if failure:
        return failure
    rows, failure = _select("plans", token, {"select": PLAN_COLUMNS, "order": "created_at.desc"})
    if failure:
        return failure
    return {"success": True, "plans": rows}, 200


def create_plan(token: str, payload: Dict[str, Any]) -> Response:
    admin_id, failure = _require_admin(token)
    if failure:
        return failure
    try:
        row = _validate_plan(payload, partial=False)
    except _InvalidPlan as error:
        return _fail(error.message, 400, error.field)
    row["created_by"] = admin_id
    try:
        created = supabase_client.rest_insert("plans", token, row)
    except SupabaseError as error:
        return _fail(error.message, error.status)
    return {"success": True, "message": "Plano criado.", "plan": created[0] if created else None}, 201


def update_plan(token: str, plan_id: str, payload: Dict[str, Any]) -> Response:
    """Edita um plano. Não existe exclusão: para retirar, envie is_active = false.

    Assinaturas já feitas não mudam: elas guardam uma cópia (snapshot) do plano.
    """
    if not is_uuid(plan_id):
        return _fail("Plano não encontrado.", 404)
    _, failure = _require_admin(token)
    if failure:
        return failure
    try:
        patch = _validate_plan(payload, partial=True)
    except _InvalidPlan as error:
        return _fail(error.message, 400, error.field)
    if not patch:
        return _fail("Nenhuma alteração informada.", 400)
    try:
        updated = supabase_client.rest_update("plans", token, {"id": f"eq.{plan_id}"}, patch)
    except SupabaseError as error:
        return _fail(error.message, error.status)
    if not updated:
        return _fail("Plano não encontrado.", 404)
    return {"success": True, "message": "Plano atualizado.", "plan": updated[0]}, 200


def admin_list_subscriptions(token: str) -> Response:
    _, failure = _require_admin(token)
    if failure:
        return failure
    rows, failure = _select("user_subscriptions", token, {
        "select": f"{SUBSCRIPTION_COLUMNS},profiles(display_name)",
        "order": "created_at.desc",
        "limit": str(LIST_LIMIT),
    })
    if failure:
        return failure
    for row in rows or []:
        row["student_name"] = _embedded(row, "profiles").get("display_name") or "Aluno"
        row["status"] = _effective_status(row)
    return {"success": True, "subscriptions": rows}, 200


def admin_list_payments(token: str) -> Response:
    _, failure = _require_admin(token)
    if failure:
        return failure
    rows, failure = _select("simulated_payments", token, {
        "select": f"{PAYMENT_COLUMNS},profiles(display_name),user_subscriptions(plan_name_snapshot)",
        "order": "created_at.desc",
        "limit": str(LIST_LIMIT),
    })
    if failure:
        return failure
    for row in rows or []:
        row["student_name"] = _embedded(row, "profiles").get("display_name") or "Aluno"
        row["plan_name"] = _embedded(row, "user_subscriptions").get("plan_name_snapshot") or "Plano"
    return {"success": True, "payments": rows}, 200

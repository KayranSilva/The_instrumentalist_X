"""Funções auxiliares para falar com a API REST/Auth do Supabase.

Usa só a biblioteca padrão do Python (sem dependências externas), seguindo
o mesmo padrão já usado no restante do backend. Centraliza aqui o
carregamento do arquivo .env e as chamadas autenticadas via token do
próprio usuário (nunca guardamos a service_role key: o RLS do banco é
quem decide o que cada usuário pode ler ou gravar).
"""

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


def _load_dotenv() -> None:
    """Carrega variáveis de um arquivo .env na raiz do projeto, se existir.

    Nunca sobrescreve uma variável já definida no ambiente (ex.: setada
    manualmente no PowerShell antes de iniciar o processo).
    """
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if not env_path.is_file():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


_load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")


# Mensagens que o Supabase devolve em inglês -> texto mostrado ao usuário.
_MESSAGE_TRANSLATIONS = (
    ("invalid login credentials", "E-mail ou senha incorretos."),
    ("email not confirmed", "Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada."),
    ("user already registered", "Este e-mail já está cadastrado."),
    ("already been registered", "Este e-mail já está cadastrado."),
    ("new password should be different", "A nova senha precisa ser diferente da anterior."),
    ("password should be at least", "A senha deve ter pelo menos 6 caracteres."),
    ("for security purposes", "Aguarde alguns segundos antes de tentar novamente."),
    ("rate limit", "Muitas tentativas. Aguarde alguns minutos e tente de novo."),
    ("invalid refresh token", "Sessão expirada. Faça login novamente."),
    ("refresh token not found", "Sessão expirada. Faça login novamente."),
    ("jwt expired", "Sessão expirada. Faça login novamente."),
    ("row-level security", "Você não tem permissão para esta ação."),
    ("signups not allowed", "Novos cadastros estão desativados no momento."),
    ("payload too large", "O arquivo é maior que o limite permitido."),
    ("exceeded the maximum allowed size", "O arquivo é maior que o limite permitido."),
)


def translate_message(message: str) -> str:
    lowered = (message or "").lower()
    for needle, translated in _MESSAGE_TRANSLATIONS:
        if needle in lowered:
            return translated
    return message


class SupabaseError(Exception):
    """Erro ao chamar o Supabase, com mensagem segura para mostrar ao usuário."""

    def __init__(self, message: str, status: int = 500):
        super().__init__(message)
        self.message = message
        self.status = status


def _request(
    method: str,
    url: str,
    token: Optional[str] = None,
    body: Any = None,
    extra_headers: Optional[Dict[str, str]] = None,
) -> Tuple[Any, int]:
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        raise SupabaseError("Configure SUPABASE_URL e SUPABASE_ANON_KEY no ambiente.", 503)

    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {token or SUPABASE_ANON_KEY}",
    }
    if extra_headers:
        headers.update(extra_headers)

    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"

    request = Request(url, data=data, headers=headers, method=method)
    try:
        with urlopen(request, timeout=15) as response:
            raw = response.read().decode("utf-8")
            parsed = json.loads(raw) if raw else None
            return parsed, response.status
    except HTTPError as error:
        try:
            raw = error.read().decode("utf-8")
            details = json.loads(raw) if raw else {}
        except (UnicodeDecodeError, json.JSONDecodeError):
            details = {}
        message = translate_message(str(
            details.get("message")
            or details.get("error_description")
            or details.get("msg")
            or "Não foi possível completar a operação."
        ))
        raise SupabaseError(message, error.code) from error
    except (URLError, TimeoutError) as error:
        raise SupabaseError("Não foi possível conectar ao banco de dados.", 503) from error


def rest_select(table: str, token: Optional[str], params: Dict[str, str]) -> List[Dict[str, Any]]:
    """SELECT via PostgREST. Sem token, atua como "anon" (sujeito ao RLS)."""
    url = f"{SUPABASE_URL}/rest/v1/{table}?{urlencode(params)}"
    data, _ = _request("GET", url, token=token)
    return data if isinstance(data, list) else []


def rest_upsert(
    table: str,
    token: Optional[str],
    rows: List[Dict[str, Any]],
    on_conflict: Optional[str] = None,
) -> List[Dict[str, Any]]:
    params = {"on_conflict": on_conflict} if on_conflict else {}
    query = urlencode(params)
    url = f"{SUPABASE_URL}/rest/v1/{table}" + (f"?{query}" if query else "")
    headers = {"Prefer": "resolution=merge-duplicates,return=representation"}
    data, _ = _request("POST", url, token=token, body=rows, extra_headers=headers)
    return data if isinstance(data, list) else []


def rest_update(table: str, token: Optional[str], params: Dict[str, str], patch: Dict[str, Any]) -> List[Dict[str, Any]]:
    """PATCH via PostgREST; devolve as linhas alteradas (lista vazia = nada casou)."""
    url = f"{SUPABASE_URL}/rest/v1/{table}?{urlencode(params)}"
    data, _ = _request("PATCH", url, token=token, body=patch, extra_headers={"Prefer": "return=representation"})
    return data if isinstance(data, list) else []


def rest_delete(table: str, token: Optional[str], params: Dict[str, str]) -> None:
    url = f"{SUPABASE_URL}/rest/v1/{table}?{urlencode(params)}"
    _request("DELETE", url, token=token, extra_headers={"Prefer": "return=minimal"})


def rpc(function: str, token: Optional[str], args: Optional[Dict[str, Any]] = None) -> Any:
    """Chama uma função do banco (POST /rest/v1/rpc/<nome>)."""
    url = f"{SUPABASE_URL}/rest/v1/rpc/{function}"
    data, _ = _request("POST", url, token=token, body=args or {})
    return data


def delete_storage_objects(bucket: str, token: str, object_paths: List[str]) -> None:
    if not object_paths:
        return
    url = f"{SUPABASE_URL}/storage/v1/object/{bucket}"
    _request("DELETE", url, token=token, body={"prefixes": object_paths})


def update_auth_user(token: str, attributes: Dict[str, Any]) -> Dict[str, Any]:
    """Atualiza o usuário dono do token (ex.: nova senha após recuperação)."""
    url = f"{SUPABASE_URL}/auth/v1/user"
    data, _ = _request("PUT", url, token=token, body=attributes)
    return data if isinstance(data, dict) else {}


def sign_out(token: str) -> None:
    """Revoga o refresh_token da sessão atual no Supabase Auth."""
    url = f"{SUPABASE_URL}/auth/v1/logout?scope=local"
    _request("POST", url, token=token)


def upload_storage_object(bucket: str, token: str, object_path: str, data: bytes, content_type: str) -> None:
    """Envia bytes crus para o Supabase Storage (não é um corpo JSON)."""
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        raise SupabaseError("Configure SUPABASE_URL e SUPABASE_ANON_KEY no ambiente.", 503)
    url = f"{SUPABASE_URL}/storage/v1/object/{bucket}/{object_path}"
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {token or SUPABASE_ANON_KEY}",
        "Content-Type": content_type,
        "x-upsert": "false",
    }
    request = Request(url, data=data, headers=headers, method="POST")
    try:
        with urlopen(request, timeout=600):
            return
    except HTTPError as error:
        try:
            raw = error.read().decode("utf-8")
            details = json.loads(raw) if raw else {}
        except (UnicodeDecodeError, json.JSONDecodeError):
            details = {}
        message = translate_message(str(details.get("message") or details.get("error") or "Não foi possível enviar o arquivo."))
        raise SupabaseError(message, error.code) from error
    except (URLError, TimeoutError) as error:
        raise SupabaseError("Não foi possível conectar ao armazenamento.", 503) from error


def get_auth_user(token: str) -> Dict[str, Any]:
    """Valida o access_token no Supabase Auth e retorna os dados do usuário.

    É assim que confirmamos quem está fazendo a requisição, em vez de
    confiar num e-mail enviado livremente no corpo da requisição.
    """
    if not token:
        raise SupabaseError("Sessão não informada.", 401)
    url = f"{SUPABASE_URL}/auth/v1/user"
    try:
        data, _ = _request("GET", url, token=token)
    except SupabaseError as error:
        if error.status in {401, 403}:
            raise SupabaseError("Sessão inválida ou expirada. Faça login novamente.", 401) from error
        raise
    if not isinstance(data, dict) or not data.get("id"):
        raise SupabaseError("Sessão inválida ou expirada. Faça login novamente.", 401)
    return data


def refresh_session(refresh_token: str) -> Dict[str, Any]:
    """Troca um refresh_token por uma nova sessão (access_token renovado)."""
    if not refresh_token:
        raise SupabaseError("Sessão expirada. Faça login novamente.", 401)
    url = f"{SUPABASE_URL}/auth/v1/token?grant_type=refresh_token"
    data, _ = _request("POST", url, body={"refresh_token": refresh_token})
    if not isinstance(data, dict) or not data.get("access_token"):
        raise SupabaseError("Sessão expirada. Faça login novamente.", 401)
    return data


def bearer_token_from_header(value: str) -> str:
    value = (value or "").strip()
    if value.lower().startswith("bearer "):
        return value[7:].strip()
    return ""

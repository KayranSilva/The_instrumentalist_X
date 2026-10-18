import json
import mimetypes
import os
import re
from email import policy
from email.parser import BytesParser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, Optional, Tuple
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

import supabase_client
from content import MAX_UPLOAD_MB, create_content, delete_content, is_uuid, list_content, list_teachers, update_content
from homepage import complete_content, get_homepage_data
from supabase_client import SupabaseError, bearer_token_from_header, translate_message

SUPABASE_URL = supabase_client.SUPABASE_URL
SUPABASE_ANON_KEY = supabase_client.SUPABASE_ANON_KEY

VALID_ROLES = {"student", "teacher", "admin"}


def validate_email(email: str) -> bool:
    """Valida um e-mail simples."""
    if not isinstance(email, str):
        return False
    return bool(re.fullmatch(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", email.strip()))


def _safe_redirect(value: Any) -> Optional[str]:
    """Aceita só URLs http(s) absolutas como destino dos links de e-mail.

    O Supabase ainda confere a URL contra a lista de "Redirect URLs"
    configurada no painel, então isso aqui é só uma primeira barreira.
    """
    if not isinstance(value, str):
        return None
    parsed = urlparse(value.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return None
    return value.strip()


def supabase_auth_request(
    path: str, payload: Dict[str, Any], redirect_to: Optional[str] = None
) -> Tuple[bool, Dict[str, Any], int]:
    """Chama o Auth REST do Supabase sem persistir credenciais no backend."""
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        return False, {"message": "Configure SUPABASE_URL e SUPABASE_ANON_KEY no ambiente."}, 503

    url = f"{SUPABASE_URL}/auth/v1/{path}"
    if redirect_to:
        url += ("&" if "?" in url else "?") + urlencode({"redirect_to": redirect_to})
    request = Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=15) as response:
            body = response.read().decode("utf-8")
            return True, json.loads(body) if body else {}, response.status
    except HTTPError as error:
        try:
            body = error.read().decode("utf-8")
            details = json.loads(body) if body else {}
        except (UnicodeDecodeError, json.JSONDecodeError):
            details = {}
        return False, details, error.code
    except (URLError, TimeoutError):
        return False, {"message": "Não foi possível conectar ao servidor de autenticação."}, 503


def auth_error_message(details: Dict[str, Any], default: str) -> str:
    raw = str(details.get("error_description") or details.get("msg") or details.get("message") or default)
    return translate_message(raw)


def _valid_instrument_slug(slug: str) -> bool:
    try:
        rows = supabase_client.rest_select("instruments", None, {"select": "id", "slug": f"eq.{slug}"})
    except SupabaseError:
        return False
    return bool(rows)


def register_user(
    name: str, email: str, password: str, instrument_slug: str, redirect_to: Optional[str]
) -> Tuple[Dict[str, object], int]:
    """Cria a conta no Supabase Auth; o trigger cria o perfil e grava o
    instrumento principal a partir dos metadados do cadastro."""
    normalized_email = (email or "").strip().lower()
    normalized_name = " ".join((name or "").split())
    slug = (instrument_slug or "").strip().lower()

    if len(normalized_name) < 2 or len(normalized_name) > 80:
        return {"success": False, "field": "name", "message": "Informe seu nome (2 a 80 caracteres)."}, 400
    if not validate_email(normalized_email):
        return {"success": False, "field": "email", "message": "E-mail inválido."}, 400
    if not isinstance(password, str) or len(password) < 6:
        return {"success": False, "field": "password", "message": "A senha deve ter pelo menos 6 caracteres."}, 400
    if len(password) > 72:
        return {"success": False, "field": "password", "message": "A senha pode ter no máximo 72 caracteres."}, 400
    if not slug or not _valid_instrument_slug(slug):
        return {"success": False, "field": "instrument", "message": "Escolha um instrumento da lista."}, 400

    ok, details, status = supabase_auth_request(
        "signup",
        {"email": normalized_email, "password": password, "data": {"name": normalized_name, "instrument": slug}},
        redirect_to=redirect_to,
    )
    if not ok:
        message = auth_error_message(details, "Não foi possível criar a conta.")
        field = "email" if "e-mail" in message.lower() else "password"
        return {"success": False, "field": field, "message": message}, 503 if status == 503 else 400

    has_session = bool(details.get("access_token"))
    if not has_session:
        return {
            "success": True,
            "requires_confirmation": True,
            "message": "Conta criada! Enviamos um link de confirmação para o seu e-mail.",
        }, 201

    user = details.get("user") or {}
    return {
        "success": True,
        "requires_confirmation": False,
        "message": "Conta criada com sucesso.",
        "user": {
            "email": normalized_email,
            "name": normalized_name,
            "role": "student",
            "access_token": details.get("access_token"),
            "refresh_token": details.get("refresh_token"),
            "id": user.get("id"),
        },
    }, 201


def authenticate_user(email: str, password: str) -> Tuple[Dict[str, object], int]:
    """Autentica o usuário usando o Supabase Auth."""
    normalized_email = (email or "").strip().lower()

    if not validate_email(normalized_email):
        return {"success": False, "field": "email", "message": "E-mail inválido."}, 400
    if not isinstance(password, str) or not password:
        return {"success": False, "field": "password", "message": "Informe sua senha."}, 400

    ok, details, status = supabase_auth_request(
        "token?grant_type=password", {"email": normalized_email, "password": password}
    )
    if not ok:
        message = auth_error_message(details, "Não foi possível realizar o login.")
        field = "email" if "confirme seu e-mail" in message.lower() else "password"
        return {"success": False, "field": field, "message": message}, 503 if status == 503 else 401

    user = details.get("user") or {}
    metadata = user.get("user_metadata") or {}
    name = metadata.get("name") or normalized_email.split("@", 1)[0].capitalize()
    access_token = details.get("access_token")

    role = "student"
    try:
        profiles = supabase_client.rest_select(
            "profiles", access_token, {"select": "display_name,role", "id": f"eq.{user.get('id', '')}"}
        )
        if profiles:
            name = profiles[0].get("display_name") or name
            role = profiles[0].get("role") or role
    except SupabaseError:
        pass  # login continua válido mesmo se não conseguirmos ler o papel agora

    return {
        "success": True,
        "message": "Login realizado com sucesso.",
        "user": {
            "id": user.get("id"),
            "email": normalized_email,
            "name": name,
            "role": role,
            "access_token": access_token,
            "refresh_token": details.get("refresh_token"),
        },
    }, 200


def recover_account(email: str, redirect_to: Optional[str]) -> Tuple[Dict[str, object], int]:
    """Envia o e-mail de redefinição de senha do Supabase."""
    normalized_email = (email or "").strip().lower()
    if not validate_email(normalized_email):
        return {"success": False, "message": "Digite um e-mail válido."}, 400

    ok, details, status = supabase_auth_request("recover", {"email": normalized_email}, redirect_to=redirect_to)
    if not ok:
        return {"success": False, "message": auth_error_message(details, "Não foi possível iniciar a recuperação.")}, (
            503 if status == 503 else 400
        )
    return {
        "success": True,
        "message": "Se o e-mail estiver cadastrado, você receberá o link de redefinição em instantes.",
    }, 200


def update_password(token: str, password: str) -> Tuple[Dict[str, object], int]:
    if not isinstance(password, str) or len(password) < 6:
        return {"success": False, "message": "A senha deve ter pelo menos 6 caracteres."}, 400
    if len(password) > 72:
        return {"success": False, "message": "A senha pode ter no máximo 72 caracteres."}, 400
    try:
        supabase_client.update_auth_user(token, {"password": password})
    except SupabaseError as error:
        if error.status in {401, 403}:
            return {"success": False, "message": "O link expirou. Peça um novo link de redefinição."}, 401
        return {"success": False, "message": error.message}, error.status or 400
    return {"success": True, "message": "Senha alterada! Faça login com a nova senha."}, 200


def list_instruments() -> Tuple[Dict[str, object], int]:
    """Lista os instrumentos disponíveis (usado no cadastro e no painel)."""
    try:
        rows = supabase_client.rest_select("instruments", None, {"select": "id,name,slug", "order": "name.asc"})
    except SupabaseError as error:
        return {"success": False, "message": error.message}, error.status
    return {"success": True, "instruments": rows}, 200


def set_primary_instrument(token: str, instrument_slug: str) -> Tuple[Dict[str, object], int]:
    """Define o instrumento principal do usuário autenticado.

    Não remove o acesso a outros instrumentos: apenas marca qual é o
    principal (is_primary) em profile_instruments.
    """
    slug = (instrument_slug or "").strip().lower()
    if not slug:
        return {"success": False, "message": "Escolha um instrumento."}, 400

    try:
        user = supabase_client.get_auth_user(token)
        user_id = user["id"]

        matches = supabase_client.rest_select("instruments", token, {"select": "id", "slug": f"eq.{slug}"})
        if not matches:
            return {"success": False, "message": "Instrumento inválido."}, 400
        instrument_id = matches[0]["id"]

        supabase_client.rest_update(
            "profile_instruments",
            token,
            {"profile_id": f"eq.{user_id}", "instrument_id": f"neq.{instrument_id}"},
            {"is_primary": False},
        )
        supabase_client.rest_upsert(
            "profile_instruments",
            token,
            [{"profile_id": user_id, "instrument_id": instrument_id, "is_primary": True}],
            on_conflict="profile_id,instrument_id",
        )
    except SupabaseError as error:
        return {"success": False, "message": error.message}, error.status

    return {"success": True, "message": "Instrumento principal atualizado."}, 200


def refresh_tokens(refresh_token: str) -> Tuple[Dict[str, object], int]:
    try:
        session = supabase_client.refresh_session(refresh_token)
    except SupabaseError as error:
        return {"success": False, "message": error.message}, 401 if error.status in {400, 401, 403} else error.status
    return {
        "success": True,
        "access_token": session.get("access_token"),
        "refresh_token": session.get("refresh_token"),
    }, 200


def logout(token: str) -> Tuple[Dict[str, object], int]:
    try:
        supabase_client.sign_out(token)
    except SupabaseError:
        pass  # token já expirado/revogado: para o usuário, o resultado é o mesmo
    return {"success": True, "message": "Sessão encerrada."}, 200


def current_user(token: str) -> Tuple[Dict[str, object], int]:
    """Quem é o dono do token, com o papel lido do banco (não do navegador)."""
    try:
        user = supabase_client.get_auth_user(token)
        profiles = supabase_client.rest_select(
            "profiles", token, {"select": "display_name,role", "id": f"eq.{user['id']}"}
        )
    except SupabaseError as error:
        return {"success": False, "message": error.message}, error.status
    profile = profiles[0] if profiles else {}
    email = (user.get("email") or "").lower()
    return {
        "success": True,
        "user": {
            "id": user["id"],
            "email": email,
            "name": profile.get("display_name") or email.split("@")[0].capitalize(),
            "role": profile.get("role") or "student",
        },
    }, 200


def admin_list_users(token: str) -> Tuple[Dict[str, object], int]:
    try:
        rows = supabase_client.rpc("admin_list_users", token) or []
    except SupabaseError as error:
        if error.status in {401, 403}:
            return {"success": False, "message": "Apenas administradores podem gerenciar usuários."}, 403
        return {"success": False, "message": error.message}, error.status
    return {"success": True, "users": rows}, 200


def admin_set_role(token: str, user_id: str, role: str) -> Tuple[Dict[str, object], int]:
    if not is_uuid(user_id):
        return {"success": False, "message": "Usuário não encontrado."}, 404
    if role not in VALID_ROLES:
        return {"success": False, "message": "Papel inválido."}, 400
    try:
        supabase_client.rpc("admin_set_user_role", token, {"p_user_id": user_id, "p_role": role})
    except SupabaseError as error:
        return {"success": False, "message": error.message}, error.status
    return {"success": True, "message": "Papel atualizado."}, 200


class LoginRequestHandler(BaseHTTPRequestHandler):
    """Serve o frontend estático e a API usada por ele."""

    FRONTEND_DIR = Path(__file__).resolve().parent.parent / "FrontEnd"
    STATIC_TYPES = {
        ".html": "text/html; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".js": "application/javascript; charset=utf-8",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".svg": "image/svg+xml",
        ".ico": "image/x-icon",
    }
    # Folga para os campos de texto do formulário além do arquivo em si.
    MAX_BODY_SIZE = (MAX_UPLOAD_MB + 1) * 1024 * 1024
    ALLOWED_METHODS = "GET, POST, PATCH, DELETE, OPTIONS"

    # ---------- utilitários ----------

    def _route(self) -> str:
        return self.path.split("?", 1)[0].rstrip("/") or "/"

    def _cors_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", self.ALLOWED_METHODS)
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")

    def _send_json(self, response: Dict[str, object], status: int = 200) -> None:
        body = json.dumps(response, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self._cors_headers()
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _bearer_token(self) -> str:
        return bearer_token_from_header(self.headers.get("Authorization", ""))

    def _require_token(self) -> str:
        token = self._bearer_token()
        if not token:
            self._send_json({"success": False, "message": "Sessão expirada. Faça login novamente."}, 401)
        return token

    def _read_request_body(self) -> Optional[bytes]:
        """Lê o corpo respeitando o limite de tamanho. None = já respondeu 413."""
        if self.headers.get("Transfer-Encoding", "").lower() == "chunked":
            chunks, total = [], 0
            while True:
                size_line = self.rfile.readline().strip()
                if not size_line:
                    continue
                size = int(size_line.split(b";", 1)[0], 16)
                if size == 0:
                    while self.rfile.readline().strip():
                        pass
                    break
                total += size
                if total > self.MAX_BODY_SIZE:
                    self._send_too_large()
                    return None
                chunks.append(self.rfile.read(size))
                self.rfile.read(2)
            return b"".join(chunks)

        try:
            content_length = int(self.headers.get("Content-Length", "0") or 0)
        except ValueError:
            content_length = 0
        if content_length > self.MAX_BODY_SIZE:
            self._send_too_large()
            return None
        return self.rfile.read(content_length) if content_length > 0 else b""

    def _send_too_large(self) -> None:
        self.close_connection = True
        self._send_json({"success": False, "message": f"O arquivo excede o limite de {MAX_UPLOAD_MB} MB."}, 413)

    def _parse_body(self) -> Optional[Tuple[Dict[str, Any], Optional[Tuple[str, bytes]]]]:
        raw_body = self._read_request_body()
        if raw_body is None:
            return None
        content_type = self.headers.get("Content-Type", "")
        upload = None
        payload: Dict[str, Any] = {}
        if content_type.startswith("multipart/form-data"):
            message = BytesParser(policy=policy.default).parsebytes(
                b"Content-Type: " + content_type.encode() + b"\r\n\r\n" + raw_body
            )
            for part in message.iter_parts():
                name = part.get_param("name", header="content-disposition")
                if name == "resource":
                    data = part.get_payload(decode=True) or b""
                    if part.get_filename() and data:
                        upload = (part.get_filename(), data)
                elif name:
                    raw_value = part.get_payload(decode=True) or b""
                    payload[name] = raw_value.decode(part.get_content_charset() or "utf-8", errors="replace")
        elif raw_body:
            try:
                parsed = json.loads(raw_body.decode("utf-8"))
                payload = parsed if isinstance(parsed, dict) else {}
            except (UnicodeDecodeError, json.JSONDecodeError):
                payload = {}
        return payload, upload

    def _serve_static(self, route: str) -> None:
        relative_path = "login.html" if route == "/" else route.lstrip("/")
        file_path = (self.FRONTEND_DIR / relative_path).resolve()
        if (
            self.FRONTEND_DIR not in file_path.parents
            or file_path.suffix not in self.STATIC_TYPES
            or not file_path.is_file()
        ):
            self._send_json({"success": False, "message": "Página não encontrada."}, 404)
            return
        body = file_path.read_bytes()
        self.send_response(200)
        self.send_header(
            "Content-Type",
            self.STATIC_TYPES.get(file_path.suffix, mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"),
        )
        # HTML/JS/CSS mudam a cada deploy: sem isso o navegador pode mostrar
        # uma versão antiga da tela depois de uma atualização.
        cache = "public, max-age=86400" if file_path.suffix in {".png", ".jpg", ".jpeg", ".svg", ".ico"} else "no-cache"
        self.send_header("Cache-Control", cache)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    # ---------- métodos HTTP ----------

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors_headers()
        self.end_headers()

    def do_GET(self):
        route = self._route()

        if route == "/instruments":
            self._send_json(*list_instruments())
            return

        authenticated_routes = {
            "/me": current_user,
            "/admin/content": list_content,
            "/admin/teachers": list_teachers,
            "/admin/users": admin_list_users,
        }
        if route in authenticated_routes:
            token = self._require_token()
            if not token:
                return
            handler = authenticated_routes[route]
            self._send_json(*handler(token))
            return

        self._serve_static(route)

    def do_POST(self):
        route = self._route()
        parsed = self._parse_body()
        if parsed is None:
            return
        payload, upload = parsed

        public_routes = {"/register", "/login", "/recover", "/refresh"}
        token = ""
        if route not in public_routes:
            token = self._require_token()
            if not token:
                return

        if route == "/register":
            response, status = register_user(
                payload.get("name", ""),
                payload.get("email", ""),
                payload.get("password", ""),
                payload.get("instrument_slug", ""),
                _safe_redirect(payload.get("redirect_to")),
            )
        elif route == "/login":
            response, status = authenticate_user(payload.get("email", ""), payload.get("password", ""))
        elif route == "/recover":
            response, status = recover_account(payload.get("email", ""), _safe_redirect(payload.get("redirect_to")))
        elif route == "/refresh":
            response, status = refresh_tokens(payload.get("refresh_token", ""))
        elif route == "/logout":
            response, status = logout(token)
        elif route == "/password":
            response, status = update_password(token, payload.get("password", ""))
        elif route == "/homepage":
            response = get_homepage_data(token)
            status = 200 if response.get("success") else int(response.pop("status", 500) or 500)
        elif route == "/profile/instrument":
            response, status = set_primary_instrument(token, payload.get("instrument_slug", ""))
        elif route.startswith("/content/") and route.endswith("/complete"):
            content_id = route[len("/content/"):-len("/complete")]
            if not is_uuid(content_id):
                response, status = {"success": False, "message": "Conteúdo não encontrado."}, 404
            else:
                response = complete_content(token, content_id)
                status = 200 if response.get("success") else int(response.pop("status", 500) or 500)
        elif route == "/admin/content":
            response, status = create_content(token, payload, upload)
        elif route.startswith("/admin/users/") and route.endswith("/role"):
            user_id = route[len("/admin/users/"):-len("/role")]
            response, status = admin_set_role(token, user_id, str(payload.get("role", "")))
        else:
            response, status = {"success": False, "message": "Rota não encontrada."}, 404

        self._send_json(response, status)

    def do_PATCH(self):
        route = self._route()
        prefix = "/admin/content/"
        if not route.startswith(prefix):
            self._send_json({"success": False, "message": "Rota não encontrada."}, 404)
            return
        parsed = self._parse_body()
        if parsed is None:
            return
        token = self._require_token()
        if not token:
            return
        payload, upload = parsed
        self._send_json(*update_content(token, route[len(prefix):], payload, upload))

    def do_DELETE(self):
        route = self._route()
        prefix = "/admin/content/"
        if not route.startswith(prefix):
            self._send_json({"success": False, "message": "Rota não encontrada."}, 404)
            return
        token = self._require_token()
        if not token:
            return
        self._send_json(*delete_content(token, route[len(prefix):]))

    def log_message(self, format, *args):
        return


def run_server(host: str = "0.0.0.0", port: Optional[int] = None):
    port = port or int(os.getenv("PORT", "8001"))
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        print("AVISO: SUPABASE_URL/SUPABASE_ANON_KEY não configurados — copie .env.example para .env.")
    server = ThreadingHTTPServer((host, port), LoginRequestHandler)
    print(f"The Instrumentalist rodando em http://localhost:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor encerrado.")


if __name__ == "__main__":
    run_server()

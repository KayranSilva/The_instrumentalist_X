import json
import os
import re
import mimetypes
import uuid
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from email import policy
from email.parser import BytesParser
from pathlib import Path
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any, Dict

from content import create_content, delete_content, is_admin_key_valid, list_content
from homepage import get_homepage_data


SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")


def validate_email(email: str) -> bool:
    """Valida um e-mail simples."""
    if not isinstance(email, str):
        return False

    email = email.strip()
    pattern = r"^[^\s@]+@[^\s@]+\.[^\s@]+$"
    return bool(re.fullmatch(pattern, email))


def supabase_auth_request(path: str, payload: Dict[str, Any]) -> tuple[bool, Dict[str, Any], int]:
    """Chama o Auth REST do Supabase sem persistir credenciais no backend."""
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        return False, {"message": "Configure SUPABASE_URL e SUPABASE_ANON_KEY no ambiente."}, 503

    request = Request(
        f"{SUPABASE_URL}/auth/v1/{path}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=10) as response:
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
        return False, {"message": "Não foi possível conectar ao banco de dados."}, 503


def auth_error_message(details: Dict[str, Any], default: str) -> str:
    return str(details.get("error_description") or details.get("msg") or details.get("message") or default)


def register_user(name: str, email: str, password: str) -> Dict[str, object]:
    """Cria a conta no Supabase Auth; o trigger cria o perfil relacionado."""
    normalized_email = (email or "").strip().lower()
    normalized_name = (name or "").strip()
    if not normalized_name or len(normalized_name) > 80:
        return {"success": False, "message": "Informe um nome válido."}
    if not validate_email(normalized_email):
        return {"success": False, "message": "E-mail inválido."}
    if not isinstance(password, str) or len(password) < 6:
        return {"success": False, "message": "A senha deve ter pelo menos 6 caracteres."}

    ok, details, status = supabase_auth_request("signup", {
        "email": normalized_email,
        "password": password,
        "data": {"name": normalized_name},
    })
    if not ok:
        message = auth_error_message(details, "Não foi possível criar a conta.")
        if status in {400, 422} and "already" in message.lower():
            message = "Este e-mail já está cadastrado."
        return {"success": False, "message": message}

    has_session = bool(details.get("access_token"))
    return {
        "success": True,
        "requires_confirmation": not has_session,
        "message": "Conta criada com sucesso." if has_session else "Conta criada. Confirme seu e-mail para entrar.",
        "user": {"email": normalized_email, "name": normalized_name} if has_session else None,
    }


def authenticate_user(email: str, password: str, remember: bool = False) -> Dict[str, object]:
    """Autentica o usuário usando o Supabase Auth."""
    normalized_email = (email or "").strip().lower()

    if not validate_email(normalized_email):
        return {"success": False, "message": "E-mail inválido."}

    if not isinstance(password, str) or len(password.strip()) < 6:
        return {"success": False, "message": "Senha inválida."}

    ok, details, status = supabase_auth_request("token?grant_type=password", {"email": normalized_email, "password": password})
    if not ok:
        if status == 400:
            return {"success": False, "message": auth_error_message(details, "E-mail ou senha inválidos.")}
        return {"success": False, "message": auth_error_message(details, "Não foi possível realizar o login.")}

    user = details.get("user") or {}
    metadata = user.get("user_metadata") or {}
    name = metadata.get("name") or normalized_email.split("@", 1)[0].capitalize()

    return {
        "success": True,
        "message": "Login realizado com sucesso.",
        "user": {
            "email": normalized_email,
            "name": name,
            "remember": remember,
            "access_token": details.get("access_token"),
            "refresh_token": details.get("refresh_token"),
        },
    }


def recover_account(email: str) -> Dict[str, object]:
    """Simula recuperação de senha/login."""
    normalized_email = (email or "").strip().lower()

    if not validate_email(normalized_email):
        return {"success": False, "message": "Digite um e-mail válido."}

    ok, details, _ = supabase_auth_request("recover", {"email": normalized_email})
    if not ok:
        return {"success": False, "message": auth_error_message(details, "Não foi possível iniciar a recuperação.")}

    return {
        "success": True,
        "message": "Se o e-mail existir, as instruções de recuperação serão enviadas em instantes.",
    }


class LoginRequestHandler(BaseHTTPRequestHandler):
    """Servidor mínimo para receber as requisições do formulário."""

    FRONTEND_DIR = Path(__file__).resolve().parent.parent / "FrontEnd"
    STATIC_TYPES = {
        ".html": "text/html; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".js": "application/javascript; charset=utf-8",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".svg": "image/svg+xml",
    }
    MAX_UPLOAD_SIZE = 100 * 1024 * 1024
    UPLOAD_EXTENSIONS = {".mp4", ".webm", ".mov", ".mp3", ".wav", ".ogg", ".pdf", ".png", ".jpg", ".jpeg"}

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Admin-Key")
        self.end_headers()

    def _send_json(self, response: Dict[str, object], status: int = 200):
        body = json.dumps(response, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Admin-Key")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _require_admin(self) -> bool:
        if is_admin_key_valid(self.headers.get("X-Admin-Key", "")):
            return True
        self._send_json({"success": False, "message": "Acesso administrativo não autorizado."}, 401)
        return False

    def _read_request_body(self) -> bytes:
        if self.headers.get("Transfer-Encoding", "").lower() != "chunked":
            content_length = int(self.headers.get("Content-Length", "0"))
            return self.rfile.read(content_length)

        chunks = []
        while True:
            size_line = self.rfile.readline().strip()
            if not size_line:
                continue
            size = int(size_line.split(b";", 1)[0], 16)
            if size == 0:
                while self.rfile.readline().strip():
                    pass
                break
            chunks.append(self.rfile.read(size))
            self.rfile.read(2)
        return b"".join(chunks)

    def do_GET(self):
        if self.path == "/admin/content":
            if not self._require_admin():
                return
            self._send_json({"success": True, "content": list_content()})
            return

        requested_path = self.path.split("?", 1)[0]
        relative_path = "admin.html" if requested_path in {"", "/"} else requested_path.lstrip("/")
        file_path = (self.FRONTEND_DIR / relative_path).resolve()
        if requested_path.startswith("/uploads/"):
            file_path = (self.FRONTEND_DIR / requested_path.lstrip("/")).resolve()
        allowed_static = file_path.suffix in self.STATIC_TYPES or requested_path.startswith("/uploads/")
        if self.FRONTEND_DIR not in file_path.parents or not allowed_static or not file_path.is_file():
            self._send_json({"success": False, "message": "Arquivo não encontrado."}, 404)
            return
        body = file_path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", self.STATIC_TYPES.get(file_path.suffix, mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        raw_body = self._read_request_body()
        if len(raw_body) > self.MAX_UPLOAD_SIZE:
            self._send_json({"success": False, "message": "O arquivo excede o limite de 100 MB."}, 413)
            return
        content_type = self.headers.get("Content-Type", "")
        upload = None
        if content_type.startswith("multipart/form-data"):
            message = BytesParser(policy=policy.default).parsebytes(b"Content-Type: " + content_type.encode() + b"\r\n\r\n" + raw_body)
            payload = {}
            for part in message.iter_parts():
                name = part.get_param("name", header="content-disposition")
                if name == "resource" and part.get_filename():
                    upload = (part.get_filename(), part.get_payload(decode=True) or b"")
                elif name:
                    raw_value = part.get_payload(decode=True) or b""
                    payload[name] = raw_value.decode(part.get_content_charset() or "utf-8", errors="replace")
        else:
            try:
                payload = json.loads(raw_body.decode("utf-8")) if raw_body else {}
            except (UnicodeDecodeError, json.JSONDecodeError):
                payload = {}

        if self.path == "/register":
            response = register_user(payload.get("name", ""), payload.get("email", ""), payload.get("password", ""))
            status = 201 if response["success"] else (503 if "ambiente" in response.get("message", "") else 400)
        elif self.path == "/login":
            response = authenticate_user(
                payload.get("email", ""),
                payload.get("password", ""),
                bool(payload.get("remember", False)),
            )
            status = 200 if response["success"] else 401
        elif self.path == "/recover":
            response = recover_account(payload.get("email", ""))
            status = 200 if response["success"] else 404
        elif self.path == "/homepage":
            email = payload.get("email", "")
            if not email:
                self._send_json({"success": False, "message": "Usuário não autenticado."}, 401)
                return
            response = get_homepage_data(email)
            status = 200 if response.get("success") else 500
        elif self.path == "/admin/content":
            if not self._require_admin():
                return
            if payload.get("type") in {"aula", "partitura"}:
                if not upload or not upload[0]:
                    message = "Selecione um arquivo PDF para a partitura." if payload.get("type") == "partitura" else "Selecione um arquivo para a aula."
                    self._send_json({"success": False, "message": message}, 400)
                    return
                extension = Path(upload[0]).suffix.lower()
                if extension not in self.UPLOAD_EXTENSIONS:
                    self._send_json({"success": False, "message": "Formato de arquivo não permitido."}, 400)
                    return
                if payload.get("type") == "partitura" and extension != ".pdf":
                    self._send_json({"success": False, "message": "A partitura deve estar em formato PDF."}, 400)
                    return
                upload_name = f"{uuid.uuid4().hex}{extension}"
                upload_dir = self.FRONTEND_DIR / "uploads"
                upload_dir.mkdir(parents=True, exist_ok=True)
                (upload_dir / upload_name).write_bytes(upload[1])
                payload["url"] = f"/uploads/{upload_name}"
            response = create_content(payload)
            status = 201 if response.get("success") else 400
        else:
            response = {"success": False, "message": "Rota não encontrada."}
            status = 404

        self._send_json(response, status)

    def do_DELETE(self):
        if not self._require_admin():
            return
        prefix = "/admin/content/"
        if not self.path.startswith(prefix):
            self._send_json({"success": False, "message": "Rota não encontrada."}, 404)
            return
        response = delete_content(self.path[len(prefix):])
        self._send_json(response, 200 if response["success"] else 404)

    def log_message(self, format, *args):
        return


def run_server(host: str = "0.0.0.0", port: int = 8001):
    server = HTTPServer((host, port), LoginRequestHandler)
    print(f"Servidor de login rodando em http://{host}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    run_server()

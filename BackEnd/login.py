import json
import re
import mimetypes
import uuid
from email import policy
from email.parser import BytesParser
from pathlib import Path
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Dict

from content import create_content, delete_content, is_admin_key_valid, list_content
from homepage import get_homepage_data


USER_DB: Dict[str, Dict[str, str]] = {
    "marina@theinstrumentalist.com": {
        "password": "usuario123",
        "name": "Marina",
    }
}


def validate_email(email: str) -> bool:
    """Valida um e-mail simples."""
    if not isinstance(email, str):
        return False

    email = email.strip()
    pattern = r"^[^\s@]+@[^\s@]+\.[^\s@]+$"
    return bool(re.fullmatch(pattern, email))


def authenticate_user(email: str, password: str, remember: bool = False) -> Dict[str, object]:
    """Valida os dados do login e retorna um payload simples."""
    normalized_email = (email or "").strip().lower()

    if not validate_email(normalized_email):
        return {"success": False, "message": "E-mail inválido."}

    if not isinstance(password, str) or len(password.strip()) < 6:
        return {"success": False, "message": "Senha inválida."}

    user = USER_DB.get(normalized_email)
    if not user:
        return {"success": False, "message": "E-mail ou senha inválidos."}

    if user["password"] != password:
        return {"success": False, "message": "E-mail ou senha inválidos."}

    return {
        "success": True,
        "message": "Login realizado com sucesso.",
        "user": {
            "email": normalized_email,
            "name": user["name"],
            "remember": remember,
        },
    }


def recover_account(email: str) -> Dict[str, object]:
    """Simula recuperação de senha/login."""
    normalized_email = (email or "").strip().lower()

    if not validate_email(normalized_email):
        return {"success": False, "message": "Digite um e-mail válido."}

    if normalized_email not in USER_DB:
        return {"success": False, "message": "E-mail não encontrado."}

    return {
        "success": True,
        "message": f"Instruções de recuperação enviadas para {normalized_email}.",
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
        content_length = int(self.headers.get("Content-Length", "0"))
        if content_length > self.MAX_UPLOAD_SIZE:
            self._send_json({"success": False, "message": "O arquivo excede o limite de 100 MB."}, 413)
            return
        raw_body = self.rfile.read(content_length)
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
                    payload[name] = part.get_content()
        else:
            try:
                payload = json.loads(raw_body.decode("utf-8")) if raw_body else {}
            except (UnicodeDecodeError, json.JSONDecodeError):
                payload = {}

        if self.path == "/login":
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
            email = payload.get("email") or "marina@theinstrumentalist.com"
            response = get_homepage_data(email)
            status = 200 if response.get("success") else 500
        elif self.path == "/admin/content":
            if not self._require_admin():
                return
            if payload.get("type") == "aula":
                if not upload or not upload[0]:
                    self._send_json({"success": False, "message": "Selecione um arquivo para a aula."}, 400)
                    return
                extension = Path(upload[0]).suffix.lower()
                if extension not in self.UPLOAD_EXTENSIONS:
                    self._send_json({"success": False, "message": "Formato de arquivo não permitido."}, 400)
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

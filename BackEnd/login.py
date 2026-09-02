import json
import re
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Dict

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

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(content_length).decode("utf-8")

        try:
            payload = json.loads(raw_body) if raw_body else {}
        except json.JSONDecodeError:
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
        else:
            response = {"success": False, "message": "Rota não encontrada."}
            status = 404

        body = json.dumps(response).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        return


def run_server(host: str = "127.0.0.1", port: int = 8001):
    server = HTTPServer((host, port), LoginRequestHandler)
    print(f"Servidor de login rodando em http://{host}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    run_server()

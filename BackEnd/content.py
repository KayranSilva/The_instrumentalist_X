import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional


DATA_FILE = Path(__file__).with_name("content.json")
ADMIN_KEY = os.getenv("INSTRUMENTALIST_ADMIN_KEY", "admin123")
CONTENT_TYPES = {"musica", "partitura", "aula"}
UPLOAD_DIR = Path(__file__).resolve().parent.parent / "FrontEnd" / "uploads"

DEFAULT_CONTENT: List[Dict[str, Any]] = [
    {
        "id": "music-1",
        "type": "musica",
        "title": "Valsa em dó maior",
        "instrument": "Piano",
        "description": "Uma peça curta para praticar dinâmica e articulação.",
        "url": "https://www.youtube.com/watch?v=demo",
        "teacher": "Bianca Rocha",
        "duration": "03:42",
        "level": "Iniciante",
        "created_at": "2026-09-01T12:00:00+00:00",
    },
    {
        "id": "score-1",
        "type": "partitura",
        "title": "Estudo de arpejos",
        "instrument": "Violão",
        "description": "Partitura em PDF para estudar arpejos em 6/8.",
        "url": "https://example.com/estudo-de-arpejos.pdf",
        "teacher": "Rafael Nunes",
        "duration": "",
        "level": "Intermediário",
        "created_at": "2026-08-28T12:00:00+00:00",
    },
    {
        "id": "lesson-1",
        "type": "aula",
        "title": "Dedilhado com métrica 6/8",
        "instrument": "Violão",
        "description": "Aprenda a manter a pulsação e trocar os baixos com segurança.",
        "url": "https://www.youtube.com/watch?v=demo2",
        "teacher": "Rafael Nunes",
        "duration": "14:20",
        "level": "Iniciante",
        "created_at": "2026-08-25T12:00:00+00:00",
    },
]


def _save(items: List[Dict[str, Any]]) -> None:
    DATA_FILE.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")


def _load() -> List[Dict[str, Any]]:
    if not DATA_FILE.exists():
        _save(DEFAULT_CONTENT)
    try:
        data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except (OSError, json.JSONDecodeError):
        return list(DEFAULT_CONTENT)


def list_content(content_type: Optional[str] = None) -> List[Dict[str, Any]]:
    items = _load()
    if content_type in CONTENT_TYPES:
        items = [item for item in items if item.get("type") == content_type]
    return sorted(items, key=lambda item: item.get("created_at", ""), reverse=True)


def create_content(payload: Dict[str, Any]) -> Dict[str, Any]:
    content_type = str(payload.get("type", "")).strip().lower()
    title = str(payload.get("title", "")).strip()
    instrument = str(payload.get("instrument", "")).strip()
    url = str(payload.get("url", "")).strip()

    if content_type not in CONTENT_TYPES:
        return {"success": False, "message": "Escolha um tipo de conteúdo válido."}
    if not title or not instrument:
        return {"success": False, "message": "Título e instrumento são obrigatórios."}
    if content_type == "aula" and not url:
        return {"success": False, "message": "Selecione um arquivo para a aula."}
    if content_type == "partitura" and (not url or not url.startswith(("http://", "https://", "/uploads/"))):
        return {"success": False, "message": "Selecione um arquivo PDF ou informe um link válido."}
    if content_type == "musica" and (not url or not url.startswith(("http://", "https://"))):
        return {"success": False, "message": "Título, instrumento e link válido são obrigatórios."}

    item = {
        "id": f"{content_type}-{uuid.uuid4().hex[:8]}",
        "type": content_type,
        "title": title,
        "instrument": instrument,
        "description": str(payload.get("description", "")).strip(),
        "url": url,
        "teacher": str(payload.get("teacher", "")).strip(),
        "duration": str(payload.get("duration", "")).strip(),
        "level": str(payload.get("level", "Iniciante")).strip() or "Iniciante",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    items = _load()
    items.append(item)
    _save(items)
    return {"success": True, "message": "Conteúdo publicado com sucesso.", "content": item}


def delete_content(content_id: str) -> Dict[str, Any]:
    items = _load()
    filtered = [item for item in items if item.get("id") != content_id]
    if len(filtered) == len(items):
        return {"success": False, "message": "Conteúdo não encontrado."}
    _save(filtered)
    return {"success": True, "message": "Conteúdo removido."}


def is_admin_key_valid(value: str) -> bool:
    return bool(value) and value == ADMIN_KEY

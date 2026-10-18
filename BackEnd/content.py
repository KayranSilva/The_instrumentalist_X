import mimetypes
import os
import re
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import parse_qs, urlparse

import supabase_client
from supabase_client import SupabaseError

STORAGE_BUCKET = "lesson-assets"
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "50"))

# Tipos usados na UI do painel <-> enum content_type do banco.
TYPE_UI_TO_DB = {"aula": "lesson", "musica": "song", "partitura": "score"}
TYPE_DB_TO_UI = {value: key for key, value in TYPE_UI_TO_DB.items()}

# Nível mostrado na UI (pt-BR) <-> valor guardado no banco (mesmo padrão do
# default da coluna, 'beginner', para ficar consistente com os dados de seed).
LEVEL_UI_TO_DB = {"Iniciante": "beginner", "Intermediário": "intermediate", "Avançado": "advanced"}
LEVEL_DB_TO_UI = {value: key for key, value in LEVEL_UI_TO_DB.items()}

VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov"}
AUDIO_EXTENSIONS = {".mp3", ".wav", ".ogg"}
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg"}
UPLOAD_EXTENSIONS = VIDEO_EXTENSIONS | AUDIO_EXTENSIONS | IMAGE_EXTENSIONS | {".pdf"}
LESSON_EXTENSIONS = VIDEO_EXTENSIONS | AUDIO_EXTENSIONS

UUID_PATTERN = re.compile(r"^[0-9a-fA-F-]{36}$")
YOUTUBE_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{11}$")

CONTENT_SELECT = (
    "id,type,title,description,level,duration_seconds,external_url,instructor_name,"
    "author_id,published,created_at,instruments(name,slug)"
)


def is_uuid(value: str) -> bool:
    return bool(UUID_PATTERN.match(value or ""))


def describe_media(url: str) -> Dict[str, str]:
    """Diz como o player da home deve exibir uma URL de conteúdo.

    kind: video | audio | pdf | image | youtube | vimeo | link
    embed_url: URL pronta para <iframe> (YouTube/Vimeo/PDF) ou para <video>/<audio>.
    """
    url = (url or "").strip()
    if not url:
        return {"kind": "none", "embed_url": ""}
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower().removeprefix("www.").removeprefix("m.")
    extension = Path(parsed.path).suffix.lower()

    if host in {"youtube.com", "youtube-nocookie.com"}:
        video_id = parse_qs(parsed.query).get("v", [""])[0]
        if not video_id and parsed.path.startswith(("/embed/", "/shorts/", "/live/")):
            video_id = parsed.path.split("/")[2]
        if YOUTUBE_ID_PATTERN.match(video_id):
            return {"kind": "youtube", "embed_url": f"https://www.youtube-nocookie.com/embed/{video_id}"}
    if host == "youtu.be":
        video_id = parsed.path.lstrip("/").split("/")[0]
        if YOUTUBE_ID_PATTERN.match(video_id):
            return {"kind": "youtube", "embed_url": f"https://www.youtube-nocookie.com/embed/{video_id}"}
    if host in {"vimeo.com", "player.vimeo.com"}:
        numeric = [part for part in parsed.path.split("/") if part.isdigit()]
        if numeric:
            return {"kind": "vimeo", "embed_url": f"https://player.vimeo.com/video/{numeric[0]}"}

    if extension in VIDEO_EXTENSIONS:
        return {"kind": "video", "embed_url": url}
    if extension in AUDIO_EXTENSIONS:
        return {"kind": "audio", "embed_url": url}
    if extension == ".pdf":
        return {"kind": "pdf", "embed_url": url}
    if extension in IMAGE_EXTENSIONS:
        return {"kind": "image", "embed_url": url}
    return {"kind": "link", "embed_url": url}


def duration_to_seconds(value: str) -> Tuple[bool, Optional[int]]:
    """Converte 'mm:ss' ou 'hh:mm:ss' em segundos. Devolve (válido, segundos)."""
    value = (value or "").strip()
    if not value:
        return True, None
    parts = value.split(":")
    if len(parts) > 3 or not all(part.isdigit() for part in parts):
        return False, None
    numbers = [int(part) for part in parts]
    if any(number >= 60 for number in numbers[1:]):
        return False, None
    seconds = 0
    for number in numbers:
        seconds = seconds * 60 + number
    return True, seconds


def seconds_to_duration(value: Optional[int]) -> str:
    if not value:
        return ""
    hours, rest = divmod(int(value), 3600)
    minutes, seconds = divmod(rest, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{seconds:02d}"
    return f"{minutes:02d}:{seconds:02d}"


def level_label(level: Optional[str]) -> str:
    return LEVEL_DB_TO_UI.get(level or "", "Iniciante")


def _friendly_error(error: SupabaseError, fallback: str) -> Tuple[Dict[str, Any], int]:
    if error.status == 403:
        return {"success": False, "message": "Você não tem permissão para esta ação."}, 403
    if error.status == 401:
        return {"success": False, "message": "Sessão expirada. Faça login novamente."}, 401
    return {"success": False, "message": error.message or fallback}, error.status or 400


def _serialize(row: Dict[str, Any]) -> Dict[str, Any]:
    instrument = row.get("instruments") or {}
    return {
        "id": row["id"],
        "type": TYPE_DB_TO_UI.get(row.get("type"), "aula"),
        "title": row.get("title", ""),
        "instrument": instrument.get("name", ""),
        "instrument_slug": instrument.get("slug", ""),
        "description": row.get("description", ""),
        "url": row.get("external_url") or "",
        "teacher": row.get("instructor_name") or "",
        "teacher_id": row.get("author_id") or "",
        "duration": seconds_to_duration(row.get("duration_seconds")),
        "level": level_label(row.get("level")),
        "published": bool(row.get("published")),
        "created_at": row.get("created_at", ""),
    }


def list_content(token: str) -> Tuple[Dict[str, Any], int]:
    try:
        rows = supabase_client.rest_select(
            "content_items", token, {"select": CONTENT_SELECT, "order": "created_at.desc"}
        )
    except SupabaseError as error:
        return _friendly_error(error, "Não foi possível carregar o catálogo.")
    return {"success": True, "content": [_serialize(row) for row in rows]}, 200


def list_teachers(token: str) -> Tuple[Dict[str, Any], int]:
    """Professores e administradores que podem assinar um conteúdo."""
    try:
        rows = supabase_client.rest_select(
            "profiles",
            token,
            {"select": "id,display_name,role", "role": "in.(teacher,admin)", "order": "display_name.asc"},
        )
    except SupabaseError as error:
        return _friendly_error(error, "Não foi possível carregar os professores.")
    teachers = [{"id": row["id"], "name": row.get("display_name") or "Sem nome", "role": row.get("role")} for row in rows]
    return {"success": True, "teachers": teachers}, 200


def _upload_to_storage(token: str, filename: str, data: bytes) -> Tuple[str, str, str, int]:
    extension = Path(filename).suffix.lower()
    object_path = f"{uuid.uuid4().hex}{extension}"
    content_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"
    supabase_client.upload_storage_object(STORAGE_BUCKET, token, object_path, data, content_type)
    public_url = f"{supabase_client.SUPABASE_URL}/storage/v1/object/public/{STORAGE_BUCKET}/{object_path}"
    return public_url, object_path, content_type, len(data)


def _asset_type(extension: str) -> str:
    if extension in VIDEO_EXTENSIONS:
        return "video"
    if extension in AUDIO_EXTENSIONS:
        return "audio"
    if extension == ".pdf":
        return "pdf"
    return "image"


def _validate_upload(content_type_ui: str, filename: str, data: bytes) -> Optional[str]:
    extension = Path(filename).suffix.lower()
    if not data:
        return "O arquivo enviado está vazio."
    if len(data) > MAX_UPLOAD_MB * 1024 * 1024:
        return f"O arquivo excede o limite de {MAX_UPLOAD_MB} MB."
    if extension not in UPLOAD_EXTENSIONS:
        return "Formato de arquivo não permitido."
    if content_type_ui == "aula" and extension not in LESSON_EXTENSIONS:
        return "A aula deve ser um arquivo de vídeo (MP4, WEBM, MOV) ou áudio (MP3, WAV, OGG)."
    if content_type_ui == "partitura" and extension != ".pdf":
        return "A partitura deve estar em formato PDF."
    return None


def _store_upload(token: str, content_item_id: str, filename: str, data: bytes) -> str:
    """Envia o arquivo e registra em content_assets. Devolve a URL pública."""
    public_url, object_path, mime_type, file_size = _upload_to_storage(token, filename, data)
    try:
        supabase_client.rest_upsert(
            "content_assets",
            token,
            [{
                "content_item_id": content_item_id,
                "storage_path": object_path,
                "asset_type": _asset_type(Path(filename).suffix.lower()),
                "mime_type": mime_type,
                "file_size": file_size,
            }],
        )
    except SupabaseError:
        pass  # o arquivo já está no Storage; o metadado é só informativo
    return public_url


def _asset_paths(token: str, content_item_id: str) -> List[str]:
    try:
        rows = supabase_client.rest_select(
            "content_assets", token, {"select": "storage_path", "content_item_id": f"eq.{content_item_id}"}
        )
    except SupabaseError:
        return []
    return [row["storage_path"] for row in rows if row.get("storage_path")]


def _remove_assets(token: str, content_item_id: str, keep: Optional[str] = None) -> None:
    """Apaga arquivos antigos do Storage (best effort: não falha a operação)."""
    paths = [path for path in _asset_paths(token, content_item_id) if path != keep]
    if not paths:
        return
    try:
        supabase_client.delete_storage_objects(STORAGE_BUCKET, token, paths)
        supabase_client.rest_delete(
            "content_assets", token,
            {"content_item_id": f"eq.{content_item_id}", "storage_path": f"in.({','.join(paths)})"},
        )
    except SupabaseError:
        pass


def _resolve_instrument(token: str, slug: str) -> Optional[str]:
    matches = supabase_client.rest_select("instruments", token, {"select": "id", "slug": f"eq.{slug}"})
    return matches[0]["id"] if matches else None


def _resolve_teacher(token: str, teacher_id: str) -> Optional[Dict[str, Any]]:
    if not is_uuid(teacher_id):
        return None
    rows = supabase_client.rest_select(
        "profiles", token, {"select": "id,display_name", "id": f"eq.{teacher_id}", "role": "in.(teacher,admin)"}
    )
    return rows[0] if rows else None


def _parse_bool(value: Any, default: bool = True) -> bool:
    if value is None or value == "":
        return default
    return str(value).strip().lower() in {"1", "true", "on", "yes", "sim"}


def _common_fields(
    token: str, payload: Dict[str, Any], content_type_ui: str
) -> Tuple[Optional[Dict[str, Any]], Optional[Tuple[Dict[str, Any], int]]]:
    """Valida os campos comuns de criação/edição e monta a linha do banco."""
    title = str(payload.get("title", "")).strip()
    instrument_slug = str(payload.get("instrument", "")).strip()
    teacher_id = str(payload.get("teacher_id", "")).strip()
    level_ui = str(payload.get("level", "Iniciante")).strip() or "Iniciante"
    description = str(payload.get("description", "")).strip()

    if not title or len(title) > 140:
        return None, ({"success": False, "message": "Informe um título de até 140 caracteres."}, 400)
    if len(description) > 2000:
        return None, ({"success": False, "message": "A descrição pode ter no máximo 2000 caracteres."}, 400)
    if not instrument_slug:
        return None, ({"success": False, "message": "Escolha o instrumento."}, 400)
    if level_ui not in LEVEL_UI_TO_DB:
        return None, ({"success": False, "message": "Escolha um nível válido."}, 400)
    if not teacher_id:
        return None, ({"success": False, "message": "Escolha o professor responsável."}, 400)

    valid_duration, duration_seconds = duration_to_seconds(str(payload.get("duration", "")))
    if not valid_duration:
        return None, ({"success": False, "message": "Duração inválida. Use o formato mm:ss (ex.: 12:40)."}, 400)

    try:
        instrument_id = _resolve_instrument(token, instrument_slug)
        teacher = _resolve_teacher(token, teacher_id)
    except SupabaseError as error:
        return None, _friendly_error(error, "Não foi possível validar o formulário.")
    if not instrument_id:
        return None, ({"success": False, "message": "Instrumento inválido."}, 400)
    if not teacher:
        return None, ({"success": False, "message": "Professor inválido."}, 400)

    row = {
        "title": title,
        "description": description,
        "instrument_id": instrument_id,
        "author_id": teacher["id"],
        "instructor_name": teacher.get("display_name") or None,
        "level": LEVEL_UI_TO_DB[level_ui],
        "duration_seconds": None if content_type_ui == "partitura" else duration_seconds,
        "published": _parse_bool(payload.get("published"), default=True),
    }
    return row, None


def _valid_link(url: str) -> bool:
    return url.startswith(("http://", "https://")) and len(url) <= 2000


def create_content(
    token: str,
    payload: Dict[str, Any],
    upload: Optional[Tuple[str, bytes]] = None,
) -> Tuple[Dict[str, Any], int]:
    content_type_ui = str(payload.get("type", "")).strip().lower()
    url = str(payload.get("url", "")).strip()

    if content_type_ui not in TYPE_UI_TO_DB:
        return {"success": False, "message": "Escolha um tipo de conteúdo válido."}, 400

    row, error_response = _common_fields(token, payload, content_type_ui)
    if error_response:
        return error_response

    if content_type_ui == "aula" and not upload and not _valid_link(url):
        return {"success": False, "message": "Envie o vídeo da aula ou informe um link válido (YouTube, Vimeo…)."}, 400
    if content_type_ui == "partitura" and not upload and not _valid_link(url):
        return {"success": False, "message": "Envie o PDF da partitura ou informe um link válido."}, 400
    if content_type_ui == "musica" and not _valid_link(url):
        return {"success": False, "message": "Informe um link válido para a música."}, 400
    if upload:
        message = _validate_upload(content_type_ui, *upload)
        if message:
            return {"success": False, "message": message}, 400

    row["type"] = TYPE_UI_TO_DB[content_type_ui]
    row["external_url"] = None if upload else url

    try:
        created = supabase_client.rest_upsert("content_items", token, [row])
    except SupabaseError as error:
        return _friendly_error(error, "Não foi possível salvar o conteúdo.")
    if not created:
        return {"success": False, "message": "Não foi possível salvar o conteúdo."}, 400
    content_item_id = created[0]["id"]

    if upload:
        try:
            public_url = _store_upload(token, content_item_id, *upload)
            supabase_client.rest_update(
                "content_items", token, {"id": f"eq.{content_item_id}"}, {"external_url": public_url}
            )
        except SupabaseError as error:
            # Sem arquivo o conteúdo não serve para nada: desfaz a criação.
            try:
                supabase_client.rest_delete("content_items", token, {"id": f"eq.{content_item_id}"})
            except SupabaseError:
                pass
            return _friendly_error(error, "Não foi possível enviar o arquivo.")

    message = "Conteúdo publicado com sucesso." if row["published"] else "Rascunho salvo. Ele ainda não aparece para os alunos."
    return {"success": True, "message": message, "id": content_item_id}, 201


def update_content(
    token: str,
    content_id: str,
    payload: Dict[str, Any],
    upload: Optional[Tuple[str, bytes]] = None,
) -> Tuple[Dict[str, Any], int]:
    if not is_uuid(content_id):
        return {"success": False, "message": "Conteúdo não encontrado."}, 404
    try:
        existing = supabase_client.rest_select(
            "content_items", token, {"select": "id,type,external_url", "id": f"eq.{content_id}"}
        )
    except SupabaseError as error:
        return _friendly_error(error, "Não foi possível carregar o conteúdo.")
    if not existing:
        return {"success": False, "message": "Conteúdo não encontrado."}, 404

    content_type_ui = TYPE_DB_TO_UI.get(existing[0].get("type"), "aula")
    row, error_response = _common_fields(token, payload, content_type_ui)
    if error_response:
        return error_response

    url = str(payload.get("url", "")).strip()
    if upload:
        message = _validate_upload(content_type_ui, *upload)
        if message:
            return {"success": False, "message": message}, 400
    elif url:
        if not _valid_link(url):
            return {"success": False, "message": "Informe um link válido (começando com https://)."}, 400
        row["external_url"] = url
    elif content_type_ui == "musica" or not existing[0].get("external_url"):
        return {"success": False, "message": "Informe um link válido ou envie um arquivo."}, 400

    try:
        if upload:
            row["external_url"] = _store_upload(token, content_id, *upload)
        updated = supabase_client.rest_update("content_items", token, {"id": f"eq.{content_id}"}, row)
    except SupabaseError as error:
        return _friendly_error(error, "Não foi possível salvar as alterações.")
    if not updated:
        return {"success": False, "message": "Você não tem permissão para editar este conteúdo."}, 403

    # Arquivo novo ou link novo substituem o arquivo antigo do Storage.
    if upload or (url and url != existing[0].get("external_url")):
        new_url = row["external_url"]
        keep = new_url.rsplit("/", 1)[-1] if upload else None
        _remove_assets(token, content_id, keep=keep)

    return {"success": True, "message": "Alterações salvas."}, 200


def delete_content(token: str, content_id: str) -> Tuple[Dict[str, Any], int]:
    if not is_uuid(content_id):
        return {"success": False, "message": "Conteúdo não encontrado."}, 404
    paths = _asset_paths(token, content_id)
    try:
        supabase_client.rest_delete("content_items", token, {"id": f"eq.{content_id}"})
    except SupabaseError as error:
        return _friendly_error(error, "Não foi possível remover o conteúdo.")
    if paths:
        try:
            supabase_client.delete_storage_objects(STORAGE_BUCKET, token, paths)
        except SupabaseError:
            pass  # o conteúdo já saiu do catálogo; arquivo órfão não quebra nada
    return {"success": True, "message": "Conteúdo removido."}, 200

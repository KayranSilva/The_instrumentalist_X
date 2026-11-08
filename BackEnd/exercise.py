"""Gabarito de notas das aulas com reconhecimento de áudio (lesson_exercises).

A detecção das notas roda no navegador (FrontEnd/src/pitch.ts); aqui só
validamos e gravamos o gabarito revisado pelo professor. Como no resto do
backend, o token do usuário é repassado ao Supabase e o RLS decide.
"""

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

import supabase_client
from content import (
    LESSON_EXTENSIONS, MAX_UPLOAD_MB, STORAGE_BUCKET, _asset_type, _friendly_error, _upload_to_storage, is_uuid,
)
from supabase_client import SupabaseError

NOTE_PATTERN = re.compile(r"^(C|C#|D|D#|E|F|F#|G|G#|A|A#|B)[0-8]$")
MAX_NOTES = 200
STORAGE_MARKER = f"/storage/v1/object/public/{STORAGE_BUCKET}/"
REFERENCE_MODES = {"keep", "main", "upload"}


def _public_url(storage_path: str) -> str:
    return f"{supabase_client.SUPABASE_URL}{STORAGE_MARKER}{storage_path}"


def _main_storage_path(external_url: Optional[str]) -> Optional[str]:
    """Caminho no Storage do arquivo principal da aula (None se for link)."""
    url = external_url or ""
    return url.split(STORAGE_MARKER, 1)[1] if STORAGE_MARKER in url else None


def exercise_ids(token: str) -> Set[str]:
    """IDs das aulas com gabarito visíveis para o usuário (vazio se a migration não existir)."""
    try:
        rows = supabase_client.rest_select("lesson_exercises", token, {"select": "content_item_id"})
    except SupabaseError:
        return set()
    return {row["content_item_id"] for row in rows if row.get("content_item_id")}


def parse_notes(raw: Any) -> Tuple[Optional[List[str]], Optional[str]]:
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            return None, "Gabarito inválido."
    if not isinstance(raw, list) or not raw:
        return None, "O gabarito precisa ter pelo menos uma nota."
    if len(raw) > MAX_NOTES:
        return None, f"O gabarito pode ter no máximo {MAX_NOTES} notas."
    notes = [str(note).strip() for note in raw]
    invalid = next((note for note in notes if not NOTE_PATTERN.match(note)), None)
    if invalid is not None:
        return None, f"Nota inválida no gabarito: \"{invalid}\". Use o formato A3, C#4…"
    return notes, None


def _load(token: str, content_id: str) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """Devolve (aula, gabarito) — qualquer um pode ser None."""
    items = supabase_client.rest_select(
        "content_items", token,
        {"select": "id,type,title,published,external_url,instruments(name,slug)", "id": f"eq.{content_id}"},
    )
    exercises = supabase_client.rest_select(
        "lesson_exercises", token,
        {"select": "notes,reference_asset_id,content_assets(storage_path)", "content_item_id": f"eq.{content_id}"},
    )
    return (items[0] if items else None), (exercises[0] if exercises else None)


def get_exercise(token: str, content_id: str) -> Tuple[Dict[str, Any], int]:
    not_found = {"success": False, "message": "Esta aula não tem exercício com reconhecimento de áudio."}, 404
    if not is_uuid(content_id):
        return not_found
    try:
        item, exercise = _load(token, content_id)
    except SupabaseError as error:
        return _friendly_error(error, "Não foi possível carregar o exercício.")
    if not item or not exercise or item.get("type") != "lesson":
        return not_found
    asset = exercise.get("content_assets") or {}
    instrument = item.get("instruments") or {}
    return {
        "success": True,
        "notes": exercise.get("notes") or [],
        "reference_url": _public_url(asset["storage_path"]) if asset.get("storage_path") else None,
        "title": item.get("title") or "",
        "published": bool(item.get("published")),
        "instrument_slug": instrument.get("slug") or "",
        "instrument_name": instrument.get("name") or "",
    }, 200


def _validate_reference(filename: str, data: bytes) -> Optional[str]:
    if not data:
        return "O áudio de referência está vazio."
    if len(data) > MAX_UPLOAD_MB * 1024 * 1024:
        return f"O áudio de referência excede o limite de {MAX_UPLOAD_MB} MB."
    if Path(filename).suffix.lower() not in LESSON_EXTENSIONS:
        return "O áudio de referência deve ser MP3, WAV, OGG, MP4, WEBM ou MOV."
    return None


def _store_reference(token: str, content_id: str, filename: str, data: bytes) -> str:
    """Envia o áudio de referência extra e devolve o id do content_asset."""
    _, object_path, mime_type, file_size = _upload_to_storage(token, filename, data)
    rows = supabase_client.rest_upsert("content_assets", token, [{
        "content_item_id": content_id,
        "storage_path": object_path,
        "asset_type": _asset_type(Path(filename).suffix.lower()),
        "mime_type": mime_type,
        "file_size": file_size,
    }])
    if not rows:
        supabase_client.delete_storage_objects(STORAGE_BUCKET, token, [object_path])
        raise SupabaseError("Não foi possível registrar o áudio de referência.", 400)
    return rows[0]["id"]


def _main_asset_id(token: str, content_id: str, external_url: Optional[str]) -> Optional[str]:
    path = _main_storage_path(external_url)
    if not path:
        return None
    rows = supabase_client.rest_select(
        "content_assets", token,
        {"select": "id", "content_item_id": f"eq.{content_id}", "storage_path": f"eq.{path}"},
    )
    return rows[0]["id"] if rows else None


def _discard_reference(token: str, exercise: Optional[Dict[str, Any]], external_url: Optional[str], keep_id: Optional[str]) -> None:
    """Apaga o áudio de referência antigo, a menos que seja o arquivo da aula (best effort)."""
    if not exercise or not exercise.get("reference_asset_id") or exercise["reference_asset_id"] == keep_id:
        return
    path = (exercise.get("content_assets") or {}).get("storage_path")
    if not path or path == _main_storage_path(external_url):
        return
    try:
        supabase_client.delete_storage_objects(STORAGE_BUCKET, token, [path])
        supabase_client.rest_delete("content_assets", token, {"id": f"eq.{exercise['reference_asset_id']}"})
    except SupabaseError:
        pass


def save_exercise(
    token: str, content_id: str, payload: Dict[str, Any], upload: Optional[Tuple[str, bytes]] = None,
) -> Tuple[Dict[str, Any], int]:
    """PUT: grava o gabarito. `reference` = keep | main | upload (arquivo em `resource`)."""
    if not is_uuid(content_id):
        return {"success": False, "message": "Aula não encontrada."}, 404
    notes, problem = parse_notes(payload.get("notes"))
    if problem:
        return {"success": False, "message": problem}, 400
    mode = str(payload.get("reference", "") or ("upload" if upload else "keep")).strip().lower()
    if mode not in REFERENCE_MODES:
        return {"success": False, "message": "Origem do áudio de referência inválida."}, 400
    if mode == "upload":
        if not upload:
            return {"success": False, "message": "Envie o áudio de referência."}, 400
        problem = _validate_reference(*upload)
        if problem:
            return {"success": False, "message": problem}, 400

    try:
        item, exercise = _load(token, content_id)
    except SupabaseError as error:
        return _friendly_error(error, "Não foi possível carregar a aula.")
    if not item:
        return {"success": False, "message": "Aula não encontrada."}, 404
    if item.get("type") != "lesson":
        return {"success": False, "message": "Só aulas podem ter exercício com reconhecimento de áudio."}, 400
    external_url = item.get("external_url")

    try:
        if mode == "upload":
            reference_id = _store_reference(token, content_id, *upload)  # type: ignore[misc]
        elif mode == "keep" and exercise and exercise.get("reference_asset_id"):
            reference_id = exercise["reference_asset_id"]
        else:
            reference_id = _main_asset_id(token, content_id, external_url)
            if not reference_id:
                return {"success": False, "message": "Esta aula usa link: envie um áudio de referência para o exercício."}, 400

        saved = supabase_client.rest_upsert("lesson_exercises", token, [{
            "content_item_id": content_id,
            "notes": notes,
            "reference_asset_id": reference_id,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }], on_conflict="content_item_id")
    except SupabaseError as error:
        return _friendly_error(error, "Não foi possível salvar o gabarito.")
    if not saved:
        return {"success": False, "message": "Você não tem permissão para editar este exercício."}, 403

    _discard_reference(token, exercise, external_url, reference_id)
    return {"success": True, "message": f"Gabarito salvo ({len(notes or [])} notas)."}, 200


def delete_exercise(token: str, content_id: str) -> Tuple[Dict[str, Any], int]:
    if not is_uuid(content_id):
        return {"success": False, "message": "Aula não encontrada."}, 404
    try:
        item, exercise = _load(token, content_id)
        supabase_client.rest_delete("lesson_exercises", token, {"content_item_id": f"eq.{content_id}"})
    except SupabaseError as error:
        return _friendly_error(error, "Não foi possível remover o exercício.")
    _discard_reference(token, exercise, (item or {}).get("external_url"), None)
    return {"success": True, "message": "Exercício removido da aula."}, 200

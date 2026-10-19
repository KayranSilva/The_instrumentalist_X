from typing import Any, Dict

import supabase_client
from content import TYPE_DB_TO_UI, describe_media, level_label, seconds_to_duration
from supabase_client import SupabaseError

XP_PER_LEVEL = 100


def _empty_journey() -> Dict[str, Any]:
    return {"streak": 0, "xp_month": 0, "week": [False] * 7, "completed_ids": [], "badges": [], "ranking": []}


def get_homepage_data(token: str) -> Dict[str, Any]:
    """Monta a homepage do usuário autenticado a partir do Supabase.

    O primeiro grupo de conteúdos é o do instrumento principal escolhido no
    cadastro (profile_instruments.is_primary); os demais instrumentos com
    conteúdo aparecem depois, em ordem alfabética.
    """
    try:
        user = supabase_client.get_auth_user(token)
        user_id = user["id"]
        email = (user.get("email") or "").strip().lower()

        profiles = supabase_client.rest_select(
            "profiles", token, {"select": "display_name,role,xp_total,level", "id": f"eq.{user_id}"}
        )
        profile = profiles[0] if profiles else {}

        profile_instruments = supabase_client.rest_select(
            "profile_instruments",
            token,
            {"select": "instrument_id,is_primary,instruments(slug)", "profile_id": f"eq.{user_id}"},
        )

        content_items = supabase_client.rest_select(
            "content_items",
            token,
            {
                "select": "id,type,title,description,instructor_name,duration_seconds,level,external_url,"
                          "instrument_id,instruments(name,slug)",
                "published": "eq.true",
                "order": "created_at.desc",
            },
        )

        instruments_catalog = supabase_client.rest_select(
            "instruments", token, {"select": "id,name,slug", "order": "name.asc"}
        )
    except SupabaseError as error:
        return {"success": False, "message": error.message, "status": error.status}

    try:
        journey = supabase_client.rpc("get_my_journey", token) or _empty_journey()
    except SupabaseError:
        # A home continua funcionando mesmo se a migration de progresso
        # ainda não tiver sido aplicada.
        journey = _empty_journey()

    display_name = profile.get("display_name") or (email.split("@")[0].capitalize() if email else "Aluno")
    primary_entry = next((pi for pi in profile_instruments if pi.get("is_primary")), None)
    primary_instrument_id = primary_entry.get("instrument_id") if primary_entry else None
    primary_slug = ((primary_entry or {}).get("instruments") or {}).get("slug", "")
    completed_ids = set(journey.get("completed_ids") or [])

    groups: Dict[str, Dict[str, Any]] = {}
    for item in content_items:
        instrument = item.get("instruments") or {}
        slug = instrument.get("slug") or "outros"
        group = groups.setdefault(slug, {
            "instrument_slug": slug,
            "instrument_name": instrument.get("name") or "Outros",
            "is_primary": bool(primary_instrument_id) and item.get("instrument_id") == primary_instrument_id,
            "lessons": [],
        })
        media = describe_media(item.get("external_url") or "")
        group["lessons"].append({
            "id": item["id"],
            "type": TYPE_DB_TO_UI.get(item.get("type"), "aula"),
            "title": item.get("title") or "",
            "description": item.get("description") or "",
            "teacher": item.get("instructor_name") or "",
            "duration": seconds_to_duration(item.get("duration_seconds")),
            "level": level_label(item.get("level")),
            "media_kind": media["kind"],
            "media_url": media["embed_url"],
            "completed": item["id"] in completed_ids,
        })

    lesson_groups = sorted(
        groups.values(), key=lambda group: (0 if group["is_primary"] else 1, group["instrument_name"])
    )
    total_items = sum(len(group["lessons"]) for group in lesson_groups)

    content_counts = {group["instrument_slug"]: len(group["lessons"]) for group in lesson_groups}
    instruments_payload = [
        {
            "name": inst.get("name", ""),
            "slug": inst.get("slug", ""),
            "is_primary": inst.get("id") == primary_instrument_id,
            "content_count": content_counts.get(inst.get("slug", ""), 0),
        }
        for inst in instruments_catalog
    ]

    xp_total = int(profile.get("xp_total") or 0)
    level = int(profile.get("level") or 1)
    xp_in_level = xp_total - (level - 1) * XP_PER_LEVEL
    xp_in_level = max(0, min(xp_in_level, XP_PER_LEVEL))

    return {
        "success": True,
        "user": {
            "email": email,
            "name": display_name,
            "role": profile.get("role") or "student",
            "primary_instrument": primary_slug,
        },
        "lesson_groups": lesson_groups,
        "instruments": instruments_payload,
        "journey": {
            "level": level,
            "xp_total": xp_total,
            "xp_month": int(journey.get("xp_month") or 0),
            "xp_in_level": xp_in_level,
            "xp_per_level": XP_PER_LEVEL,
            "streak": int(journey.get("streak") or 0),
            "weekly_sequence": list(journey.get("week") or [False] * 7),
            "badges": journey.get("badges") or [],
            "ranking": journey.get("ranking") or [],
            "completed_count": sum(1 for group in lesson_groups for lesson in group["lessons"] if lesson["completed"]),
            "total_count": total_items,
        },
    }


def complete_content(token: str, content_id: str) -> Dict[str, Any]:
    try:
        result = supabase_client.rpc("complete_content", token, {"p_content_id": content_id})
    except SupabaseError as error:
        return {"success": False, "message": error.message, "status": error.status}
    result = result if isinstance(result, dict) else {}
    if result.get("already_completed"):
        message = "Você já tinha concluído este conteúdo."
    else:
        message = f"+{result.get('xp_awarded', 0)} XP! Conteúdo concluído."
    return {"success": True, "message": message, **result}

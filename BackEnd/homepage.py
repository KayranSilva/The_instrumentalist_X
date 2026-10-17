from typing import Any, Dict, List, Optional

import supabase_client
from supabase_client import SupabaseError


def _format_duration(seconds: Optional[int]) -> str:
    if not seconds:
        return ""
    minutes, secs = divmod(int(seconds), 60)
    return f"{minutes:02d}:{secs:02d}"


def _level_label(level: str) -> str:
    return {"beginner": "Iniciante", "intermediate": "Intermediário", "advanced": "Avançado"}.get(level, "Iniciante")


def get_homepage_data(token: str) -> Dict[str, Any]:
    """Monta a homepage do usuário autenticado a partir do Supabase.

    A primeira linha de aulas é a do instrumento principal escolhido no
    cadastro (profile_instruments.is_primary); os demais instrumentos com
    aulas aparecem depois, organizados em grupos por instrumento.
    """
    try:
        user = supabase_client.get_auth_user(token)
        user_id = user["id"]
        email = (user.get("email") or "").strip().lower()

        profiles = supabase_client.rest_select(
            "profiles", token, {"select": "display_name,role,xp_total,level", "id": f"eq.{user_id}"}
        )
        profile = profiles[0] if profiles else {}
        display_name = profile.get("display_name") or (email.split("@")[0].capitalize() if email else "Aluno")

        profile_instruments = supabase_client.rest_select(
            "profile_instruments",
            token,
            {
                "select": "instrument_id,is_primary,skill_level,instruments(id,name,slug,icon)",
                "profile_id": f"eq.{user_id}",
            },
        )
        primary_entry = next((pi for pi in profile_instruments if pi.get("is_primary")), None)
        primary_instrument_id = primary_entry.get("instrument_id") if primary_entry else None
        user_instrument_slugs = {
            pi["instruments"]["slug"] for pi in profile_instruments if pi.get("instruments")
        }

        content_items = supabase_client.rest_select(
            "content_items",
            token,
            {
                "select": "id,title,instructor_name,duration_seconds,level,instrument_id,instruments(name,slug,icon)",
                "published": "eq.true",
                "type": "eq.lesson",
                "order": "created_at.desc",
            },
        )
    except SupabaseError as error:
        return {"success": False, "message": error.message, "status": error.status}

    groups: Dict[str, Dict[str, Any]] = {}
    group_order: List[str] = []
    for item in content_items:
        instrument = item.get("instruments") or {}
        slug = instrument.get("slug") or "outros"
        if slug not in groups:
            groups[slug] = {
                "instrument_slug": slug,
                "instrument_name": instrument.get("name") or "Outros",
                "is_primary": bool(primary_instrument_id) and item.get("instrument_id") == primary_instrument_id,
                "lessons": [],
            }
            group_order.append(slug)
        groups[slug]["lessons"].append(
            {
                "id": item["id"],
                "title": item["title"],
                "teacher": item.get("instructor_name") or "",
                "duration": _format_duration(item.get("duration_seconds")),
                "level": _level_label(item.get("level") or "beginner"),
                "badge": None,
            }
        )

    def sort_key(slug: str):
        return (0 if groups[slug]["is_primary"] else 1, groups[slug]["instrument_name"])

    lesson_groups = [groups[slug] for slug in sorted(group_order, key=sort_key)]

    try:
        instruments_catalog = supabase_client.rest_select(
            "instruments", token, {"select": "id,name,slug,icon", "order": "name.asc"}
        )
    except SupabaseError:
        instruments_catalog = []

    instruments_payload = [
        {
            "name": inst.get("name", ""),
            "icon": inst.get("slug", "violao"),
            "meta": (
                "Seu instrumento principal"
                if inst.get("id") == primary_instrument_id
                else ("Nos seus instrumentos" if inst.get("slug") in user_instrument_slugs else "Explorar")
            ),
        }
        for inst in instruments_catalog
    ]

    xp_total = int(profile.get("xp_total") or 0)
    level = int(profile.get("level") or 1)

    return {
        "success": True,
        "message": "Homepage carregada com sucesso.",
        "user": {"email": email, "name": display_name},
        "hero": {
            "welcome": "Bem-vindo de volta",
            "greeting": f"Boa noite, {display_name}.",
            "message": "Explore os conteúdos disponíveis e escolha seu próximo objetivo musical.",
            "continue_lesson": None,
            "stats": [
                {"label": "dias seguidos", "value": "0", "icon": "flame"},
                {"label": "XP este mês", "value": str(xp_total), "icon": "star"},
                {"label": "Nível", "value": str(level), "icon": "medal"},
            ],
        },
        "lesson_groups": lesson_groups,
        "instruments": instruments_payload,
        "journey": {
            "level": level,
            "xp_current": xp_total,
            "xp_goal": max(xp_total, 100),
            "xp_needed": max(max(xp_total, 100) - xp_total, 0),
            "progress": 0,
            "streak": 0,
            "weekly_sequence": [False] * 7,
            "badges": [
                {"name": "Primeira aula", "unlocked": False},
                {"name": "7 dias seguidos", "unlocked": False},
                {"name": "30 dias seguidos", "unlocked": False},
                {"name": "3 instrumentos", "unlocked": False},
            ],
            "ranking": [],
        },
        "community": {
            "title": "Aprenda em boa companhia",
            "description": "Participe do desafio do mês, compartilhe suas gravações e receba retorno de outros alunos e professores.",
        },
    }

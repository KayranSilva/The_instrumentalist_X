from typing import Any, Dict, List


def get_homepage_data(email: str = "marina@theinstrumentalist.com") -> Dict[str, Any]:
    """Retorna os dados dinâmicos da homepage do usuário."""
    normalized_email = (email or "").strip().lower() or "marina@theinstrumentalist.com"
    is_demo_user = normalized_email == "marina@theinstrumentalist.com"

    user_name = "Marina"
    if normalized_email == "admin@theinstrumentalist.com":
        user_name = "Administrador"
    elif normalized_email != "marina@theinstrumentalist.com":
        user_name = normalized_email.split("@")[0].capitalize()

    continue_lesson = None

    lessons: List[Dict[str, Any]] = [
        {
            "id": 1,
            "instrument": "violao",
            "title": "Dedilhado com métrica 6/8",
            "teacher": "Rafael Nunes",
            "duration": "14:20",
            "progress": 64 if is_demo_user else 0,
            "badge": None,
        },
        {
            "id": 2,
            "instrument": "piano",
            "title": "Acordes de sétima na prática",
            "teacher": "Bianca Rocha",
            "duration": "09:45",
            "progress": 20 if is_demo_user else 0,
            "badge": None,
        },
        {
            "id": 3,
            "instrument": "bateria",
            "title": "Groove básico de samba",
            "teacher": "Diego Alves",
            "duration": "11:10",
            "progress": 0,
            "badge": "Novo",
        },
        {
            "id": 4,
            "instrument": "canto",
            "title": "Respiração e apoio vocal",
            "teacher": "Aline Souza",
            "duration": "07:30",
            "progress": 100 if is_demo_user else 0,
            "badge": None,
        },
        {
            "id": 5,
            "instrument": "violao",
            "title": "Trocas de acordes sem travar",
            "teacher": "Rafael Nunes",
            "duration": "13:05",
            "progress": 0,
            "badge": None,
        },
        {
            "id": 6,
            "instrument": "piano",
            "title": "Leitura de partitura para iniciantes",
            "teacher": "Bianca Rocha",
            "duration": "16:50",
            "progress": 0,
            "badge": None,
        },
    ]
    lessons = []

    instruments: List[Dict[str, Any]] = [
        {"name": "Violão", "meta": "Iniciante", "icon": "violao"},
        {"name": "Piano", "meta": "Intermediário", "icon": "piano"},
        {"name": "Bateria", "meta": "Iniciante", "icon": "bateria"},
        {"name": "Violino", "meta": "Avançado", "icon": "violino"},
        {"name": "Ukulele", "meta": "Iniciante", "icon": "ukulele"},
        {"name": "Canto", "meta": "Todos os níveis", "icon": "canto"},
    ]

    journey = {
        "level": 7 if is_demo_user else 1,
        "xp_current": 1240 if is_demo_user else 0,
        "xp_goal": 1620 if is_demo_user else 100,
        "xp_needed": 380 if is_demo_user else 100,
        "progress": 72 if is_demo_user else 0,
        "streak": 12 if is_demo_user else 0,
        "weekly_sequence": [True, True, True, True, True, False, False] if is_demo_user else [False] * 7,
        "badges": [
            {"name": "Primeira aula", "unlocked": is_demo_user},
            {"name": "7 dias seguidos", "unlocked": is_demo_user},
            {"name": "30 dias seguidos", "unlocked": False},
            {"name": "3 instrumentos", "unlocked": False},
        ],
        "ranking": [
            {"rank": 1, "name": "Camila R.", "xp": 2180, "avatar": "C"},
            {"rank": 2 if is_demo_user else 4, "name": f"{user_name} (você)", "xp": 1240 if is_demo_user else 0, "avatar": user_name[:1].upper(), "is_you": True},
            {"rank": 3, "name": "Thiago M.", "xp": 1080, "avatar": "T"},
        ],
    }

    stats = [
        {"label": "dias seguidos", "value": "12" if is_demo_user else "0", "icon": "flame"},
        {"label": "XP este mês", "value": "1.240" if is_demo_user else "0", "icon": "star"},
        {"label": "Nível", "value": "7" if is_demo_user else "1", "icon": "medal"},
    ]

    return {
        "success": True,
        "message": "Homepage carregada com sucesso.",
        "user": {
            "email": normalized_email,
            "name": user_name,
        },
        "hero": {
            "welcome": "Bem-vindo de volta",
            "greeting": f"Boa noite, {user_name}.",
            "message": "Explore os conteúdos disponíveis e escolha seu próximo objetivo musical.",
            "continue_lesson": continue_lesson,
            "stats": stats,
        },
        "lessons": lessons,
        "instruments": instruments,
        "journey": journey,
        "community": {
            "title": "Aprenda em boa companhia",
            "description": "Participe do desafio do mês, compartilhe suas gravações e receba retorno de outros alunos e professores.",
        },
    }

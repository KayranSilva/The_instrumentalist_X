"""Endpoints da comunidade; toda leitura/escrita usa o token do usuário e respeita RLS."""
from typing import Any, Dict, Tuple
import logging
import re

import supabase_client
from supabase_client import SupabaseError

logger = logging.getLogger(__name__)

UUID_RE = re.compile(r"^[0-9a-fA-F-]{36}$")

def _user(token: str):
    user = supabase_client.get_auth_user(token)
    return user["id"]

def _safe_error(error: SupabaseError, fallback: str = "Não foi possível concluir a operação."):
    logger.error(
        "Erro na API da comunidade: status=%s mensagem=%s",
        error.status,
        error.message,
    )

    status = error.status or 500

    if status == 401:
        message = "Sessão expirada. Faça login novamente."
    elif status == 403:
        message = "Você não tem permissão para esta ação."
    elif status == 404:
        message = "Recurso não encontrado."
    else:
        message = fallback

    return {"success": False, "message": message}, status

def dashboard(token: str) -> Tuple[Dict[str, Any], int]:
    try:
        uid = _user(token)
        posts = supabase_client.rest_select("community_posts", token, {
            "select": "id,author_id,body,music_url,music_title,created_at",
            "order": "created_at.desc", "limit": "50"})
        comments = supabase_client.rest_select("community_comments", token, {"select":"id,post_id,author_id,body,created_at","order":"created_at.asc","limit":"300"})
        likes = supabase_client.rest_select(
            "community_likes",
            token,
            {
                "select": "post_id,user_id",
                "limit": "5000",
            },
        )
        follows = supabase_client.rest_select("community_follows", token, {"select":"following_id","follower_id":f"eq.{uid}"})
        followers = supabase_client.rest_select("community_follows", token, {"select":"follower_id","following_id":f"eq.{uid}"})
        profiles = supabase_client.rest_select(
            "community_profiles",
            token,
            {
                "select": "id,display_name,avatar_url,role",
                "order": "display_name.asc",
                "limit": "100",
            },
        )
        groups = supabase_client.rest_select("community_groups", token, {"select":"id,name,description,created_at,owner_id","order":"created_at.desc","limit":"50"})
        memberships = supabase_client.rest_select("community_group_members", token, {"select":"group_id","user_id":f"eq.{uid}"})
        group_posts = supabase_client.rest_select(
            "community_group_posts",
            token,
            {
                "select": "id,group_id,author_id,body,created_at",
                "order": "created_at.desc",
                "limit": "100",
            },
        )
        announcements = supabase_client.rest_select("community_announcements", token, {"select":"id,title,body,created_at","order":"created_at.desc","limit":"20"})
        like_counts: Dict[str, int] = {}

        for row in likes:
            post_id = row.get("post_id")
            if post_id:
                like_counts[post_id] = like_counts.get(post_id, 0) + 1

        liked_post_ids = [
            row["post_id"]
            for row in likes
            if row.get("user_id") == uid and row.get("post_id")
        ]
        return {
            "success": True,
            "user_id": uid,
            "posts": posts,
            "comments": comments,
            "liked_post_ids": liked_post_ids,
            "like_counts": like_counts,
            "following_ids": [
                row["following_id"]
                for row in follows
                if row.get("following_id")
            ],
            "follower_ids": [
                row["follower_id"]
                for row in followers
                if row.get("follower_id")
            ],
            "profiles": profiles,
            "groups": groups,
            "joined_group_ids": [
                row["group_id"]
                for row in memberships
                if row.get("group_id")
            ],
            "group_posts": group_posts,
            "announcements": announcements,
        }, 200
    except SupabaseError as e:
        return _safe_error(e)

def user_profile(token: str, profile_id: str) -> Tuple[Dict[str, Any], int]:
    if not UUID_RE.match(profile_id):
        return {"success": False, "message": "Perfil inválido."}, 400
    try:
        uid = _user(token)
        profiles = supabase_client.rest_select("community_profiles", token, {
            "select": "id,display_name,avatar_url,role",
            "id": f"eq.{profile_id}",
            "limit": "1",
        })
        if not profiles:
            return {"success": False, "message": "Este perfil não foi encontrado."}, 404
        posts = supabase_client.rest_select("community_posts", token, {
            "select": "id,author_id,body,music_url,music_title,created_at",
            "author_id": f"eq.{profile_id}",
            "order": "created_at.desc",
            "limit": "50",
        })
        followers = supabase_client.rest_select("community_follows", token, {
            "select": "follower_id",
            "following_id": f"eq.{profile_id}",
        })
        following = supabase_client.rest_select("community_follows", token, {
            "select": "following_id",
            "follower_id": f"eq.{profile_id}",
        })
        is_following = bool(supabase_client.rest_select("community_follows", token, {
            "select": "following_id",
            "follower_id": f"eq.{uid}",
            "following_id": f"eq.{profile_id}",
            "limit": "1",
        }))
        return {
            "success": True,
            "user_id": uid,
            "profile": profiles[0],
            "posts": posts,
            "follower_count": len(followers),
            "following_count": len(following),
            "is_following": is_following,
        }, 200
    except SupabaseError as e:
        return _safe_error(e)

def create_post(token: str, data: Dict[str, Any]):
    body = str(data.get("body", "")).strip(); music_url = str(data.get("music_url", "")).strip(); music_title = str(data.get("music_title", "")).strip()
    if not body and not music_url: return {"success":False,"message":"Escreva uma publicação ou adicione um link musical."},400
    if len(body)>3000 or len(music_title)>160: return {"success":False,"message":"O texto excede o limite permitido."},400
    if music_url and not re.match(r"^https?://",music_url,re.I): return {"success":False,"message":"O link musical deve começar com http:// ou https://."},400
    try:
        uid=_user(token); rows=supabase_client.rest_upsert("community_posts",token,[{"author_id":uid,"body":body,"music_url":music_url or None,"music_title":music_title or None}])
        return {"success":True,"post":rows[0] if rows else None},201
    except SupabaseError as e:return _safe_error(e)

def follow(token: str, data: Dict[str, Any]):
    target=str(data.get("user_id",""))
    if not UUID_RE.match(target): return {"success":False,"message":"Usuário inválido."},400
    try:
        uid=_user(token)
        if target==uid:return {"success":False,"message":"Você não pode seguir a si mesmo."},400
        existing=supabase_client.rest_select("community_follows",token,{"select":"following_id","follower_id":f"eq.{uid}","following_id":f"eq.{target}"})
        if existing:
            supabase_client.rest_delete("community_follows",token,{"follower_id":f"eq.{uid}","following_id":f"eq.{target}"})
            return {"success":True,"following":False,"message":"Você deixou de seguir essa pessoa."},200
        rows=supabase_client.rest_upsert("community_follows",token,[{"follower_id":uid,"following_id":target}],"follower_id,following_id")
        return {"success":True,"following":True,"message":"Agora você está seguindo essa pessoa.","follow":rows[0] if rows else None},200
    except SupabaseError as e:return _safe_error(e)

def create_comment(token: str, data: Dict[str, Any]):
    post_id=str(data.get("post_id","")); body=str(data.get("body"," ")).strip()
    if not UUID_RE.match(post_id) or not body or len(body)>1200:return {"success":False,"message":"Comentário inválido (máximo de 1.200 caracteres)."},400
    try:
        uid=_user(token); rows=supabase_client.rest_upsert("community_comments",token,[{"post_id":post_id,"author_id":uid,"body":body}])
        return {"success":True,"comment":rows[0] if rows else None},201
    except SupabaseError as e:return _safe_error(e)

def toggle_like(token: str, data: Dict[str, Any]):
    post_id=str(data.get("post_id",""))
    if not UUID_RE.match(post_id):return {"success":False,"message":"Publicação inválida."},400
    try:
        uid=_user(token); existing=supabase_client.rest_select("community_likes",token,{"select":"post_id","post_id":f"eq.{post_id}","user_id":f"eq.{uid}"})
        if existing:
            supabase_client.rest_delete("community_likes",token,{"post_id":f"eq.{post_id}","user_id":f"eq.{uid}"}); liked=False
        else:
            supabase_client.rest_upsert("community_likes",token,[{"post_id":post_id,"user_id":uid}],"post_id,user_id"); liked=True
        return {"success":True,"liked":liked},200
    except SupabaseError as e:return _safe_error(e)

def create_group(token: str, data: Dict[str, Any]):
    name=str(data.get("name"," ")).strip(); desc=str(data.get("description"," ")).strip()
    if len(name)<3 or len(name)>80 or len(desc)>500:return {"success":False,"message":"Informe um nome de grupo de 3 a 80 caracteres e uma descrição de até 500."},400
    try:
        uid=_user(token); rows=supabase_client.rest_upsert("community_groups",token,[{"name":name,"description":desc,"owner_id":uid}])
        group=rows[0] if rows else None
        return {"success":True,"group":group},201
    except SupabaseError as e:return _safe_error(e)

def join_group(token: str, data: Dict[str, Any]):
    group_id=str(data.get("group_id",""))
    if not UUID_RE.match(group_id):return {"success":False,"message":"Grupo inválido."},400
    try:
        uid=_user(token); existing=supabase_client.rest_select("community_group_members",token,{"select":"group_id","group_id":f"eq.{group_id}","user_id":f"eq.{uid}"})
        if existing: supabase_client.rest_delete("community_group_members",token,{"group_id":f"eq.{group_id}","user_id":f"eq.{uid}"}); joined=False
        else: supabase_client.rest_upsert("community_group_members",token,[{"group_id":group_id,"user_id":uid}],"group_id,user_id"); joined=True
        return {"success":True,"joined":joined},200
    except SupabaseError as e:return _safe_error(e)

def create_group_post(token: str, data: Dict[str, Any]):
    group_id=str(data.get("group_id","")); body=str(data.get("body"," ")).strip()
    if not UUID_RE.match(group_id) or not body or len(body)>2000:return {"success":False,"message":"Mensagem inválida (máximo de 2.000 caracteres)."},400
    try:
        uid=_user(token); rows=supabase_client.rest_upsert("community_group_posts",token,[{"group_id":group_id,"author_id":uid,"body":body}])
        return {"success":True,"post":rows[0] if rows else None},201
    except SupabaseError as e:return _safe_error(e)

def create_announcement(token: str, data: Dict[str, Any]):
    title=str(data.get("title"," ")).strip(); body=str(data.get("body"," ")).strip()
    if not title or len(title)>140 or not body or len(body)>3000:return {"success":False,"message":"Informe título e texto válidos."},400
    try:
        uid=_user(token); profile = supabase_client.rest_select(
            "community_profiles",
            token,
            {
                "select": "role",
                "id": f"eq.{uid}",
                "limit": "1",
            },
        )
        if not profile or profile[0].get("role") not in {"admin","teacher"}:return {"success":False,"message":"Apenas professores e administradores podem publicar informes."},403
        rows=supabase_client.rest_upsert("community_announcements",token,[{"author_id":uid,"title":title,"body":body}])
        return {"success":True,"announcement":rows[0] if rows else None},201
    except SupabaseError as e:return _safe_error(e)

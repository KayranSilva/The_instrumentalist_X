// Versão em TypeScript de describe_media (BackEnd/content.py): diz como o
// player deve exibir a URL de um conteúdo.

export type MediaKind = "video" | "audio" | "pdf" | "image" | "youtube" | "vimeo" | "link" | "none";

export type Media = { kind: MediaKind; url: string };

const VIDEO_EXTENSIONS = new Set([".mp4", ".webm", ".mov"]);
const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".ogg"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg"]);
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

export function describeMedia(rawUrl: string | null | undefined): Media {
  const url = (rawUrl || "").trim();
  if (!url) return { kind: "none", url: "" };

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { kind: "link", url };
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
  const path = parsed.pathname;
  const dot = path.lastIndexOf(".");
  const extension = dot > path.lastIndexOf("/") ? path.slice(dot).toLowerCase() : "";

  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    let id = parsed.searchParams.get("v") || "";
    if (!id && /^\/(embed|shorts|live)\//.test(path)) id = path.split("/")[2] || "";
    if (YOUTUBE_ID.test(id)) return { kind: "youtube", url: `https://www.youtube-nocookie.com/embed/${id}` };
  }
  if (host === "youtu.be") {
    const id = path.replace(/^\//, "").split("/")[0];
    if (YOUTUBE_ID.test(id)) return { kind: "youtube", url: `https://www.youtube-nocookie.com/embed/${id}` };
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const numeric = path.split("/").find((part) => /^\d+$/.test(part));
    if (numeric) return { kind: "vimeo", url: `https://player.vimeo.com/video/${numeric}` };
  }

  if (VIDEO_EXTENSIONS.has(extension)) return { kind: "video", url };
  if (AUDIO_EXTENSIONS.has(extension)) return { kind: "audio", url };
  if (extension === ".pdf") return { kind: "pdf", url };
  if (IMAGE_EXTENSIONS.has(extension)) return { kind: "image", url };
  return { kind: "link", url };
}

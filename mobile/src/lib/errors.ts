// Mensagens que o Supabase devolve em inglês -> texto mostrado ao usuário
// (mesma tabela de BackEnd/supabase_client.py).
const TRANSLATIONS: Array<[string, string]> = [
  ["invalid login credentials", "E-mail ou senha incorretos."],
  ["email not confirmed", "Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada."],
  ["user already registered", "Este e-mail já está cadastrado."],
  ["already been registered", "Este e-mail já está cadastrado."],
  ["password should be at least", "A senha deve ter pelo menos 6 caracteres."],
  ["for security purposes", "Aguarde alguns segundos antes de tentar novamente."],
  ["rate limit", "Muitas tentativas. Aguarde alguns minutos e tente de novo."],
  ["invalid refresh token", "Sessão expirada. Faça login novamente."],
  ["refresh token not found", "Sessão expirada. Faça login novamente."],
  ["jwt expired", "Sessão expirada. Faça login novamente."],
  ["row-level security", "Você não tem permissão para esta ação."],
  ["signups not allowed", "Novos cadastros estão desativados no momento."],
  ["network request failed", "Não foi possível conectar ao servidor. Verifique sua internet."],
  ["failed to fetch", "Não foi possível conectar ao servidor. Verifique sua internet."],
];

export function friendlyError(error: unknown, fallback = "Não foi possível concluir a operação."): string {
  const raw = error instanceof Error ? error.message
    : typeof error === "object" && error && "message" in error ? String((error as { message: unknown }).message)
    : "";
  const lowered = raw.toLowerCase();
  for (const [needle, translated] of TRANSLATIONS) {
    if (lowered.includes(needle)) return translated;
  }
  return raw || fallback;
}

"use client";

import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export type AuthCallbackResult = { ok: true } | { ok: false };

function safeRelativePath(value: string | null): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return null;
  }

  return value;
}

export async function consumeAuthCallbackParams(): Promise<AuthCallbackResult> {
  const supabase = createBrowserSupabaseClient();
  const { data: existing } = await supabase.auth.getSession();
  if (existing.session) {
    return { ok: true };
  }

  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    url.searchParams.delete("code");
    window.history.replaceState({}, document.title, `${url.pathname}${url.search}`);
    return error ? { ok: false } : { ok: true };
  }

  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  if (tokenHash && (type === "invite" || type === "recovery" || type === "email")) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    url.searchParams.delete("token_hash");
    url.searchParams.delete("type");
    window.history.replaceState({}, document.title, `${url.pathname}${url.search}`);
    return error ? { ok: false } : { ok: true };
  }

  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");
  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    window.history.replaceState({}, document.title, url.pathname + url.search);
    return error ? { ok: false } : { ok: true };
  }

  const next = safeRelativePath(url.searchParams.get("next"));
  if (next) {
    return { ok: false };
  }

  return { ok: false };
}

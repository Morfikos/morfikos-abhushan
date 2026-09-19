"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

const GENERIC_SIGN_IN_ERROR = "Sign-in failed. Check your email and password, or request a new invitation from an administrator.";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = createBrowserSupabaseClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

      if (signInError) {
        setError(GENERIC_SIGN_IN_ERROR);
        return;
      }

      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Sign-in could not be completed because the network request failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
      <Input
        label="Email"
        type="email"
        name="email"
        value={email}
        onChange={setEmail}
        isRequired
        autoComplete="username"
        isInvalid={Boolean(error)}
      />
      <Input
        label="Password"
        type="password"
        name="password"
        value={password}
        onChange={setPassword}
        isRequired
        autoComplete="current-password"
        isInvalid={Boolean(error)}
        hint={error}
      />
      <Button type="submit" color="primary" size="md" isLoading={loading} isDisabled={loading}>
        Sign in
      </Button>
      <p className="text-tertiary text-sm">
        Forgot your password?{" "}
        <a className="text-brand-secondary font-semibold underline-offset-4 hover:underline" href="/auth/recovery">
          Request a reset
        </a>
      </p>
      <p className="text-tertiary text-sm">Access is invitation-only. There is no public create-account option.</p>
    </form>
  );
}

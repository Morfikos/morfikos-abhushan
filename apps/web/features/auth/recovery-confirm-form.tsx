"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { consumeAuthCallbackParams } from "@/features/auth/consume-auth-callback";

export function RecoveryConfirmForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function prepare() {
      const result = await consumeAuthCallbackParams();
      if (cancelled) {
        return;
      }
      if (!result.ok) {
        router.replace("/auth/expired");
        return;
      }
      setReady(true);
    }

    void prepare();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = createBrowserSupabaseClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError("The new password could not be saved. The link may have expired.");
        return;
      }

      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("The password could not be saved because the network request failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!ready) {
    return <p className="text-tertiary text-sm">Checking the recovery link…</p>;
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
      <Input
        label="New password"
        type="password"
        name="password"
        value={password}
        onChange={setPassword}
        isRequired
        autoComplete="new-password"
        isInvalid={Boolean(error)}
        hint={error}
      />
      <Button type="submit" color="primary" size="md" isLoading={loading} isDisabled={loading}>
        Save password
      </Button>
    </form>
  );
}

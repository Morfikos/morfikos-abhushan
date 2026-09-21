"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { consumeAuthCallbackParams } from "@/features/auth/consume-auth-callback";
import { fetchCurrentStaff, StaffApiError } from "@/lib/staff-api";

export function InviteAcceptForm() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
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
      const { error: updateError } = await supabase.auth.updateUser({
        password,
        data: { display_name: displayName.trim() },
      });

      if (updateError) {
        setError("The invitation could not be completed. The link may have expired.");
        return;
      }

      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) {
        router.replace("/auth/expired");
        return;
      }

      try {
        await fetchCurrentStaff(accessToken);
      } catch (requestError) {
        if (requestError instanceof StaffApiError && requestError.status === 403) {
          router.replace("/access-denied");
          return;
        }
        throw requestError;
      }

      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("The invitation could not be completed because the network request failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!ready) {
    return <p className="text-tertiary text-sm">Checking the invitation…</p>;
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
      <Input
        label="Display name"
        type="text"
        name="displayName"
        value={displayName}
        onChange={setDisplayName}
        isRequired
        autoComplete="name"
      />
      <Input
        label="Password"
        type="password"
        name="password"
        value={password}
        onChange={setPassword}
        isRequired
        autoComplete="new-password"
        isInvalid={Boolean(error)}
        hint={error}
      />
      <Button type="submit" color="primary" size="md" className="w-full" isLoading={loading} isDisabled={loading}>
        Accept invitation
      </Button>
      <p className="text-sm text-tertiary">
        Already set up?{" "}
        <a className="font-semibold text-brand-secondary underline-offset-4 hover:underline" href="/login">
          Sign in
        </a>
      </p>
    </form>
  );
}

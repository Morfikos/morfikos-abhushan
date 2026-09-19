"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { publicEnv } from "@/lib/public-env";

export function RecoveryRequestForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = createBrowserSupabaseClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/auth/recovery/confirm`,
      });

      if (resetError) {
        setError(
          resetError.message.toLowerCase().includes("smtp") || resetError.status === 500
            ? "Password recovery email could not be sent. SMTP is not configured or the provider rejected the request."
            : "The recovery request could not be completed. Try again or contact an administrator.",
        );
        return;
      }

      router.replace("/auth/check-email");
    } catch {
      setError("The recovery request could not be completed because the network request failed. Try again.");
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
        hint={error}
      />
      <Button type="submit" color="primary" size="md" isLoading={loading} isDisabled={loading}>
        Send reset instructions
      </Button>
      <p className="text-tertiary text-sm">
        Recovery mail is sent only when custom SMTP is configured for {publicEnv.NEXT_PUBLIC_APP_NAME}. This form does not
        confirm that a mailbox received the message.
      </p>
    </form>
  );
}

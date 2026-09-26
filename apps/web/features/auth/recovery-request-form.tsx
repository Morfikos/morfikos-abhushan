"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

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
            ? "Reset email could not be sent. Ask an owner to check email setup."
            : "The recovery request could not be completed. Try again or ask an owner.",
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
        error={error}
      />
      <Button type="submit" color="primary" size="md" className="w-full" isLoading={loading} isDisabled={loading}>
        Send reset instructions
      </Button>
      <p className="text-tertiary text-sm">Enter the email from your staff invite.</p>
    </form>
  );
}

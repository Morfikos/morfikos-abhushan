import { Button } from "@/components/base/buttons/button";

export default function LoginPlaceholderPage() {
  return (
    <main className="bg-primary mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-16">
      <p className="text-brand-secondary text-sm font-semibold">Aabhushan</p>
      <h1 className="text-display-xs text-primary font-semibold">Staff sign-in</h1>
      <p className="text-tertiary text-md">
        Invitation-based sign-in is implemented in the next unit. Public registration is disabled.
      </p>
      <div>
        <Button href="/" color="secondary" size="md">
          Back to home
        </Button>
      </div>
    </main>
  );
}

import { Button } from "@/components/base/buttons/button";

export default function HomePage() {
  return (
    <main className="bg-primary mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-6 py-16">
      <p className="text-brand-secondary text-sm font-semibold">Aabhushan</p>
      <h1 className="text-display-sm text-primary font-semibold">Jewellery management for the shop floor</h1>
      <p className="text-tertiary text-md">
        Staff inventory, barcode billing, payments, and Girvi will live here. Invitation-based sign-in is the next unit.
        This page is a placeholder and does not perform business operations.
      </p>
      <div>
        <Button href="/login" color="primary" size="md">
          Sign in
        </Button>
      </div>
    </main>
  );
}

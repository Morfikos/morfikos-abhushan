import { Button } from "@/components/base/buttons/button";

export default function NotFoundPage() {
  return (
    <main className="bg-primary mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-display-xs text-primary font-semibold">Page not found</h1>
      <p className="text-tertiary text-md">This route does not exist. No private record information is shown here.</p>
      <div>
        <Button href="/" color="primary" size="md">
          Return home
        </Button>
      </div>
    </main>
  );
}

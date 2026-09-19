import type { ReactNode } from "react";

export function AuthPage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="bg-primary mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-16">
      <p className="text-brand-secondary text-sm font-semibold">Aabhushan</p>
      <h1 className="text-display-xs text-primary font-semibold">{title}</h1>
      <p className="text-tertiary text-md">{description}</p>
      {children}
    </main>
  );
}

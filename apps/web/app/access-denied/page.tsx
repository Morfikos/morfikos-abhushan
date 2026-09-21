import { AuthPage } from "@/components/shared/auth-page";
import { Button } from "@/components/base/buttons/button";

export const dynamic = "force-dynamic";

export default function AccessDeniedPage() {
  return (
    <AuthPage
      title="Access denied"
      description="You do not have access to this area. Ask an owner if you need it."
    >
      <Button href="/login" color="primary" size="md" className="w-full">
        Return to sign-in
      </Button>
    </AuthPage>
  );
}

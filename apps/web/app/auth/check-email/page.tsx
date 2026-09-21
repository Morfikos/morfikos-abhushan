import { AuthPage } from "@/components/shared/auth-page";
import { Button } from "@/components/base/buttons/button";

export const dynamic = "force-dynamic";

export default function CheckEmailPage() {
  return (
    <AuthPage
      title="Check your email"
      description="If an email was sent, check your inbox and spam. Ask an owner if nothing arrives."
    >
      <Button href="/login" color="primary" size="md" className="w-full">
        Return to sign-in
      </Button>
    </AuthPage>
  );
}

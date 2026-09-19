import { AuthPage } from "@/components/shared/auth-page";
import { Button } from "@/components/base/buttons/button";

export const dynamic = "force-dynamic";

export default function CheckEmailPage() {
  return (
    <AuthPage
      title="Check your email"
      description="If the request was accepted, a recovery or invitation message is on its way. This screen is an instruction, not a guarantee that the message was delivered."
    >
      <Button href="/login" color="primary" size="md">
        Return to sign-in
      </Button>
    </AuthPage>
  );
}

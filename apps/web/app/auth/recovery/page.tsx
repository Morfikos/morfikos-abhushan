import { AuthPage } from "@/components/shared/auth-page";
import { RecoveryRequestForm } from "@/features/auth/recovery-request-form";
import { Button } from "@/components/base/buttons/button";

export const dynamic = "force-dynamic";

export default function RecoveryPage() {
  return (
    <AuthPage
      title="Reset password"
      description="Enter the email used for your staff invitation. If SMTP is configured, you will see the next instructions. This does not confirm that the message was delivered."
    >
      <RecoveryRequestForm />
      <Button href="/login" color="secondary" size="md">
        Back to sign-in
      </Button>
    </AuthPage>
  );
}

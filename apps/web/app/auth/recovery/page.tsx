import { AuthPage } from "@/components/shared/auth-page";
import { RecoveryRequestForm } from "@/features/auth/recovery-request-form";
import { Button } from "@/components/base/buttons/button";

export const dynamic = "force-dynamic";

export default function RecoveryPage() {
  return (
    <AuthPage
      title="Reset password"
      description="Enter the email from your staff invite."
    >
      <RecoveryRequestForm />
      <Button href="/login" color="secondary" size="md" className="w-full">
        Back to sign-in
      </Button>
    </AuthPage>
  );
}

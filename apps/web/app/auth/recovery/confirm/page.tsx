import { AuthPage } from "@/components/shared/auth-page";
import { RecoveryConfirmForm } from "@/features/auth/recovery-confirm-form";

export const dynamic = "force-dynamic";

export default function RecoveryConfirmPage() {
  return (
    <AuthPage
      title="Choose a new password"
      description="Use the recovery link from your email. If the link is invalid or expired, you can request another reset."
    >
      <RecoveryConfirmForm />
    </AuthPage>
  );
}

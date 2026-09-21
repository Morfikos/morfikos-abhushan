import { AuthPage } from "@/components/shared/auth-page";
import { InviteAcceptForm } from "@/features/auth/invite-accept-form";

export const dynamic = "force-dynamic";

export default function InviteAcceptPage() {
  return (
    <AuthPage
      title="Set up your account"
      description="Choose a display name and password. If the link is invalid or expired, ask an owner for a new invite."
    >
      <InviteAcceptForm />
    </AuthPage>
  );
}

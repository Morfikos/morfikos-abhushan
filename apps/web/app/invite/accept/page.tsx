import { AuthPage } from "@/components/shared/auth-page";
import { InviteAcceptForm } from "@/features/auth/invite-accept-form";

export const dynamic = "force-dynamic";

export default function InviteAcceptPage() {
  return (
    <AuthPage
      title="Accept invitation"
      description="Set a display name and password for your staff account. Invalid or expired invitations show a recovery path instead of confirming whether a private record exists."
    >
      <InviteAcceptForm />
    </AuthPage>
  );
}

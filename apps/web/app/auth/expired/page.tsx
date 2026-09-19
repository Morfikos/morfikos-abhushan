import { AuthPage } from "@/components/shared/auth-page";
import { Button } from "@/components/base/buttons/button";

export const dynamic = "force-dynamic";

export default function ExpiredAuthPage() {
  return (
    <AuthPage
      title="This link is not valid"
      description="The invitation or recovery link is expired, already used, or invalid. This page does not confirm whether a private staff record exists."
    >
      <div className="flex flex-col gap-3">
        <Button href="/auth/recovery" color="primary" size="md">
          Request a new recovery email
        </Button>
        <Button href="/login" color="secondary" size="md">
          Contact an administrator and return to sign-in
        </Button>
      </div>
    </AuthPage>
  );
}

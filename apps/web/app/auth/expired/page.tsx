import { AuthPage } from "@/components/shared/auth-page";
import { Button } from "@/components/base/buttons/button";

export const dynamic = "force-dynamic";

export default function ExpiredAuthPage() {
  return (
    <AuthPage
      title="This link is not valid"
      description="This invitation or reset link is expired, already used, or invalid. Ask an owner for a new link."
    >
      <div className="flex flex-col gap-3">
        <Button href="/auth/recovery" color="primary" size="md" className="w-full">
          Request a new recovery email
        </Button>
        <Button href="/login" color="secondary" size="md" className="w-full">
          Return to sign-in
        </Button>
      </div>
    </AuthPage>
  );
}

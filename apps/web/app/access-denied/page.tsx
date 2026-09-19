import { AuthPage } from "@/components/shared/auth-page";
import { Button } from "@/components/base/buttons/button";

export const dynamic = "force-dynamic";

export default function AccessDeniedPage() {
  return (
    <AuthPage
      title="Access denied"
      description="Your session is not allowed to use this workspace. A suspended or missing staff membership is blocked even if a previous sign-in token is still valid."
    >
      <Button href="/login" color="primary" size="md">
        Return to sign-in
      </Button>
    </AuthPage>
  );
}

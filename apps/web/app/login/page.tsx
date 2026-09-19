import { AuthPage } from "@/components/shared/auth-page";
import { LoginForm } from "@/features/auth/login-form";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <AuthPage
      title="Staff sign-in"
      description="Use the email address from your administrator invitation. Public registration is disabled."
    >
      <LoginForm />
    </AuthPage>
  );
}

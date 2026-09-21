import { AuthPage } from "@/components/shared/auth-page";
import { LoginForm } from "@/features/auth/login-form";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <AuthPage
      title="Staff sign-in"
      description="Sign in with the email from your administrator invitation. Inventory, sales, and Girvi stay behind this staff account."
    >
      <LoginForm />
    </AuthPage>
  );
}

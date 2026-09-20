import { createClient } from "@supabase/supabase-js";

import type { StaffAuthInviteResult, StaffAuthInviter } from "@aabhushan/application";
import { configurationError } from "@aabhushan/application";
import type { ServerEnv } from "@aabhushan/config/server";

export function createStaffAuthInviter(env: ServerEnv): StaffAuthInviter | null {
  if (!env.SUPABASE_SECRET_KEY) {
    return null;
  }

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return {
    async inviteByEmail(input: {
      email: string;
      displayName: string;
      redirectTo: string;
    }): Promise<StaffAuthInviteResult> {
      const { data, error } = await supabase.auth.admin.inviteUserByEmail(input.email, {
        redirectTo: input.redirectTo,
        data: { display_name: input.displayName },
      });

      if (error || !data.user) {
        throw configurationError(error?.message ?? "The invitation provider rejected the request.");
      }

      return {
        authUserId: data.user.id,
        email: data.user.email ?? input.email,
      };
    },
  };
}

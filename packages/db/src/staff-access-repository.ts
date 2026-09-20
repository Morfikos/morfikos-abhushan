import type { Pool } from "pg";

import type {
  StaffAccessRepository,
  StaffInvitationRecord,
  StaffMembershipRecord,
  StaffUserRecord,
} from "@aabhushan/application";
import type { StaffInvitationStatus, StaffMembershipStatus, StaffRole } from "@aabhushan/contracts";

function asRole(value: unknown): StaffRole {
  if (value === "owner" || value === "admin" || value === "billing" || value === "inventory" || value === "girvi") {
    return value;
  }

  throw new Error("Unexpected staff role in database.");
}

function asMembershipStatus(value: unknown): StaffMembershipStatus {
  if (value === "invited" || value === "active" || value === "suspended") {
    return value;
  }

  throw new Error("Unexpected membership status in database.");
}

function asInvitationStatus(value: unknown): StaffInvitationStatus {
  if (value === "pending" || value === "accepted" || value === "expired" || value === "revoked") {
    return value;
  }

  throw new Error("Unexpected invitation status in database.");
}

type StaffLookupRow = {
  staff_user_id: string;
  email: string;
  display_name: string;
  is_disabled: boolean;
  membership_id: string | null;
  organization_id: string | null;
  branch_id: string | null;
  role: string | null;
  membership_status: string | null;
  invitation_id: string | null;
  invitation_email: string | null;
  invitation_status: string | null;
  invitation_expires_at: Date | null;
};

function mapRow(row: StaffLookupRow): StaffUserRecord {
  const membership: StaffMembershipRecord | null =
    row.membership_id && row.organization_id && row.branch_id && row.role && row.membership_status
      ? {
          id: row.membership_id,
          organizationId: row.organization_id,
          branchId: row.branch_id,
          role: asRole(row.role),
          status: asMembershipStatus(row.membership_status),
        }
      : null;

  const invitation: StaffInvitationRecord | null =
    row.invitation_id && row.invitation_email && row.invitation_status && row.invitation_expires_at
      ? {
          id: row.invitation_id,
          email: row.invitation_email,
          status: asInvitationStatus(row.invitation_status),
          expiresAt: row.invitation_expires_at,
        }
      : null;

  return {
    id: row.staff_user_id,
    email: row.email,
    displayName: row.display_name,
    isDisabled: row.is_disabled,
    membership,
    invitation,
  };
}

const lookupSql = `
SELECT
  u.id AS staff_user_id,
  u.email,
  u.display_name,
  u.is_disabled,
  m.id AS membership_id,
  m.organization_id,
  m.branch_id,
  m.role,
  m.status AS membership_status,
  i.id AS invitation_id,
  i.email AS invitation_email,
  i.status AS invitation_status,
  i.expires_at AS invitation_expires_at
FROM app.staff_users u
LEFT JOIN app.staff_memberships m ON m.staff_user_id = u.id
LEFT JOIN LATERAL (
  SELECT inv.id, inv.email, inv.status, inv.expires_at
  FROM app.staff_invitations inv
  WHERE inv.organization_id = m.organization_id
    AND lower(inv.email) = lower(u.email)
    AND inv.status IN ('pending', 'accepted', 'expired', 'revoked')
  ORDER BY
    CASE inv.status WHEN 'pending' THEN 0 WHEN 'accepted' THEN 1 ELSE 2 END,
    inv.expires_at DESC
  LIMIT 1
) i ON TRUE
WHERE u.id = $1
LIMIT 1
`;

export function createStaffAccessRepository(pool: Pool): StaffAccessRepository {
  return {
    async findByAuthUserId(authUserId: string): Promise<StaffUserRecord | null> {
      const result = await pool.query<StaffLookupRow>(lookupSql, [authUserId]);
      const row = result.rows[0];
      return row ? mapRow(row) : null;
    },

    async activateInvitedMembership(input): Promise<StaffUserRecord> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `
          UPDATE app.staff_users
          SET display_name = $2, updated_at = timezone('utc', now())
          WHERE id = $1
          `,
          [input.staffUserId, input.displayName],
        );
        await client.query(
          `
          UPDATE app.staff_memberships
          SET status = 'active', accepted_at = timezone('utc', now())
          WHERE id = $1 AND staff_user_id = $2 AND status = 'invited'
          `,
          [input.membershipId, input.staffUserId],
        );
        await client.query(
          `
          UPDATE app.staff_invitations
          SET status = 'accepted'
          WHERE id = $1 AND status = 'pending'
          `,
          [input.invitationId],
        );
        const result = await client.query<StaffLookupRow>(lookupSql, [input.staffUserId]);
        await client.query("COMMIT");
        const row = result.rows[0];
        if (!row) {
          throw new Error("Staff user disappeared during invitation acceptance.");
        }
        return mapRow(row);
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

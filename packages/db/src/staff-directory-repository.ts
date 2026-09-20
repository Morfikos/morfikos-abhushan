import type { PoolClient } from "pg";

import type { StaffDirectoryItem } from "@aabhushan/contracts";
import type { PaginatedRows, PaginationInput, StaffDirectoryRepository } from "@aabhushan/application";

import { asIsoDateTime } from "./pg-values";

const STAFF_SORT_COLUMNS = {
  email: "u.email",
  display_name: "u.display_name",
  role: "m.role",
  status: "m.status",
  invited_at: "m.invited_at",
} as const;

type StaffRow = {
  id: string;
  staff_user_id: string;
  email: string;
  display_name: string;
  role: StaffDirectoryItem["role"];
  status: StaffDirectoryItem["status"];
  invited_at: Date;
  accepted_at: Date | null;
  suspended_at: Date | null;
  invitation_status: StaffDirectoryItem["invitation_status"];
};

function mapStaff(row: StaffRow): StaffDirectoryItem {
  return {
    id: row.id,
    staff_user_id: row.staff_user_id,
    email: row.email,
    display_name: row.display_name,
    role: row.role,
    status: row.status,
    invited_at: asIsoDateTime(row.invited_at),
    accepted_at: row.accepted_at ? asIsoDateTime(row.accepted_at) : null,
    suspended_at: row.suspended_at ? asIsoDateTime(row.suspended_at) : null,
    invitation_status: row.invitation_status,
  };
}

const staffSelect = `
SELECT
  m.id,
  u.id AS staff_user_id,
  u.email,
  u.display_name,
  m.role,
  m.status,
  m.invited_at,
  m.accepted_at,
  m.suspended_at,
  i.status AS invitation_status
FROM app.staff_memberships m
INNER JOIN app.staff_users u ON u.id = m.staff_user_id
LEFT JOIN LATERAL (
  SELECT inv.status
  FROM app.staff_invitations inv
  WHERE inv.organization_id = m.organization_id
    AND lower(inv.email) = lower(u.email)
  ORDER BY inv.expires_at DESC
  LIMIT 1
) i ON TRUE
`;

export function createStaffDirectoryRepository(
  client: PoolClient,
  organizationId: string,
  branchId: string,
): StaffDirectoryRepository {
  return {
    async listStaff(input: PaginationInput): Promise<PaginatedRows<StaffDirectoryItem>> {
      const sort = STAFF_SORT_COLUMNS[input.sort as keyof typeof STAFF_SORT_COLUMNS] ?? "m.invited_at";
      const direction = input.direction === "asc" ? "ASC" : "DESC";
      const offset = (input.page - 1) * input.pageSize;
      const list = await client.query<StaffRow>(
        `
        ${staffSelect}
        WHERE m.organization_id = $1
        ORDER BY ${sort} ${direction}, m.invited_at DESC
        LIMIT $2 OFFSET $3
        `,
        [organizationId, input.pageSize, offset],
      );
      const count = await client.query<{ total: string }>(
        `SELECT count(*)::text AS total FROM app.staff_memberships WHERE organization_id = $1`,
        [organizationId],
      );
      return {
        items: list.rows.map(mapStaff),
        total: Number.parseInt(count.rows[0]?.total ?? "0", 10),
      };
    },

    async findMembershipByStaffUserId(staffUserId: string): Promise<StaffDirectoryItem | null> {
      const result = await client.query<StaffRow>(
        `
        ${staffSelect}
        WHERE m.organization_id = $1 AND m.staff_user_id = $2
        LIMIT 1
        `,
        [organizationId, staffUserId],
      );
      const row = result.rows[0];
      return row ? mapStaff(row) : null;
    },

    async countActiveOwners(): Promise<number> {
      const result = await client.query<{ total: string }>(
        `
        SELECT count(*)::text AS total
        FROM app.staff_memberships
        WHERE organization_id = $1 AND role = 'owner' AND status = 'active'
        `,
        [organizationId],
      );
      return Number.parseInt(result.rows[0]?.total ?? "0", 10);
    },

    async inviteStaff(input) {
      await client.query(
        `
        INSERT INTO app.staff_users (id, email, display_name)
        VALUES ($1, $2, $3)
        ON CONFLICT (id) DO UPDATE
          SET email = EXCLUDED.email,
              display_name = EXCLUDED.display_name,
              updated_at = timezone('utc', now())
        `,
        [input.authUserId, input.email, input.displayName],
      );
      await client.query(
        `
        INSERT INTO app.staff_memberships (
          organization_id, branch_id, staff_user_id, role, status, invited_at
        )
        VALUES ($1, $2, $3, $4, 'invited', timezone('utc', now()))
        `,
        [organizationId, branchId, input.authUserId, input.role],
      );
      await client.query(
        `
        INSERT INTO app.staff_invitations (
          organization_id, branch_id, email, role, status, expires_at, invited_by_staff_user_id
        )
        VALUES ($1, $2, $3, $4, 'pending', $5, $6)
        `,
        [organizationId, branchId, input.email, input.role, input.expiresAt, input.invitedByStaffUserId],
      );
      const created = await this.findMembershipByStaffUserId(input.authUserId);
      if (!created) {
        throw new Error("Invited staff membership was not readable after insert.");
      }
      return created;
    },

    async suspendMembership(staffUserId: string, at: Date): Promise<StaffDirectoryItem> {
      await client.query(
        `
        UPDATE app.staff_memberships
        SET status = 'suspended', suspended_at = $3
        WHERE organization_id = $1 AND staff_user_id = $2 AND status <> 'suspended'
        `,
        [organizationId, staffUserId, at],
      );
      await client.query(
        `
        UPDATE app.staff_invitations
        SET status = 'revoked'
        WHERE organization_id = $1
          AND lower(email) = (SELECT lower(email) FROM app.staff_users WHERE id = $2)
          AND status = 'pending'
        `,
        [organizationId, staffUserId],
      );
      const suspended = await this.findMembershipByStaffUserId(staffUserId);
      if (!suspended) {
        throw new Error("Suspended membership was not readable after update.");
      }
      return suspended;
    },

    async writeAudit(event) {
      await client.query(
        `
        INSERT INTO app.audit_events (
          organization_id, actor_staff_user_id, action, entity_type, entity_id, reason, payload
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
        `,
        [
          organizationId,
          event.actorStaffUserId,
          event.action,
          event.entityType,
          event.entityId ?? null,
          event.reason ?? null,
          event.payload ? JSON.stringify(event.payload) : null,
        ],
      );
    },
  };
}

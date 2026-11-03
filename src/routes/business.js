const express = require("express");
const pool = require("../db");
const auth = require("../middleware/auth");

const router = express.Router();

// All business routes require authentication.
router.use(auth);

// ============================================================
// HELPERS
// ============================================================

function parsePositiveId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function getActiveSubscriptionPlan(queryable, organizationId) {
  const result = await queryable.query(
    `
    SELECT
      s.id AS subscription_id,
      s.status AS subscription_status,
      p.id AS plan_id,
      p.code AS plan_code,
      p.name AS plan_name,
      p.device_limit,
      p.staff_limit,
      p.features
    FROM organization_subscriptions s
    JOIN subscription_plans p ON p.id = s.plan_id
    WHERE s.organization_id = $1
      AND s.status IN ('active', 'trialing')
      AND p.is_active = TRUE
    ORDER BY s.created_at DESC, s.id DESC
    LIMIT 1
    `,
    [organizationId]
  );

  return result.rows[0] || null;
}

// ============================================================
// CREATE A BUSINESS ORGANIZATION
// POST /api/business
// Creates the business, admin membership, and active Free plan
// atomically in one transaction.
// ============================================================

router.post("/", async (req, res) => {
  const userId = req.user?.id;
  const { name, business_email, business_phone } = req.body || {};

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: "Invalid authenticated user."
    });
  }

  if (typeof name !== "string" || !name.trim()) {
    return res.status(400).json({
      success: false,
      message: "Business name is required."
    });
  }

  if (
    business_email !== undefined &&
    business_email !== null &&
    typeof business_email !== "string"
  ) {
    return res.status(400).json({
      success: false,
      message: "Business email must be valid text."
    });
  }

  if (
    business_phone !== undefined &&
    business_phone !== null &&
    typeof business_phone !== "string"
  ) {
    return res.status(400).json({
      success: false,
      message: "Business phone must be valid text."
    });
  }

  let client;
  let transactionStarted = false;

  try {
    client = await pool.connect();
    await client.query("BEGIN");
    transactionStarted = true;

    const freePlanResult = await client.query(
      `
      SELECT id
      FROM subscription_plans
      WHERE code = 'free' AND is_active = TRUE
      LIMIT 1
      `
    );

    if (freePlanResult.rows.length === 0) {
      throw new Error("An active Free subscription plan is required.");
    }

    const freePlanId = freePlanResult.rows[0].id;

    const result = await client.query(
      `
      INSERT INTO organizations
        (name, business_email, business_phone, created_by)
      VALUES ($1, $2, $3, $4)
      RETURNING id, name, business_email, business_phone, created_by, created_at
      `,
      [
        name.trim(),
        business_email?.trim() || null,
        business_phone?.trim() || null,
        userId
      ]
    );

    const organization = result.rows[0];

    await client.query(
      `
      INSERT INTO organization_members (organization_id, user_id, role)
      VALUES ($1, $2, 'admin')
      `,
      [organization.id, userId]
    );

    await client.query(
      `
      INSERT INTO organization_subscriptions
        (organization_id, plan_id, status, billing_cycle, current_period_start, created_by)
      VALUES ($1, $2, 'active', 'monthly', NOW(), $3)
      `,
      [organization.id, freePlanId, userId]
    );

    await client.query("COMMIT");
    transactionStarted = false;

    return res.status(201).json({
      success: true,
      message: "Business account created successfully with the Free plan.",
      organization
    });
  } catch (err) {
    if (client && transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("BUSINESS CREATE ROLLBACK ERROR:", rollbackError.message);
      }
    }

    console.error("BUSINESS CREATE ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to create business account."
    });
  } finally {
    if (client) client.release();
  }
});

// ============================================================
// LIST BUSINESSES BELONGING TO THE LOGGED-IN USER
// GET /api/business
// ============================================================

router.get("/", async (req, res) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: "Invalid authenticated user."
    });
  }

  try {
    const result = await pool.query(
      `
      SELECT
        o.id,
        o.name,
        o.business_email,
        o.business_phone,
        o.created_by,
        o.created_at,
        om.role
      FROM organization_members om
      JOIN organizations o ON o.id = om.organization_id
      WHERE om.user_id = $1
      ORDER BY o.created_at DESC
      `,
      [userId]
    );

    return res.json({ success: true, organizations: result.rows });
  } catch (err) {
    console.error("BUSINESS LIST ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve business accounts."
    });
  }
});

// ============================================================
// LIST DEVICES ASSIGNED TO A BUSINESS
// GET /api/business/:organizationId/devices
// ============================================================

router.get("/:organizationId/devices", async (req, res) => {
  try {
    const organizationId = parsePositiveId(req.params.organizationId);
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        message: "A valid organization ID is required."
      });
    }

    const membership = await pool.query(
      `
      SELECT organization_id, role
      FROM organization_members
      WHERE organization_id = $1 AND user_id = $2
      LIMIT 1
      `,
      [organizationId, req.user.id]
    );

    if (membership.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: "You are not a member of this business."
      });
    }

    const result = await pool.query(
      `
      SELECT
        id, user_id, organization_id, name, type, imei, imei_2,
        serial_number, mac_address, brand, model, status, device_type,
        machine_id, owner_name, hostname, platform, os_type, os_release,
        arch, last_seen, email, ip, isp, city, country, latitude, longitude
      FROM devices
      WHERE organization_id = $1
      ORDER BY last_seen DESC NULLS LAST, id DESC
      `,
      [organizationId]
    );

    return res.json({
      success: true,
      organization_id: organizationId,
      devices: result.rows
    });
  } catch (err) {
    console.error("BUSINESS DEVICE LIST ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve business devices."
    });
  }
});

// ============================================================
// ASSIGN A REGISTERED DEVICE TO A BUSINESS
// PUT /api/business/:organizationId/devices/:machine_id
// Enforces the active plan's device limit.
// ============================================================

router.put("/:organizationId/devices/:machine_id", async (req, res) => {
  let client;
  let transactionStarted = false;

  try {
    const organizationId = parsePositiveId(req.params.organizationId);
    const machineId = typeof req.params.machine_id === "string"
      ? req.params.machine_id.trim()
      : "";

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        message: "A valid organization ID is required."
      });
    }
    if (!machineId) {
      return res.status(400).json({
        success: false,
        message: "A machine ID is required."
      });
    }

    client = await pool.connect();
    await client.query("BEGIN");
    transactionStarted = true;

    // Serialize assignments for this organization to avoid limit races.
    const organization = await client.query(
      "SELECT id FROM organizations WHERE id = $1 FOR UPDATE",
      [organizationId]
    );

    if (organization.rows.length === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(404).json({
        success: false,
        message: "Business not found."
      });
    }

    const membership = await client.query(
      `
      SELECT organization_id
      FROM organization_members
      WHERE organization_id = $1 AND user_id = $2 AND role = 'admin'
      LIMIT 1
      `,
      [organizationId, req.user.id]
    );

    if (membership.rows.length === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(403).json({
        success: false,
        message: "You must be a business admin to assign devices."
      });
    }

    const existing = await client.query(
      `
      SELECT id, organization_id
      FROM devices
      WHERE machine_id = $1 AND user_id = $2
      LIMIT 1
      FOR UPDATE
      `,
      [machineId, req.user.id]
    );

    if (existing.rows.length === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(404).json({
        success: false,
        message: "Device not found in your account."
      });
    }

    const device = existing.rows[0];
    const currentOrganizationId = device.organization_id;

    if (
      currentOrganizationId !== null &&
      currentOrganizationId !== undefined &&
      Number(currentOrganizationId) !== organizationId
    ) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(409).json({
        success: false,
        message: "This device is already assigned to another business."
      });
    }

    const plan = await getActiveSubscriptionPlan(client, organizationId);
    if (!plan) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(403).json({
        success: false,
        message: "This business does not have an active subscription."
      });
    }

    // An already assigned device is idempotent and consumes no new slot.
    if (
      currentOrganizationId === null ||
      currentOrganizationId === undefined
    ) {
      const countResult = await client.query(
        "SELECT COUNT(*)::int AS total FROM devices WHERE organization_id = $1",
        [organizationId]
      );
      const currentCount = countResult.rows[0].total;

      if (
        plan.device_limit !== null &&
        currentCount >= Number(plan.device_limit)
      ) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return res.status(409).json({
          success: false,
          message: `This plan allows up to ${plan.device_limit} assigned devices. Upgrade the plan to add more.`,
          device_limit: Number(plan.device_limit),
          current_device_count: currentCount,
          plan_code: plan.plan_code
        });
      }
    }

    const result = await client.query(
      `
      UPDATE devices
      SET organization_id = $1
      WHERE id = $2 AND user_id = $3
        AND (organization_id IS NULL OR organization_id = $1)
      RETURNING id, user_id, organization_id, machine_id, name, status, device_type
      `,
      [organizationId, device.id, req.user.id]
    );

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(409).json({
        success: false,
        message: "Device assignment could not be completed."
      });
    }

    await client.query("COMMIT");
    transactionStarted = false;

    return res.json({
      success: true,
      message: "Device assigned to business successfully.",
      device: result.rows[0],
      plan: {
        code: plan.plan_code,
        device_limit: plan.device_limit
      }
    });
  } catch (err) {
    if (client && transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("DEVICE ASSIGNMENT ROLLBACK ERROR:", rollbackError.message);
      }
    }
    console.error("BUSINESS DEVICE ASSIGNMENT ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to assign device to business."
    });
  } finally {
    if (client) client.release();
  }
});

// ============================================================
// LIST MEMBERS OF A BUSINESS
// GET /api/business/:organizationId/members
// ============================================================

router.get("/:organizationId/members", async (req, res) => {
  try {
    const organizationId = parsePositiveId(req.params.organizationId);
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        message: "A valid organization ID is required."
      });
    }

    const membership = await pool.query(
      `
      SELECT role FROM organization_members
      WHERE organization_id = $1 AND user_id = $2
      LIMIT 1
      `,
      [organizationId, req.user.id]
    );

    if (membership.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: "You are not a member of this business."
      });
    }

    const result = await pool.query(
      `
      SELECT u.id AS user_id, u.name, u.email, u.phone, om.role
      FROM organization_members om
      JOIN users u ON u.id = om.user_id
      WHERE om.organization_id = $1
      ORDER BY CASE WHEN om.role = 'admin' THEN 0 ELSE 1 END, u.name ASC
      `,
      [organizationId]
    );

    return res.json({
      success: true,
      organization_id: organizationId,
      members: result.rows
    });
  } catch (err) {
    console.error("BUSINESS MEMBERS LIST ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve business members."
    });
  }
});

// ============================================================
// ADD AN EXISTING USER TO A BUSINESS
// POST /api/business/:organizationId/members
// Enforces team_management and staff_limit from the active plan.
// ============================================================

router.post("/:organizationId/members", async (req, res) => {
  let client;
  let transactionStarted = false;

  try {
    const organizationId = parsePositiveId(req.params.organizationId);
    const email = typeof req.body?.email === "string"
      ? req.body.email.trim().toLowerCase()
      : "";
    const role = typeof req.body?.role === "string"
      ? req.body.role.trim().toLowerCase()
      : "staff";

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        message: "A valid organization ID is required."
      });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        success: false,
        message: "A valid email address is required."
      });
    }
    if (!["admin", "staff"].includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Role must be admin or staff."
      });
    }

    client = await pool.connect();
    await client.query("BEGIN");
    transactionStarted = true;

    // Serialize team changes for this organization.
    const organization = await client.query(
      "SELECT id FROM organizations WHERE id = $1 FOR UPDATE",
      [organizationId]
    );
    if (organization.rows.length === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(404).json({
        success: false,
        message: "Business not found."
      });
    }

    const adminCheck = await client.query(
      `
      SELECT 1 FROM organization_members
      WHERE organization_id = $1 AND user_id = $2 AND role = 'admin'
      LIMIT 1
      `,
      [organizationId, req.user.id]
    );
    if (adminCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(403).json({
        success: false,
        message: "Only business admins can add team members."
      });
    }

    const plan = await getActiveSubscriptionPlan(client, organizationId);
    if (!plan) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(403).json({
        success: false,
        message: "This business does not have an active subscription."
      });
    }

    const features = plan.features || {};
    if (features.team_management !== true) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(403).json({
        success: false,
        message: "Team management is not available on this plan. Upgrade to add team members.",
        plan_code: plan.plan_code
      });
    }

    const userResult = await client.query(
      `SELECT id, name, email, phone FROM users WHERE LOWER(email) = $1 LIMIT 1`,
      [email]
    );
    if (userResult.rows.length === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(404).json({
        success: false,
        message: "No user found with this email. They must register first."
      });
    }

    const user = userResult.rows[0];
    const existing = await client.query(
      `SELECT 1 FROM organization_members WHERE organization_id = $1 AND user_id = $2 LIMIT 1`,
      [organizationId, user.id]
    );
    if (existing.rows.length > 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(409).json({
        success: false,
        message: "This user is already a member of the business."
      });
    }

    if (role === "staff" && plan.staff_limit !== null) {
      const countResult = await client.query(
        `SELECT COUNT(*)::int AS total FROM organization_members WHERE organization_id = $1 AND role = 'staff'`,
        [organizationId]
      );
      const staffCount = countResult.rows[0].total;
      if (staffCount >= Number(plan.staff_limit)) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return res.status(409).json({
          success: false,
          message: `This plan allows up to ${plan.staff_limit} staff members. Upgrade to add more.`,
          staff_limit: Number(plan.staff_limit),
          current_staff_count: staffCount,
          plan_code: plan.plan_code
        });
      }
    }

    await client.query(
      `INSERT INTO organization_members (organization_id, user_id, role) VALUES ($1, $2, $3)`,
      [organizationId, user.id, role]
    );

    await client.query("COMMIT");
    transactionStarted = false;

    return res.status(201).json({
      success: true,
      message: "Team member added successfully.",
      member: {
        user_id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role
      },
      plan: {
        code: plan.plan_code,
        staff_limit: plan.staff_limit
      }
    });
  } catch (err) {
    if (client && transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("ADD MEMBER ROLLBACK ERROR:", rollbackError.message);
      }
    }
    if (err.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "This user is already a member of the business."
      });
    }
    console.error("ADD BUSINESS MEMBER ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to add business member."
    });
  } finally {
    if (client) client.release();
  }
});

// ============================================================
// CHANGE A BUSINESS MEMBER'S ROLE
// PATCH /api/business/:organizationId/members/:memberUserId
// Requires team management for role changes and enforces limits.
// ============================================================

router.patch("/:organizationId/members/:memberUserId", async (req, res) => {
  let client;
  let transactionStarted = false;

  try {
    const organizationId = parsePositiveId(req.params.organizationId);
    const memberUserId = parsePositiveId(req.params.memberUserId);
    const role = typeof req.body?.role === "string"
      ? req.body.role.trim().toLowerCase()
      : "";

    if (!organizationId || !memberUserId) {
      return res.status(400).json({
        success: false,
        message: "Valid business and member IDs are required."
      });
    }
    if (!["admin", "staff"].includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Role must be admin or staff."
      });
    }
    if (Number(req.user.id) === memberUserId) {
      return res.status(400).json({
        success: false,
        message: "You cannot change your own business role."
      });
    }

    client = await pool.connect();
    await client.query("BEGIN");
    transactionStarted = true;

    const organization = await client.query(
      "SELECT id FROM organizations WHERE id = $1 FOR UPDATE",
      [organizationId]
    );
    if (organization.rows.length === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(404).json({
        success: false,
        message: "Business not found."
      });
    }

    const actor = await client.query(
      `SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2 LIMIT 1`,
      [organizationId, req.user.id]
    );
    if (actor.rows.length === 0 || actor.rows[0].role !== "admin") {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(403).json({
        success: false,
        message: "Only business admins can change member roles."
      });
    }

    const target = await client.query(
      `SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2 FOR UPDATE`,
      [organizationId, memberUserId]
    );
    if (target.rows.length === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(404).json({
        success: false,
        message: "Business member not found."
      });
    }

    const previousRole = target.rows[0].role;
    if (previousRole === role) {
      await client.query("COMMIT");
      transactionStarted = false;
      return res.json({
        success: true,
        message: "Member already has this role.",
        member: {
          organization_id: organizationId,
          user_id: memberUserId,
          role
        }
      });
    }

    const plan = await getActiveSubscriptionPlan(client, organizationId);
    if (!plan) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(403).json({
        success: false,
        message: "This business does not have an active subscription."
      });
    }

    const features = plan.features || {};
    if (features.team_management !== true) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(403).json({
        success: false,
        message: "Team management is not available on this plan. Upgrade to change member roles.",
        plan_code: plan.plan_code
      });
    }

    if (previousRole === "admin" && role !== "admin") {
      const admins = await client.query(
        `SELECT COUNT(*)::int AS total FROM organization_members WHERE organization_id = $1 AND role = 'admin'`,
        [organizationId]
      );
      if (admins.rows[0].total <= 1) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return res.status(409).json({
          success: false,
          message: "The business must have at least one admin."
        });
      }
    }

    if (role === "staff" && previousRole !== "staff" && plan.staff_limit !== null) {
      const countResult = await client.query(
        `SELECT COUNT(*)::int AS total FROM organization_members WHERE organization_id = $1 AND role = 'staff'`,
        [organizationId]
      );
      const staffCount = countResult.rows[0].total;
      if (staffCount >= Number(plan.staff_limit)) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return res.status(409).json({
          success: false,
          message: `This plan allows up to ${plan.staff_limit} staff members.`,
          staff_limit: Number(plan.staff_limit),
          current_staff_count: staffCount,
          plan_code: plan.plan_code
        });
      }
    }

    const result = await client.query(
      `UPDATE organization_members SET role = $1 WHERE organization_id = $2 AND user_id = $3 RETURNING organization_id, user_id, role`,
      [role, organizationId, memberUserId]
    );

    await client.query("COMMIT");
    transactionStarted = false;

    return res.json({
      success: true,
      message: "Business member role updated successfully.",
      member: result.rows[0]
    });
  } catch (err) {
    if (client && transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("ROLE UPDATE ROLLBACK ERROR:", rollbackError.message);
      }
    }
    console.error("BUSINESS ROLE UPDATE ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to update business member role."
    });
  } finally {
    if (client) client.release();
  }
});

// ============================================================
// REMOVE A MEMBER FROM A BUSINESS
// DELETE /api/business/:organizationId/members/:memberUserId
// Admin-only; permits cleanup but protects the last admin.
// ============================================================

router.delete("/:organizationId/members/:memberUserId", async (req, res) => {
  let client;
  let transactionStarted = false;

  try {
    const organizationId = parsePositiveId(req.params.organizationId);
    const memberUserId = parsePositiveId(req.params.memberUserId);

    if (!organizationId || !memberUserId) {
      return res.status(400).json({
        success: false,
        message: "Valid business and member IDs are required."
      });
    }
    if (Number(req.user.id) === memberUserId) {
      return res.status(400).json({
        success: false,
        message: "You cannot remove your own business membership."
      });
    }

    client = await pool.connect();
    await client.query("BEGIN");
    transactionStarted = true;

    const organization = await client.query(
      "SELECT id FROM organizations WHERE id = $1 FOR UPDATE",
      [organizationId]
    );
    if (organization.rows.length === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(404).json({
        success: false,
        message: "Business not found."
      });
    }

    const actor = await client.query(
      `SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2 LIMIT 1`,
      [organizationId, req.user.id]
    );
    if (actor.rows.length === 0 || actor.rows[0].role !== "admin") {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(403).json({
        success: false,
        message: "Only business admins can remove members."
      });
    }

    const target = await client.query(
      `SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2 FOR UPDATE`,
      [organizationId, memberUserId]
    );
    if (target.rows.length === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(404).json({
        success: false,
        message: "Business member not found."
      });
    }

    if (target.rows[0].role === "admin") {
      const admins = await client.query(
        `SELECT COUNT(*)::int AS total FROM organization_members WHERE organization_id = $1 AND role = 'admin'`,
        [organizationId]
      );
      if (admins.rows[0].total <= 1) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return res.status(409).json({
          success: false,
          message: "The last business admin cannot be removed."
        });
      }
    }

    await client.query(
      "DELETE FROM organization_members WHERE organization_id = $1 AND user_id = $2",
      [organizationId, memberUserId]
    );

    await client.query("COMMIT");
    transactionStarted = false;

    return res.json({
      success: true,
      message: "Member removed from the business successfully."
    });
  } catch (err) {
    if (client && transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("MEMBER REMOVAL ROLLBACK ERROR:", rollbackError.message);
      }
    }
    console.error("BUSINESS MEMBER REMOVAL ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to remove business member."
    });
  } finally {
    if (client) client.release();
  }
});

module.exports = router;
const db = require("./src/db");

async function activateFreePlan() {
  let client;

  try {
    client = await db.connect();
    await client.query("BEGIN");

    // Find the existing business.
    const organizationResult = await client.query(
      `
      SELECT id, created_by
      FROM organizations
      WHERE id = $1
      FOR UPDATE
      `,
      [1]
    );

    if (organizationResult.rows.length === 0) {
      throw new Error("Business ID 1 was not found.");
    }

    const organization = organizationResult.rows[0];

    // Find the active Free plan.
    const planResult = await client.query(
      `
      SELECT id, code, name
      FROM subscription_plans
      WHERE code = 'free'
        AND is_active = TRUE
      LIMIT 1
      `
    );

    if (planResult.rows.length === 0) {
      throw new Error("The active Free plan was not found.");
    }

    const plan = planResult.rows[0];

    // Do not overwrite an existing pending or current subscription.
    const existingResult = await client.query(
      `
      SELECT id, status
      FROM organization_subscriptions
      WHERE organization_id = $1
        AND status IN (
          'pending',
          'trialing',
          'active',
          'past_due'
        )
      LIMIT 1
      `,
      [organization.id]
    );

    if (existingResult.rows.length > 0) {
      console.log(
        "Business already has a current or pending subscription:",
        existingResult.rows[0]
      );

      await client.query("COMMIT");
      return;
    }

    // A free plan costs nothing, so it can be activated immediately.
    const result = await client.query(
      `
      INSERT INTO organization_subscriptions
        (
          organization_id,
          plan_id,
          status,
          billing_cycle,
          current_period_start,
          created_by
        )
      VALUES ($1, $2, 'active', 'monthly', NOW(), $3)
      RETURNING
        id,
        organization_id,
        plan_id,
        status,
        billing_cycle,
        current_period_start,
        created_by
      `,
      [
        organization.id,
        plan.id,
        organization.created_by
      ]
    );

    await client.query("COMMIT");

    console.log("Free plan activated successfully.");
    console.log("Plan:", plan.name);
    console.table(result.rows);
  } catch (err) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Rollback failed:", rollbackError.message);
      }
    }

    console.error("FREE PLAN ACTIVATION FAILED:", err.message);
    process.exitCode = 1;
  } finally {
    if (client) client.release();
    await db.end();
  }
}

activateFreePlan();
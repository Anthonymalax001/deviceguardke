const db = require("./src/db");

async function seedPlans() {
  let client;

  try {
    client = await db.connect();

    const database = await client.query(
      "SELECT current_database() AS name"
    );

    console.log("Connected database:", database.rows[0].name);

    await client.query("BEGIN");

    await client.query(`
      INSERT INTO subscription_plans (
        code,
        name,
        description,
        monthly_price_kes,
        annual_price_kes,
        device_limit,
        staff_limit,
        features,
        is_active
      )
      VALUES
      (
        'free',
        'Free',
        'For trying DeviceGuardKE business features.',
        0,
        0,
        1,
        1,
        '{"business_device_management": true, "team_management": false}'::jsonb,
        TRUE
      ),
      (
        'business',
        'Business',
        'For small businesses managing devices and staff.',
        999,
        9990,
        10,
        5,
        '{"business_device_management": true, "team_management": true}'::jsonb,
        TRUE
      ),
      (
        'enterprise',
        'Enterprise',
        'For organizations managing larger device fleets.',
        2999,
        29990,
        100,
        50,
        '{"business_device_management": true, "team_management": true}'::jsonb,
        TRUE
      )
      ON CONFLICT (code) DO NOTHING
    `);

    await client.query("COMMIT");

    const result = await client.query(`
      SELECT
        id,
        code,
        name,
        monthly_price_kes,
        annual_price_kes,
        device_limit,
        staff_limit,
        is_active
      FROM subscription_plans
      ORDER BY id
    `);

    console.log("\nSubscription plans in the backend database:");
    console.table(result.rows);

    if (result.rows.length === 0) {
      throw new Error("No subscription plans were found after insertion.");
    }
  } catch (err) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Rollback failed:", rollbackError.message);
      }
    }

    console.error("PLAN SETUP FAILED:", err.message);
    process.exitCode = 1;
  } finally {
    if (client) client.release();
    await db.end();
  }
}

seedPlans().catch((err) => {
  console.error("Unexpected setup error:", err.message);
  process.exitCode = 1;
});
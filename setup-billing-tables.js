const db = require("./src/db");

async function setupBillingTables() {
  let client;

  try {
    client = await db.connect();

    console.log("Connected database:", 
      (await client.query("SELECT current_database() AS name")).rows[0].name
    );

    await client.query("BEGIN");

    // 1. Subscription plans
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.subscription_plans (
        id BIGSERIAL PRIMARY KEY,
        code VARCHAR(50) NOT NULL UNIQUE,
        name VARCHAR(120) NOT NULL,
        description TEXT,
        monthly_price_kes NUMERIC(12,2) NOT NULL DEFAULT 0
          CHECK (monthly_price_kes >= 0),
        annual_price_kes NUMERIC(12,2) NOT NULL DEFAULT 0
          CHECK (annual_price_kes >= 0),
        device_limit INTEGER
          CHECK (device_limit IS NULL OR device_limit >= 1),
        staff_limit INTEGER
          CHECK (staff_limit IS NULL OR staff_limit >= 1),
        features JSONB NOT NULL DEFAULT '{}'::jsonb,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // 2. Business subscriptions
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.organization_subscriptions (
        id BIGSERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL
          REFERENCES public.organizations(id) ON DELETE CASCADE,
        plan_id BIGINT NOT NULL
          REFERENCES public.subscription_plans(id) ON DELETE RESTRICT,
        status VARCHAR(20) NOT NULL DEFAULT 'pending'
          CHECK (status IN (
            'pending', 'trialing', 'active',
            'past_due', 'canceled', 'expired'
          )),
        billing_cycle VARCHAR(20) NOT NULL DEFAULT 'monthly'
          CHECK (billing_cycle IN ('monthly', 'annual')),
        current_period_start TIMESTAMPTZ,
        current_period_end TIMESTAMPTZ,
        trial_ends_at TIMESTAMPTZ,
        cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
        payment_provider VARCHAR(30),
        provider_subscription_id VARCHAR(255),
        created_by INTEGER
          REFERENCES public.users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CHECK (
          current_period_start IS NULL
          OR current_period_end IS NULL
          OR current_period_end > current_period_start
        )
      )
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS
        organization_one_current_subscription_idx
      ON public.organization_subscriptions (organization_id)
      WHERE status IN ('trialing', 'active', 'past_due')
    `);

    // 3. Payment records
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.subscription_payments (
        id BIGSERIAL PRIMARY KEY,
        subscription_id BIGINT
          REFERENCES public.organization_subscriptions(id)
          ON DELETE SET NULL,
        organization_id INTEGER NOT NULL
          REFERENCES public.organizations(id) ON DELETE CASCADE,
        amount_kes NUMERIC(12,2) NOT NULL
          CHECK (amount_kes >= 0),
        currency VARCHAR(3) NOT NULL DEFAULT 'KES'
          CHECK (currency = 'KES'),
        provider VARCHAR(30) NOT NULL
          CHECK (provider IN ('mpesa', 'card', 'manual', 'other')),
        provider_transaction_id VARCHAR(255),
        idempotency_key VARCHAR(255) UNIQUE,
        status VARCHAR(20) NOT NULL DEFAULT 'pending'
          CHECK (status IN (
            'pending', 'succeeded', 'failed',
            'reversed', 'refunded'
          )),
        phone_number VARCHAR(30),
        failure_reason TEXT,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        paid_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS
        subscription_payment_provider_reference_idx
      ON public.subscription_payments
        (provider, provider_transaction_id)
      WHERE provider_transaction_id IS NOT NULL
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS
        organization_subscriptions_org_idx
      ON public.organization_subscriptions
        (organization_id, created_at DESC)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS
        subscription_payments_org_idx
      ON public.subscription_payments
        (organization_id, created_at DESC)
    `);

    await client.query("COMMIT");

    const verification = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (
          'subscription_plans',
          'organization_subscriptions',
          'subscription_payments'
        )
      ORDER BY table_name
    `);

    console.log("Billing table setup completed.");
    console.table(verification.rows);
  } catch (err) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Rollback error:", rollbackError.message);
      }
    }

    console.error("BILLING SETUP FAILED:", err.message);
    process.exitCode = 1;
  } finally {
    if (client) client.release();
    await db.end();
  }
}

setupBillingTables();
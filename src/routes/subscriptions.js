const express = require("express");
const crypto = require("crypto");
const pool = require("../db");
const auth = require("../middleware/auth");

const router = express.Router();

const PAYSTACK_BASE_URL = "https://api.paystack.co";
const PAYMENT_CURRENCY = "KES";
const KES_SUBUNIT_MULTIPLIER = 100;
const PENDING_PAYMENT_MAX_AGE_MINUTES = 30;

// ============================================================
// GENERAL HELPERS
// ============================================================

function parsePositiveId(value) {
  const id = Number(value);

  if (!Number.isSafeInteger(id) || id <= 0) {
    return null;
  }

  return id;
}

function createPaymentReference(organizationId) {
  // Paystack references may contain alphanumeric characters and - . = only.
  return `DGK${organizationId}${Date.now()}${crypto.randomBytes(6).toString("hex")}`;
}

function getPaystackSecret() {
  const secret = process.env.PAYSTACK_SECRET_KEY?.trim();

  if (!secret) {
    throw new Error("PAYSTACK_SECRET_KEY is not configured.");
  }

  const mode = (process.env.PAYSTACK_MODE || "test").trim().toLowerCase();

  if (mode === "test" && !secret.startsWith("sk_test_")) {
    throw new Error("PAYSTACK_MODE is test, but PAYSTACK_SECRET_KEY is not a test secret key.");
  }

  if (mode === "live" && !secret.startsWith("sk_live_")) {
    throw new Error("PAYSTACK_MODE is live, but PAYSTACK_SECRET_KEY is not a live secret key.");
  }

  if (!["test", "live"].includes(mode)) {
    throw new Error("PAYSTACK_MODE must be either test or live.");
  }

  return secret;
}


async function paystackRequest(endpoint, options = {}) {
  const secret = getPaystackSecret();
  const method = options.method || "GET";

  // Never print payment references or customer information.
  const endpointLabel = endpoint.startsWith("/transaction/verify/")
    ? "/transaction/verify/:reference"
    : endpoint;

  let response;

  try {
    response = await fetch(`${PAYSTACK_BASE_URL}${endpoint}`, {
      method,
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(20000)
    });
  } catch (error) {
    console.error("PAYSTACK NETWORK DIAGNOSTIC:", {
      endpoint: endpointLabel,
      method,
      errorName: error.name,
      errorMessage: String(error.message || "Network request failed").slice(0, 160)
    });

    throw error;
  }

  let payload;

  try {
    payload = await response.json();
  } catch (error) {
    console.error("PAYSTACK RESPONSE PARSE DIAGNOSTIC:", {
      endpoint: endpointLabel,
      method,
      httpStatus: response.status,
      errorName: error.name
    });

    throw new Error("Paystack returned an unreadable response.");
  }

  const data =
    payload?.data && typeof payload.data === "object"
      ? payload.data
      : null;

  const requestedReference =
    typeof options.body?.reference === "string"
      ? options.body.reference
      : null;

  // Safe diagnostics: no secret key, phone number, email or full reference.
  const diagnostics = {
    endpoint: endpointLabel,
    method,
    httpStatus: response.status,
    httpOk: response.ok,
    apiStatus: payload?.status ?? null,
    apiMessage:
      typeof payload?.message === "string"
        ? payload.message.slice(0, 160)
        : null,
    paymentStatus: data?.status ?? null,
    hasReference: Boolean(
      typeof data?.reference === "string" && data.reference.length > 0
    ),
    referenceMatchesRequest: requestedReference
      ? data?.reference === requestedReference
      : null,
    hasDisplayText: Boolean(
      typeof data?.display_text === "string" &&
      data.display_text.length > 0
    )
  };

  console.info("PAYSTACK RESPONSE DIAGNOSTIC:", diagnostics);

  if (!response.ok || payload?.status !== true) {
    const message =
      typeof payload?.message === "string"
        ? payload.message
        : `Paystack request failed with HTTP ${response.status}.`;

    const error = new Error(message);
    error.statusCode = response.status;
    throw error;
  }

  return payload.data;
}


function normalizeKenyanPhone(value) {
  if (typeof value !== "string") {
    return null;
  }

  let phone = value.replace(/[\s()-]/g, "");

  if (phone.startsWith("+")) {
    phone = phone.slice(1);
  }

  if (/^0[17]\d{8}$/.test(phone)) {
    phone = `254${phone.slice(1)}`;
  } else if (/^[17]\d{8}$/.test(phone)) {
    phone = `254${phone}`;
  }

  if (!/^254[17]\d{8}$/.test(phone)) {
    return null;
  }

  // Paystack recommends the international format for Kenyan M-PESA,
  // for example +254722000000.
  return `+${phone}`;
}

function getPlanAmountKes(plan, billingCycle) {
  const rawAmount =
    billingCycle === "annual"
      ? plan.annual_price_kes
      : plan.monthly_price_kes;

  const amountKes = Number(rawAmount);

  if (!Number.isFinite(amountKes) || amountKes <= 0) {
    return null;
  }

  // Paystack expects KES in cents (multiply KES by 100).
  const amountSubunits = Math.round(amountKes * KES_SUBUNIT_MULTIPLIER);

  if (!Number.isSafeInteger(amountSubunits) || amountSubunits < 100) {
    return null;
  }

  return { amountKes, amountSubunits };
}

async function requireOrganizationAdmin(organizationId, userId) {
  const result = await pool.query(
    `
    SELECT role
    FROM organization_members
    WHERE organization_id = $1
      AND user_id = $2
    LIMIT 1
    `,
    [organizationId, userId]
  );

  if (result.rows.length === 0) {
    return { allowed: false, status: 403, message: "You are not a member of this business." };
  }

  if (result.rows[0].role !== "admin") {
    return { allowed: false, status: 403, message: "Only business admins can manage payments and subscriptions." };
  }

  return { allowed: true };
}

function getVerificationEndpoint(provider, reference) {
  // Paystack's Verify Transaction API is used for both card and M-PESA.
  // For M-PESA, Paystack specifically recommends transaction verification
  // if the charge.success webhook has not arrived within the expected window.
  // Do not call /charge/:reference; that is not the verification endpoint.
  const safeReference = encodeURIComponent(reference);
  return `/transaction/verify/${safeReference}`;
}

async function verifyPaystackPayment(provider, reference) {
  const endpoint = getVerificationEndpoint(provider, reference);
  return paystackRequest(endpoint, { method: "GET" });
}

// ============================================================
// PAYMENT FINALIZATION
// Only verified Paystack transactions can activate a plan.
// ============================================================

async function finalizeSuccessfulPayment(reference, verifiedData) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const paymentResult = await client.query(
      `
      SELECT *
      FROM subscription_payments
      WHERE idempotency_key = $1
         OR provider_transaction_id = $1
      ORDER BY id DESC
      LIMIT 1
      FOR UPDATE
      `,
      [reference]
    );

    if (paymentResult.rows.length === 0) {
      throw new Error("Payment reference was not found in DeviceGuardKE.");
    }

    const payment = paymentResult.rows[0];

    if (payment.status === "succeeded") {
      await client.query("COMMIT");
      return {
        alreadyProcessed: true,
        organizationId: payment.organization_id,
        subscriptionId: payment.subscription_id
      };
    }

    if (verifiedData?.status !== "success") {
      throw new Error("Paystack has not confirmed a successful payment.");
    }

    if (verifiedData.reference !== reference) {
      throw new Error("Paystack payment reference does not match.");
    }

    if (String(verifiedData.currency || "").toUpperCase() !== PAYMENT_CURRENCY) {
      throw new Error("Paystack payment currency does not match KES.");
    }

    const expectedAmount = Math.round(
      Number(payment.amount_kes) * KES_SUBUNIT_MULTIPLIER
    );
    const receivedAmount = Number(verifiedData.amount);

    if (!Number.isSafeInteger(receivedAmount) || receivedAmount !== expectedAmount) {
      throw new Error("Paystack payment amount does not match the subscription price.");
    }

    if (!payment.subscription_id) {
      throw new Error("Payment is not linked to a subscription request.");
    }

    // Serialize subscription changes for this organization.
    const organizationResult = await client.query(
      `
      SELECT id
      FROM organizations
      WHERE id = $1
      FOR UPDATE
      `,
      [payment.organization_id]
    );

    if (organizationResult.rows.length === 0) {
      throw new Error("Business associated with this payment no longer exists.");
    }

    const subscriptionResult = await client.query(
      `
      SELECT id, organization_id, billing_cycle, status
      FROM organization_subscriptions
      WHERE id = $1
        AND organization_id = $2
      FOR UPDATE
      `,
      [payment.subscription_id, payment.organization_id]
    );

    if (subscriptionResult.rows.length === 0) {
      throw new Error("Subscription request associated with this payment was not found.");
    }

    const subscription = subscriptionResult.rows[0];

    // Retire the previous plan only after the new payment is verified.
    await client.query(
      `
      UPDATE organization_subscriptions
      SET status = 'expired',
          updated_at = NOW()
      WHERE organization_id = $1
        AND id <> $2
        AND status IN ('active', 'trialing', 'past_due')
      `,
      [payment.organization_id, subscription.id]
    );

    const activated = await client.query(
      `
      UPDATE organization_subscriptions
      SET status = 'active',
          current_period_start = NOW(),
          current_period_end = CASE
            WHEN billing_cycle = 'annual' THEN NOW() + INTERVAL '1 year'
            ELSE NOW() + INTERVAL '1 month'
          END,
          payment_provider = 'paystack',
          provider_subscription_id = $2,
          updated_at = NOW()
      WHERE id = $1
      RETURNING id, organization_id, plan_id, status, billing_cycle,
                current_period_start, current_period_end, payment_provider
      `,
      [subscription.id, reference]
    );

    const paymentMetadata = {
      gateway: "paystack",
      paystack_transaction_id: verifiedData.id ? String(verifiedData.id) : null,
      paystack_channel: verifiedData.channel || payment.provider,
      verified_at: new Date().toISOString()
    };

    await client.query(
      `
      UPDATE subscription_payments
      SET status = 'succeeded',
          provider_transaction_id = $2,
          paid_at = COALESCE($3::timestamptz, NOW()),
          failure_reason = NULL,
          metadata = COALESCE(metadata, '{}'::jsonb) || $4::jsonb,
          updated_at = NOW()
      WHERE id = $1
      `,
      [
        payment.id,
        reference,
        verifiedData.paid_at || verifiedData.transaction_date || null,
        JSON.stringify(paymentMetadata)
      ]
    );

    await client.query("COMMIT");

    return {
      alreadyProcessed: false,
      organizationId: payment.organization_id,
      subscriptionId: subscription.id,
      subscription: activated.rows[0]
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function recordNonSuccessfulPayment(reference, paystackStatus, message) {
  const allowedStatuses = {
    failed: "failed",
    abandoned: "failed",
    reversed: "reversed",
    refunded: "refunded"
  };

  const localStatus = allowedStatuses[String(paystackStatus || "").toLowerCase()];

  if (!localStatus) {
    return false;
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `
      SELECT id, subscription_id, status
      FROM subscription_payments
      WHERE idempotency_key = $1
         OR provider_transaction_id = $1
      ORDER BY id DESC
      LIMIT 1
      FOR UPDATE
      `,
      [reference]
    );

    if (result.rows.length === 0) {
      await client.query("COMMIT");
      return false;
    }

    const payment = result.rows[0];

    // Never downgrade a successful payment because of a delayed status response.
    if (payment.status !== "succeeded") {
      await client.query(
        `
        UPDATE subscription_payments
        SET status = $2,
            failure_reason = $3,
            updated_at = NOW()
        WHERE id = $1
        `,
        [payment.id, localStatus, String(message || paystackStatus || "Payment was not successful.").slice(0, 1000)]
      );

      if (payment.subscription_id) {
        await client.query(
          `
          UPDATE organization_subscriptions
          SET status = 'canceled', updated_at = NOW()
          WHERE id = $1 AND status = 'pending'
          `,
          [payment.subscription_id]
        );
      }
    }

    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// ============================================================
// PAYSTACK WEBHOOK
// POST /api/subscriptions/paystack/webhook
// This route intentionally appears before router.use(auth).
// It is protected by Paystack HMAC SHA512 signature validation.
// ============================================================

router.post("/paystack/webhook", async (req, res) => {
  try {
    const secret = getPaystackSecret();
    const signature = req.get("x-paystack-signature");

    if (!Buffer.isBuffer(req.rawBody)) {
      return res.status(400).json({
        success: false,
        message: "Webhook raw body is unavailable. Check server JSON middleware."
      });
    }

    if (!signature || !/^[a-f0-9]{128}$/i.test(signature)) {
      return res.status(401).json({
        success: false,
        message: "Invalid Paystack webhook signature."
      });
    }

    const expectedSignature = crypto
      .createHmac("sha512", secret)
      .update(req.rawBody)
      .digest();

    const suppliedSignature = Buffer.from(signature, "hex");

    if (
      suppliedSignature.length !== expectedSignature.length ||
      !crypto.timingSafeEqual(suppliedSignature, expectedSignature)
    ) {
      return res.status(401).json({
        success: false,
        message: "Paystack webhook signature verification failed."
      });
    }

    const event = req.body;

    // We only grant subscription access for a verified charge.success event.
    if (event?.event !== "charge.success") {
      return res.sendStatus(200);
    }

    const reference = event?.data?.reference;

    if (typeof reference !== "string" || !reference) {
      return res.sendStatus(200);
    }

    const paymentResult = await pool.query(
      `
      SELECT provider, status
      FROM subscription_payments
      WHERE idempotency_key = $1
         OR provider_transaction_id = $1
      ORDER BY id DESC
      LIMIT 1
      `,
      [reference]
    );

    // Ignore valid Paystack events that do not belong to this application.
    if (paymentResult.rows.length === 0) {
      return res.sendStatus(200);
    }

    if (paymentResult.rows[0].status === "succeeded") {
      return res.sendStatus(200);
    }

    const verifiedData = await verifyPaystackPayment(
      paymentResult.rows[0].provider,
      reference
    );

    if (verifiedData?.status !== "success") {
      console.warn("PAYSTACK WEBHOOK RECEIVED BUT VERIFICATION IS NOT SUCCESSFUL:", reference);
      // Ask Paystack to retry rather than acknowledging a success event
      // that the server cannot yet independently verify.
      return res.status(500).json({
        success: false,
        message: "Payment verification is not complete yet."
      });
    }

    await finalizeSuccessfulPayment(reference, verifiedData);

    console.log("✅ PAYSTACK PAYMENT VERIFIED AND SUBSCRIPTION ACTIVATED:", reference);

    return res.sendStatus(200);
  } catch (error) {
    console.error("PAYSTACK WEBHOOK ERROR:", error.message);

    // A non-200 response asks Paystack to retry the webhook.
    return res.status(500).json({
      success: false,
      message: "Webhook processing failed."
    });
  }
});

// All routes below this point require an authenticated user.
router.use(auth);

// ============================================================
// LIST AVAILABLE SUBSCRIPTION PLANS
// GET /api/subscriptions/plans
// ============================================================

router.get("/plans", async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        id,
        code,
        name,
        description,
        monthly_price_kes,
        annual_price_kes,
        device_limit,
        staff_limit,
        features
      FROM subscription_plans
      WHERE is_active = TRUE
      ORDER BY monthly_price_kes ASC, id ASC
      `
    );

    return res.json({
      success: true,
      plans: result.rows
    });
  } catch (err) {
    console.error("SUBSCRIPTION PLANS ERROR:", err.message);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve subscription plans."
    });
  }
});

// ============================================================
// GET A BUSINESS'S SUBSCRIPTION
// GET /api/subscriptions/organizations/:organizationId
// Prefer the currently active subscription over pending attempts.
// ============================================================

router.get("/organizations/:organizationId", async (req, res) => {
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
      SELECT role
      FROM organization_members
      WHERE organization_id = $1
        AND user_id = $2
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
        s.id,
        s.organization_id,
        s.plan_id,
        s.status,
        s.billing_cycle,
        s.current_period_start,
        s.current_period_end,
        s.trial_ends_at,
        s.cancel_at_period_end,
        s.payment_provider,
        s.created_at,
        s.updated_at,
        p.code AS plan_code,
        p.name AS plan_name,
        p.monthly_price_kes,
        p.annual_price_kes,
        p.device_limit,
        p.staff_limit,
        p.features
      FROM organization_subscriptions s
      JOIN subscription_plans p ON p.id = s.plan_id
      WHERE s.organization_id = $1
      ORDER BY
        CASE s.status
          WHEN 'active' THEN 0
          WHEN 'trialing' THEN 1
          WHEN 'past_due' THEN 2
          WHEN 'pending' THEN 3
          ELSE 4
        END,
        s.created_at DESC,
        s.id DESC
      LIMIT 1
      `,
      [organizationId]
    );

    return res.json({
      success: true,
      organization_id: organizationId,
      subscription: result.rows[0] || null
    });
  } catch (err) {
    console.error("GET BUSINESS SUBSCRIPTION ERROR:", err.message);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve business subscription."
    });
  }
});

// ============================================================
// INITIALIZE PAYSTACK PAYMENT
// POST /api/subscriptions/organizations/:organizationId/paystack/initialize
//
// JSON body for M-PESA:
// {
//   "plan_id": 2,
//   "billing_cycle": "monthly",
//   "payment_method": "mpesa",
//   "phone_number": "0712345678"
// }
//
// JSON body for card checkout:
// {
//   "plan_id": 2,
//   "billing_cycle": "monthly",
//   "payment_method": "card"
// }
// ============================================================

router.post(
  "/organizations/:organizationId/paystack/initialize",
  async (req, res) => {
    let client;
    let transactionStarted = false;
    let createdSubscriptionId = null;
    let createdPaymentId = null;
    let reference = null;

    try {
      // Validate server payment configuration before creating database records.
      getPaystackSecret();

      const organizationId = parsePositiveId(req.params.organizationId);
      const planId = parsePositiveId(req.body?.plan_id);
      const billingCycle =
        typeof req.body?.billing_cycle === "string"
          ? req.body.billing_cycle.trim().toLowerCase()
          : "monthly";
      const paymentMethod =
        typeof req.body?.payment_method === "string"
          ? req.body.payment_method.trim().toLowerCase()
          : "";

      if (!organizationId || !planId) {
        return res.status(400).json({
          success: false,
          message: "Valid organization ID and plan ID are required."
        });
      }

      if (!["monthly", "annual"].includes(billingCycle)) {
        return res.status(400).json({
          success: false,
          message: "Billing cycle must be monthly or annual."
        });
      }

      if (!["mpesa", "card"].includes(paymentMethod)) {
        return res.status(400).json({
          success: false,
          message: "Payment method must be mpesa or card."
        });
      }

      const phoneNumber =
        paymentMethod === "mpesa"
          ? normalizeKenyanPhone(req.body?.phone_number)
          : null;

      if (paymentMethod === "mpesa" && !phoneNumber) {
        return res.status(400).json({
          success: false,
          message: "Enter a valid Kenyan M-PESA number, for example 0712345678."
        });
      }

      client = await pool.connect();
      await client.query("BEGIN");
      transactionStarted = true;

      const organization = await client.query(
        `
        SELECT id
        FROM organizations
        WHERE id = $1
        FOR UPDATE
        `,
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
        SELECT role
        FROM organization_members
        WHERE organization_id = $1
          AND user_id = $2
        LIMIT 1
        `,
        [organizationId, req.user.id]
      );

      if (
        membership.rows.length === 0 ||
        membership.rows[0].role !== "admin"
      ) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return res.status(403).json({
          success: false,
          message: "Only business admins can purchase or change a subscription."
        });
      }

      const userResult = await client.query(
        `SELECT email FROM users WHERE id = $1 LIMIT 1`,
        [req.user.id]
      );

      const email = userResult.rows[0]?.email;

      if (!email) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return res.status(400).json({
          success: false,
          message: "A valid account email is required to initialize Paystack payment."
        });
      }

      const planResult = await client.query(
        `
        SELECT id, code, name, monthly_price_kes, annual_price_kes,
               device_limit, staff_limit
        FROM subscription_plans
        WHERE id = $1 AND is_active = TRUE
        LIMIT 1
        `,
        [planId]
      );

      if (planResult.rows.length === 0) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return res.status(404).json({
          success: false,
          message: "Subscription plan not found or inactive."
        });
      }

      const plan = planResult.rows[0];

      if (plan.code === "free") {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return res.status(400).json({
          success: false,
          message: "The Free plan does not require a Paystack payment."
        });
      }

      const price = getPlanAmountKes(plan, billingCycle);

      if (!price) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return res.status(400).json({
          success: false,
          message: "The selected plan does not have a valid price for this billing cycle."
        });
      }

      // Allow an upgrade while the current plan remains active.
      const activeSubscription = await client.query(
        `
        SELECT id, plan_id, billing_cycle
        FROM organization_subscriptions
        WHERE organization_id = $1
          AND status = 'active'
        ORDER BY created_at DESC, id DESC
        LIMIT 1
        FOR UPDATE
        `,
        [organizationId]
      );

      if (
        activeSubscription.rows.length > 0 &&
        Number(activeSubscription.rows[0].plan_id) === Number(planId) &&
        activeSubscription.rows[0].billing_cycle === billingCycle
      ) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return res.status(409).json({
          success: false,
          message: "This plan and billing cycle are already active for the business."
        });
      }

      // Expire abandoned payment attempts after 30 minutes, allowing a fresh attempt.
      await client.query(
        `
        UPDATE subscription_payments
        SET status = 'failed',
            failure_reason = 'Payment attempt expired.',
            updated_at = NOW()
        WHERE organization_id = $1
          AND status = 'pending'
          AND subscription_id IN (
            SELECT id
            FROM organization_subscriptions
            WHERE organization_id = $1
              AND status = 'pending'
              AND created_at < NOW() - ($2 * INTERVAL '1 minute')
          )
        `,
        [organizationId, PENDING_PAYMENT_MAX_AGE_MINUTES]
      );

      await client.query(
        `
        UPDATE organization_subscriptions
        SET status = 'canceled', updated_at = NOW()
        WHERE organization_id = $1
          AND status = 'pending'
          AND created_at < NOW() - ($2 * INTERVAL '1 minute')
        `,
        [organizationId, PENDING_PAYMENT_MAX_AGE_MINUTES]
      );

      const pendingSubscription = await client.query(
        `
        SELECT id
        FROM organization_subscriptions
        WHERE organization_id = $1
          AND status = 'pending'
        ORDER BY created_at DESC
        LIMIT 1
        `,
        [organizationId]
      );

      if (pendingSubscription.rows.length > 0) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return res.status(409).json({
          success: false,
          message: "This business already has a pending payment. Verify or wait for that payment before starting another."
        });
      }

      reference = createPaymentReference(organizationId);

      const subscriptionResult = await client.query(
        `
        INSERT INTO organization_subscriptions
          (organization_id, plan_id, status, billing_cycle, created_by)
        VALUES ($1, $2, 'pending', $3, $4)
        RETURNING id, organization_id, plan_id, status, billing_cycle, created_at
        `,
        [organizationId, planId, billingCycle, req.user.id]
      );

      createdSubscriptionId = subscriptionResult.rows[0].id;

      const paymentMetadata = {
        gateway: "paystack",
        mode: (process.env.PAYSTACK_MODE || "test").toLowerCase(),
        payment_method: paymentMethod,
        plan_code: plan.code,
        plan_name: plan.name,
        billing_cycle: billingCycle,
        reference
      };

      const paymentResult = await client.query(
        `
        INSERT INTO subscription_payments
          (
            subscription_id,
            organization_id,
            amount_kes,
            currency,
            provider,
            provider_transaction_id,
            idempotency_key,
            status,
            phone_number,
            metadata
          )
        VALUES ($1, $2, $3, 'KES', $4, $5, $6, 'pending', $7, $8::jsonb)
        RETURNING id, subscription_id, organization_id, amount_kes,
                  currency, provider, status, phone_number, created_at
        `,
        [
          createdSubscriptionId,
          organizationId,
          price.amountKes,
          paymentMethod,
          reference,
          reference,
          phoneNumber,
          JSON.stringify(paymentMetadata)
        ]
      );

      createdPaymentId = paymentResult.rows[0].id;

      await client.query("COMMIT");
      transactionStarted = false;

      // Call Paystack after committing the local pending payment records.
      let paystackData;

      const gatewayMetadata = {
        organization_id: String(organizationId),
        subscription_id: String(createdSubscriptionId),
        payment_id: String(createdPaymentId),
        plan_code: plan.code,
        billing_cycle: billingCycle,
        payment_method: paymentMethod
      };

      if (paymentMethod === "mpesa") {
        paystackData = await paystackRequest("/charge", {
          method: "POST",
          body: {
            email,
            amount: String(price.amountSubunits),
            currency: PAYMENT_CURRENCY,
            reference,
            mobile_money: {
              phone: phoneNumber,
              provider: "mpesa"
            },
            metadata: gatewayMetadata
          }
        });
      } else {
        const transactionBody = {
          email,
          amount: String(price.amountSubunits),
          currency: PAYMENT_CURRENCY,
          reference,
          channels: ["card"],
          metadata: JSON.stringify(gatewayMetadata)
        };

        if (process.env.PAYSTACK_CALLBACK_URL) {
          transactionBody.callback_url = process.env.PAYSTACK_CALLBACK_URL;
        }

        paystackData = await paystackRequest("/transaction/initialize", {
          method: "POST",
          body: transactionBody
        });
      }

      if (!paystackData || paystackData.reference !== reference) {
        throw new Error("Paystack did not return the expected payment reference.");
      }

      await pool.query(
        `
        UPDATE subscription_payments
        SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
            updated_at = NOW()
        WHERE id = $1
        `,
        [
          createdPaymentId,
          JSON.stringify({
            paystack_initial_status: paystackData.status || null,
            paystack_display_text: paystackData.display_text || null
          })
        ]
      );

      return res.status(201).json({
        success: true,
        message:
          paymentMethod === "mpesa"
            ? (paystackData.display_text || "M-PESA payment request sent. Check your phone and authorize the payment.")
            : "Paystack checkout initialized successfully.",
        payment: {
          id: createdPaymentId,
          reference,
          amount_kes: price.amountKes,
          currency: PAYMENT_CURRENCY,
          method: paymentMethod,
          status: paystackData.status || "pending",
          display_text: paystackData.display_text || null,
          authorization_url: paystackData.authorization_url || null,
          access_code: paystackData.access_code || null
        },
        subscription: subscriptionResult.rows[0]
      });
    } catch (err) {
      if (client && transactionStarted) {
        await client.query("ROLLBACK").catch(() => {});
      }

      if (createdPaymentId) {
        await pool.query(
          `
          UPDATE subscription_payments
          SET status = 'failed',
              failure_reason = $2,
              updated_at = NOW()
          WHERE id = $1 AND status = 'pending'
          `,
          [createdPaymentId, String(err.message || "Paystack initialization failed.").slice(0, 1000)]
        ).catch((databaseError) => {
          console.error("PAYSTACK PAYMENT FAILURE RECORD ERROR:", databaseError.message);
        });
      }

      if (createdSubscriptionId) {
        await pool.query(
          `
          UPDATE organization_subscriptions
          SET status = 'canceled', updated_at = NOW()
          WHERE id = $1 AND status = 'pending'
          `,
          [createdSubscriptionId]
        ).catch((databaseError) => {
          console.error("PAYSTACK SUBSCRIPTION FAILURE RECORD ERROR:", databaseError.message);
        });
      }

      console.error("PAYSTACK INITIALIZATION ERROR:", err.message);

      const statusCode = err.statusCode && err.statusCode >= 400 && err.statusCode < 500
        ? 502
        : 500;

      return res.status(statusCode).json({
        success: false,
        message: "Unable to initialize Paystack payment. Please try again or contact support."
      });
    } finally {
      if (client) {
        client.release();
      }
    }
  }
);

// ============================================================
// VERIFY A PAYMENT
// POST /api/subscriptions/organizations/:organizationId/paystack/verify
// Body: { "reference": "..." }
// ============================================================

router.post(
  "/organizations/:organizationId/paystack/verify",
  async (req, res) => {
    try {
      const organizationId = parsePositiveId(req.params.organizationId);
      const reference =
        typeof req.body?.reference === "string"
          ? req.body.reference.trim()
          : "";

      if (!organizationId || !/^[A-Za-z0-9.=-]{8,100}$/.test(reference)) {
        return res.status(400).json({
          success: false,
          message: "A valid organization ID and payment reference are required."
        });
      }

      const membership = await requireOrganizationAdmin(organizationId, req.user.id);

      if (!membership.allowed) {
        return res.status(membership.status).json({
          success: false,
          message: membership.message
        });
      }

      const paymentResult = await pool.query(
        `
        SELECT id, organization_id, provider, status, amount_kes,
               subscription_id, idempotency_key, provider_transaction_id
        FROM subscription_payments
        WHERE organization_id = $1
          AND (idempotency_key = $2 OR provider_transaction_id = $2)
        ORDER BY id DESC
        LIMIT 1
        `,
        [organizationId, reference]
      );

      if (paymentResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Payment reference was not found for this business."
        });
      }

      const payment = paymentResult.rows[0];

      if (payment.status === "succeeded") {
        return res.json({
          success: true,
          message: "This payment has already been verified.",
          payment_status: "success"
        });
      }

      const verifiedData = await verifyPaystackPayment(payment.provider, reference);

      if (verifiedData?.status === "success") {
        const result = await finalizeSuccessfulPayment(reference, verifiedData);

        return res.json({
          success: true,
          message: "Payment verified and subscription activated successfully.",
          payment_status: "success",
          subscription_id: result.subscriptionId
        });
      }

      const paystackStatus = String(verifiedData?.status || "pending").toLowerCase();

      if (["failed", "abandoned", "reversed", "refunded"].includes(paystackStatus)) {
        await recordNonSuccessfulPayment(
          reference,
          paystackStatus,
          verifiedData?.gateway_response || verifiedData?.message || paystackStatus
        );
      }

      return res.status(202).json({
        success: true,
        message: "Payment has not been confirmed yet. Complete or wait for the payment, then check again.",
        payment_status: paystackStatus
      });
    } catch (err) {
      console.error("PAYSTACK PAYMENT VERIFICATION ERROR:", err.message);

      return res.status(502).json({
        success: false,
        message: "Unable to verify this payment with Paystack right now. Please try again."
      });
    }
  }
);

// ============================================================
// LEGACY SUBSCRIPTION REQUEST ENDPOINT
// POST /api/subscriptions/organizations/:organizationId
//
// Paid plans must now use the Paystack initialize endpoint so
// no subscription can be activated without verified payment.
// ============================================================

router.post("/organizations/:organizationId", async (req, res) => {
  return res.status(410).json({
    success: false,
    message: "Direct subscription requests are no longer supported. Initialize payment through /api/subscriptions/organizations/:organizationId/paystack/initialize."
  });
});

module.exports = router;
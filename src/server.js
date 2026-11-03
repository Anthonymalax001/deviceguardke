
console.log("🚨 THIS IS THE REAL SERVER FILE RUNNING");

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

require("dotenv").config({ override: true });

const app = express();

// =========================
// PATH DEBUG
// =========================

console.log("📂 __dirname =", __dirname);

const publicPath = path.join(__dirname, "public");

console.log("📂 PUBLIC PATH =", publicPath);

console.log(
  "📂 MAP EXISTS =",
  fs.existsSync(path.join(publicPath, "map.html"))
);

console.log(
  "📂 EVIDENCE MAP EXISTS =",
  fs.existsSync(path.join(publicPath, "evidence-map.html"))
);

// =========================
// MIDDLEWARE
// =========================

app.use(cors());

// Capture the original request body specifically for
// Paystack webhook signature verification.
//
// Paystack signs the raw request body using HMAC SHA512.
// Do not replace this with JSON.stringify(req.body).

app.use(
  express.json({
    verify: (req, res, buf) => {
      const requestPath = req.originalUrl.split("?")[0];

      if (
        requestPath === "/api/subscriptions/paystack/webhook"
      ) {
        req.rawBody = Buffer.from(buf);
      }
    }
  })
);

// =========================
// STATIC FILES
// =========================

// Use the same storage root as routes/agent.js.
// Local default: deviceguardke/uploads
// Production: configured using UPLOADS_DIR.

const uploadsRoot = path.resolve(
  process.env.UPLOADS_DIR ||
  path.join(__dirname, "../uploads")
);

console.log("📂 UPLOADS ROOT =", uploadsRoot);

app.use(
  "/uploads",
  express.static(uploadsRoot)
);

app.use(express.static(publicPath));

// =========================
// DATABASE
// =========================

const db = require("./db");

// =========================
// TEST ROUTES
// =========================

app.get("/test123", (req, res) => {
  console.log("✅ TEST123 HIT");
  res.send("WORKING");
});

app.get("/check-static", (req, res) => {
  const filePath = path.join(publicPath, "map.html");

  console.log("📂 SENDING FILE:", filePath);

  res.sendFile(filePath);
});

app.get("/map-test", (req, res) => {
  res.sendFile(path.join(publicPath, "map.html"));
});

app.get("/evidence-map-test", (req, res) => {
  res.sendFile(path.join(publicPath, "evidence-map.html"));
});

app.get("/evidence", async (req, res) => {
  try {
    console.log("🔥 /evidence HIT");

    const result = await db.query(`
      SELECT *
      FROM device_evidence
      ORDER BY created_at DESC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("❌ EVIDENCE ERROR:", err);

    res.status(500).json({
      error: "Failed to retrieve evidence"
    });
  }
});

// =========================
// LOAD ROUTES
// =========================

console.log("🔥 LOADING AUTH ROUTES...");
const authRoutes = require("./routes/auth");

console.log("🔥 LOADING DEVICE ROUTES...");
const deviceRoutes = require("./routes/devices");

console.log("🔥 LOADING AGENT ROUTES...");
const agentRoutes = require("./routes/agent");

console.log("🔥 LOADING DASHBOARD ROUTES...");
const dashboardRoutes = require("./routes/dashboard");

console.log("🔥 LOADING LOCATION ROUTES...");
const locationRoutes = require("./routes/location");

console.log("🔥 LOADING EVIDENCE ROUTES...");
const evidenceRoutes = require("./routes/evidence");

console.log("🔎 LOADING VERIFICATION ROUTES...");
const verificationRoutes = require("./routes/verification");

console.log("🏢 LOADING BUSINESS ROUTES...");
const businessRoutes = require("./routes/business");

console.log("💳 LOADING SUBSCRIPTION ROUTES...");
const subscriptionRoutes = require("./routes/subscriptions");

// =========================
// MOUNT ROUTES
// =========================

app.use("/api/auth", authRoutes);
app.use("/api/devices", deviceRoutes);
app.use("/api/agent", agentRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/location", locationRoutes);
app.use("/api/evidence", evidenceRoutes);

console.log("🔎 MOUNTING PUBLIC VERIFICATION ROUTES...");

app.use("/api/verification", verificationRoutes);

// Business account routes require authentication
// through the middleware in routes/business.js.
app.use("/api/business", businessRoutes);

// Subscription routes will contain:
// - Authenticated subscription management routes.
// - A Paystack webhook route with its own signature verification.
//
// The webhook must be registered before router.use(auth)
// inside subscriptions.js.

app.use("/api/subscriptions", subscriptionRoutes);

// =========================
// ROUTE DIAGNOSTICS
// =========================

console.log(
  "🔍 REGISTERED VERIFICATION ROUTES:",
  verificationRoutes.stack.map((layer) => ({
    path: layer.route?.path,
    methods: layer.route?.methods
  }))
);

console.log(
  "🏢 REGISTERED BUSINESS ROUTES:",
  businessRoutes.stack.map((layer) => ({
    path: layer.route?.path,
    methods: layer.route?.methods
  }))
);

console.log(
  "💳 REGISTERED SUBSCRIPTION ROUTES:",
  subscriptionRoutes.stack.map((layer) => ({
    path: layer.route?.path,
    methods: layer.route?.methods
  }))
);

// =========================
// ROOT
// =========================

app.get("/", (req, res) => {
  res.send("Server is running...");
});

// =========================
// 404 HANDLER
// =========================

app.use((req, res) => {
  console.log("❌ 404 HIT:", req.method, req.url);

  res.status(404).json({
    error: "Route not found"
  });
});

// =========================
// ERROR HANDLER
// =========================

app.use((err, req, res, next) => {
  console.error("❌ EXPRESS ERROR:", err);

  if (res.headersSent) {
    return next(err);
  }

  res.status(500).json({
    error: "Internal server error"
  });
});

// =========================
// START SERVER
// =========================

const PORT = Number(process.env.PORT) || 5050;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log("🗄️ Database connection is managed by src/db.js");
});

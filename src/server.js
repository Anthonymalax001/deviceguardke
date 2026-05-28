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

app.use(express.json());

// =========================
// STATIC FILES
// =========================

// uploads folder
app.use(
  "/uploads",
  express.static(path.join(__dirname, "../uploads"))
);

// public folder
app.use(
  express.static(publicPath)
);

// =========================
// DATABASE
// =========================
const db = require("./db");

// =========================
// TEST ROUTE
// =========================
app.get("/test123", (req, res) => {

  console.log("✅ TEST123 HIT");

  res.send("WORKING");

});

// =========================
// CHECK STATIC
// =========================
app.get("/check-static", (req, res) => {

  const filePath = path.join(
    publicPath,
    "map.html"
  );

  console.log("📂 SENDING FILE:", filePath);

  res.sendFile(filePath);

});

// =========================
// MAP TEST
// =========================
app.get("/map-test", (req, res) => {

  res.sendFile(
    path.join(publicPath, "map.html")
  );

});

// =========================
// EVIDENCE MAP TEST
// =========================
app.get("/evidence-map-test", (req, res) => {

  res.sendFile(
    path.join(publicPath, "evidence-map.html")
  );

});

// =========================
// EVIDENCE TEST
// =========================
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
      error: err.message
    });

  }

});

// =========================
// ROUTES
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

// =========================
// USE ROUTES
// =========================
app.use("/api/auth", authRoutes);

app.use("/api/devices", deviceRoutes);

app.use("/api/agent", agentRoutes);

app.use("/api/dashboard", dashboardRoutes);

app.use("/api/locations", locationRoutes);

app.use("/api/evidence", evidenceRoutes);

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
// START SERVER
// =========================
const PORT = 5050;

app.listen(PORT, () => {

  console.log(`🚀 Server running on port ${PORT}`);

  console.log("🟢 Connected to database: deviceguard");

});
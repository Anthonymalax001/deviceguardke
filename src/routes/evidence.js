const express = require("express");
const router = express.Router();
const db = require("../db");

console.log("🔵 evidence.js LOADED");

// ================= TEST ROUTE =================
router.get("/test", (req, res) => {
  res.json({
    ok: true,
    message: "Evidence route is working",
  });
});

// ================= GET ALL EVIDENCE =================
router.get("/all", async (req, res) => {
  try {

    console.log("🔥 HIT /api/evidence/all");

    const result = await db.query(`
      SELECT *
      FROM device_evidence
      ORDER BY created_at DESC
    `);

    res.json(result.rows);

  } catch (err) {

    console.error("❌ ERROR:", err);

    res.status(500).json({
      error: err.message,
    });
  }
});

// ================= EVIDENCE MAP =================
router.get("/map", async (req, res) => {
  try {

    console.log("🗺️ HIT /api/evidence/map");

    const result = await db.query(`
      SELECT
        id,
        machine_id,
        file_path,
        latitude,
        longitude,
        created_at
      FROM device_evidence
      WHERE latitude IS NOT NULL
      AND longitude IS NOT NULL
      ORDER BY created_at DESC
    `);

    res.json(result.rows);

  } catch (err) {

    console.error("❌ MAP ERROR:", err);

    res.status(500).json({
      error: err.message,
    });
  }
});

module.exports = router;
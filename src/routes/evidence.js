
const express = require("express");
const router = express.Router();

const db = require("../db");
const auth = require("../middleware/auth");

console.log("🔵 evidence.js LOADED");

// ================= TEST ROUTE =================
router.get("/test", (req, res) => {
  res.json({
    ok: true,
    message: "Evidence route is working"
  });
});

// ================= GET ALL EVIDENCE =================
// Only return evidence belonging to devices owned
// by the authenticated user.
router.get("/all", auth, async (req, res) => {
  try {
    console.log(
      "🔥 HIT /api/evidence/all - USER:",
      req.user.id
    );

    const result = await db.query(
      `
      SELECT e.*
      FROM device_evidence e
      WHERE EXISTS (
        SELECT 1
        FROM devices d
        WHERE d.machine_id = e.machine_id
          AND d.user_id = $1
      )
      ORDER BY e.created_at DESC
      `,
      [req.user.id]
    );

    return res.json(result.rows);

  } catch (err) {
    console.error("❌ GET ALL EVIDENCE ERROR:", err);

    return res.status(500).json({
      error: "Failed to retrieve evidence"
    });
  }
});

// ================= EVIDENCE MAP =================
// Only return location records belonging to the
// authenticated user's registered devices.
router.get("/map", auth, async (req, res) => {
  try {
    console.log(
      "🗺️ HIT /api/evidence/map - USER:",
      req.user.id
    );

    const result = await db.query(
      `
      SELECT
        e.id,
        e.machine_id,
        e.file_path,
        e.latitude,
        e.longitude,
        e.created_at
      FROM device_evidence e
      WHERE e.latitude IS NOT NULL
        AND e.longitude IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM devices d
          WHERE d.machine_id = e.machine_id
            AND d.user_id = $1
        )
      ORDER BY e.created_at DESC
      `,
      [req.user.id]
    );

    return res.json(result.rows);

  } catch (err) {
    console.error("❌ EVIDENCE MAP ERROR:", err);

    return res.status(500).json({
      error: "Failed to retrieve evidence map"
    });
  }
});

module.exports = router;

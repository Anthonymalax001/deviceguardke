const express = require("express");
const db = require("../db");

const router = express.Router();

console.log("🔎 PUBLIC VERIFICATION ROUTE LOADED");

// Temporary diagnostic: confirms requests reach this router.
router.use((req, res, next) => {
  console.log(
    "🔎 VERIFICATION ROUTER HIT:",
    req.method,
    req.url
  );
  next();
});

// POST /api/verification/check
router.post("/check", async (req, res) => {
  try {
    const identifier = String(req.body?.identifier ?? "").trim();

    if (!identifier || identifier.length > 100) {
      return res.status(400).json({
        success: false,
        error: "Enter a valid IMEI or serial number."
      });
    }

    const isImei = /^\d{15}$/.test(identifier);

    if (
      !isImei &&
      !/^[a-zA-Z0-9._/-]{1,100}$/.test(identifier)
    ) {
      return res.status(400).json({
        success: false,
        error: "Invalid IMEI or serial number format."
      });
    }

    const result = await db.query(
      `
      SELECT EXISTS (
        SELECT 1
        FROM devices
        WHERE LOWER(BTRIM(status)) = 'stolen'
          AND (
            ($1::boolean AND imei = $2)
            OR ($1::boolean AND imei_2 = $2)
            OR (
              NOT $1::boolean
              AND UPPER(BTRIM(serial_number)) = UPPER($2)
            )
          )
      ) AS reported_stolen
      `,
      [isImei, identifier]
    );

    const reportedStolen = result.rows[0].reported_stolen;

    return res.json({
      success: true,
      result: reportedStolen
        ? "reported_stolen"
        : "no_stolen_report_found",
      message: reportedStolen
        ? "Warning: this device has been reported stolen."
        : "No stolen-device report was found for this identifier."
    });
  } catch (err) {
    console.error("❌ DEVICE VERIFICATION ERROR:", err);

    return res.status(500).json({
      success: false,
      error: "Verification is temporarily unavailable."
    });
  }
});

module.exports = router;
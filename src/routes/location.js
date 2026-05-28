console.log("🟣 location.js LOADED");

const express = require("express");
const router = express.Router();
const pool = require("../db");

// -------------------------
// TEST ROUTE
// -------------------------
router.get("/test", (req, res) => {

  console.log("✅ LOCATION TEST HIT");

  res.json({
    message: "LOCATION WORKS"
  });
});

// -------------------------
// UPDATE LOCATION
// -------------------------
router.post("/update", async (req, res) => {

  try {

    console.log("📍 Incoming location update:", req.body);

    const {
      device_id,
      ip,
      country,
      city,
      latitude,
      longitude,
      isp
    } = req.body;

    if (!device_id) {

      return res.status(400).json({
        error: "device_id is required"
      });
    }

    // =========================
    // SAVE LOCATION HISTORY
    // =========================
    const sql = `
      INSERT INTO device_location
      (
        device_id,
        ip,
        country,
        city,
        latitude,
        longitude,
        isp
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *;
    `;

    const values = [
      device_id,
      ip,
      country,
      city,
      latitude,
      longitude,
      isp
    ];

    const result = await pool.query(sql, values);

    // =========================
    // UPDATE DEVICE LIVE LOCATION
    // =========================
    await pool.query(
      `
      UPDATE devices
      SET
        latitude = $1,
        longitude = $2,
        ip = $3,
        city = $4,
        country = $5,
        isp = $6,
        last_seen = NOW()
      WHERE machine_id = $7
      `,
      [
        latitude || null,
        longitude || null,
        ip || null,
        city || null,
        country || null,
        isp || null,
        device_id
      ]
    );

    console.log("✅ Location saved:", result.rows[0]);

    return res.json({
      success: true,
      location: result.rows[0]
    });

  } catch (err) {

    console.error("❌ LOCATION ERROR:", err.message);

    res.status(500).json({
      error: "Server error updating location",
      details: err.message
    });
  }
});

// -------------------------
// GET LATEST LOCATION
// -------------------------
router.get("/:device_id", async (req, res) => {

  try {

    const { device_id } = req.params;

    console.log("📡 Fetching location for:", device_id);

    const sql = `
      SELECT *
      FROM device_location
      WHERE device_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const result = await pool.query(sql, [device_id]);

    if (result.rows.length === 0) {

      return res.status(404).json({
        error: "No location found"
      });
    }

    res.json(result.rows[0]);

  } catch (err) {

    console.error("❌ GET LOCATION ERROR:", err.message);

    res.status(500).json({
      error: "Failed to fetch location"
    });
  }
});

module.exports = router;
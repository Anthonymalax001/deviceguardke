const express = require("express");
const path = require("path");
const db = require("../db");
const auth = require("../middleware/auth");
const sendEmail = require("../utils/email");

const router = express.Router();

console.log("📦 Devices route active");

/* ============================================================
   GET ALL DEVICES FOR LOGGED-IN USER
============================================================ */
router.get("/", auth, async (req, res) => {
  try {
    const result = await db.query(
      `
      SELECT
        id,
        machine_id,
        hostname,
        platform,
        os_type,
        os_release,
        arch,
        status,
        last_seen,
        email
      FROM devices
      WHERE user_id = $1
      ORDER BY last_seen DESC
      `,
      [req.user.id]
    );

    res.json(result.rows);

  } catch (err) {

    console.error("❌ GET DEVICES ERROR:", err);

    res.status(500).json({
      error: err.message
    });
  }
});

/* ============================================================
   REGISTER DEVICE
============================================================ */
router.post("/", auth, async (req, res) => {

  try {

    const {
      machine_id,
      hostname,
      platform,
      os_type,
      os_release,
      arch,
      email
    } = req.body;

    const exists = await db.query(
      `
      SELECT id
      FROM devices
      WHERE machine_id = $1
      `,
      [machine_id]
    );

    if (exists.rows.length > 0) {

      return res.status(400).json({
        error: "Device already registered"
      });
    }

    const result = await db.query(
      `
      INSERT INTO devices
      (
        machine_id,
        hostname,
        platform,
        os_type,
        os_release,
        arch,
        email,
        status,
        last_seen,
        user_id
      )
      VALUES
      (
        $1,$2,$3,$4,$5,$6,$7,
        'active',
        NOW(),
        $8
      )
      RETURNING *
      `,
      [
        machine_id,
        hostname,
        platform,
        os_type,
        os_release,
        arch,
        email,
        req.user.id
      ]
    );

    res.json(result.rows[0]);

  } catch (err) {

    console.error("🔥 REGISTER ERROR:", err);

    res.status(500).json({
      error: err.message
    });
  }
});

/* ============================================================
   MARK DEVICE STOLEN
============================================================ */
router.put("/:machine_id/stolen", auth, async (req, res) => {

  try {

    const machineId = req.params.machine_id;

    const result = await db.query(
      `
      UPDATE devices
      SET status = 'stolen'
      WHERE machine_id = $1
      AND user_id = $2
      RETURNING *
      `,
      [machineId, req.user.id]
    );

    if (result.rows.length === 0) {

      return res.status(404).json({
        error: "Device not found"
      });
    }

    const device = result.rows[0];

    // ================= EMAIL =================
    try {

      await sendEmail(
        device.email,
        "🚨 Device Marked as Stolen",
        `
        <h2>🚨 DeviceGuard Alert</h2>

        <p>Your device has been marked as stolen.</p>

        <p>
          <b>Machine ID:</b>
          ${device.machine_id}
        </p>

        <p>
          <b>Hostname:</b>
          ${device.hostname}
        </p>

        <p>
          DeviceGuard will now begin collecting evidence.
        </p>

        <br>

        <p>— DeviceGuard Security</p>
        `
      );

      console.log("📧 Stolen email sent");

    } catch (emailErr) {

      console.log("⚠️ Email failed:", emailErr.message);
    }

    res.json({
      success: true,
      message: "Device marked stolen",
      device
    });

  } catch (err) {

    console.error("🔥 STOLEN ERROR:", err);

    res.status(500).json({
      error: err.message
    });
  }
});

/* ============================================================
   VIEW DEVICE EVIDENCE
============================================================ */
router.get("/:machine_id/evidence", auth, async (req, res) => {

  try {

    const machineId = req.params.machine_id;

    // ================= VERIFY OWNERSHIP =================
    const device = await db.query(
      `
      SELECT *
      FROM devices
      WHERE machine_id = $1
      AND user_id = $2
      `,
      [machineId, req.user.id]
    );

    if (device.rows.length === 0) {

      return res.status(404).send(`
        <h1>❌ Device not found</h1>
      `);
    }

    // ================= GET EVIDENCE =================
    const evidence = await db.query(
      `
      SELECT *
      FROM device_evidence
      WHERE machine_id = $1
      ORDER BY created_at DESC
      `,
      [machineId]
    );

    let html = `
    <html>

    <head>

      <title>Device Evidence</title>

      <style>

        body {
          font-family: Arial;
          background: #111827;
          color: white;
          padding: 30px;
        }

        h1 {
          color: #60a5fa;
        }

        .card {
          background: #1f2937;
          padding: 20px;
          margin-bottom: 25px;
          border-radius: 12px;
        }

        img {
          width: 100%;
          max-width: 700px;
          border-radius: 10px;
          margin-top: 10px;
          border: 2px solid #374151;
        }

        .meta {
          color: #d1d5db;
          margin-top: 10px;
        }

      </style>

    </head>

    <body>

      <h1>📸 Device Evidence</h1>

      <p>
        <b>Machine ID:</b>
        ${machineId}
      </p>

      <hr><br>
    `;

    if (evidence.rows.length === 0) {

      html += `
        <h2>No evidence uploaded yet.</h2>
      `;

    } else {

      for (const item of evidence.rows) {

        const imageUrl =
          `/uploads/evidence/${item.file_path}`;

        html += `
        <div class="card">

          <h2>
            ${item.type.toUpperCase()}
          </h2>

          <div class="meta">
            ${new Date(item.created_at).toLocaleString()}
          </div>

          <img src="${imageUrl}" />

        </div>
        `;
      }
    }

    html += `
      </body>
      </html>
    `;

    res.send(html);

  } catch (err) {

    console.error("🔥 EVIDENCE VIEW ERROR:", err);

    res.status(500).send(`
      <h1>Server Error</h1>
      <pre>${err.message}</pre>
    `);
  }
});

module.exports = router;
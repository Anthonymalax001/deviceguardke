const express = require("express");
const router = express.Router();
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const db = require("../db");
const sendEmail = require("../utils/email");
const auth = require("../middleware/auth");

console.log("🔥🔥 AGENT ROUTE VERSION WITH EMAIL ACTIVE 🔥🔥");

// ================= STORAGE =================
const uploadPath =
  "C:\\Users\\ADMIN\\Desktop\\deviceguardke\\uploads\\evidence";

fs.mkdirSync(uploadPath, { recursive: true });

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadPath);
  },

  filename: function (req, file, cb) {

    const unique =
      Date.now() + "-" + Math.round(Math.random() * 9999);

    cb(null, unique + "-" + file.originalname);
  },
});

const upload = multer({ storage });

// ================= DOWNLOAD AGENT =================
router.get(
  "/download",
  auth,
  async (req, res) => {

    try {

      const templatePath = path.join(
        __dirname,
        "../agent_template.py"
      );

      let agentCode = fs.readFileSync(
        templatePath,
        "utf8"
      );

      // INSERT USER ID INTO TEMPLATE
      agentCode = agentCode.replace(
        "{{USER_ID}}",
        req.user.id
      );

      const tempDir = path.join(
        __dirname,
        "../../temp"
      );

      fs.mkdirSync(tempDir, {
        recursive: true
      });

      const tempFilePath = path.join(
        tempDir,
        `deviceguard-agent-${req.user.id}.py`
      );

      fs.writeFileSync(
        tempFilePath,
        agentCode
      );

      res.download(
        tempFilePath,
        "deviceguard-agent.py",
        () => {

          try {

            fs.unlinkSync(tempFilePath);

          } catch (err) {

            console.log(
              "⚠️ Temp cleanup failed:",
              err.message
            );
          }
        }
      );

    } catch (err) {

      console.error(
        "🔥 DOWNLOAD AGENT ERROR:",
        err
      );

      res.status(500).json({
        error: err.message,
      });

    }
  }
);

// ================= HEARTBEAT =================
router.post("/heartbeat", async (req, res) => {

  try {

    const {
      machine_id,
      hostname,
      platform,
      os_release,
      user_id,
      ip,
      isp,
      city,
      country,
      latitude,
      longitude
    } = req.body;

    console.log("📡 Heartbeat:", machine_id);
    console.log("👤 USER_ID:", user_id);

    if (!machine_id) {

      return res.status(400).json({
        error: "machine_id missing",
      });

    }

    // CHECK EXISTING DEVICE
    let result = await db.query(
      `
      SELECT *
      FROM devices
      WHERE machine_id = $1
      `,
      [machine_id]
    );

    // ================= NEW DEVICE =================
    if (result.rows.length === 0) {

      console.log("🆕 New device registered");

      await db.query(
        `
        INSERT INTO devices
        (
          machine_id,
          hostname,
          platform,
          os_release,
          user_id,
          ip,
          isp,
          city,
          country,
          latitude,
          longitude,
          status,
          last_seen
        )
        VALUES
        (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
          'active',
          NOW()
        )
        `,
        [
          machine_id,
          hostname || null,
          platform || null,
          os_release || null,
          user_id || null,
          ip || null,
          isp || null,
          city || null,
          country || null,
          latitude || null,
          longitude || null
        ]
      );

      return res.json({
        success: true,
        instruction: "NONE",
      });
    }

    // ================= FIX USER OWNERSHIP =================
    await db.query(
      `
      UPDATE devices
      SET
        hostname = $2,
        platform = $3,
        os_release = $4,
        user_id = $5,
        ip = $6,
        isp = $7,
        city = $8,
        country = $9,
        latitude = $10,
        longitude = $11,
        last_seen = NOW()
      WHERE machine_id = $1
      `,
      [
        machine_id,
        hostname || null,
        platform || null,
        os_release || null,
        user_id || null,
        ip || null,
        isp || null,
        city || null,
        country || null,
        latitude || null,
        longitude || null
      ]
    );

    // REFETCH UPDATED DEVICE
    result = await db.query(
      `
      SELECT *
      FROM devices
      WHERE machine_id = $1
      `,
      [machine_id]
    );

    const status = result.rows[0].status;

    console.log("📊 Device status:", status);

    if (status === "stolen") {

      console.log("🚨 CAPTURE_EVIDENCE SENT");

      return res.json({
        success: true,
        instruction: "CAPTURE_EVIDENCE",
      });
    }

    return res.json({
      success: true,
      instruction: "NONE",
    });

  } catch (err) {

    console.error("🔥 HEARTBEAT ERROR:", err);

    res.status(500).json({
      error: err.message,
    });

  }
});

// ================= EMAIL HELPER =================
async function sendEvidenceEmail(machine_id, filePath, type) {

  try {

    console.log("\n========================================");
    console.log("📧 STARTING EMAIL PROCESS");
    console.log("📎 FILE PATH:", filePath);

    const exists = fs.existsSync(filePath);

    if (!exists) {

      console.log("❌ FILE NOT FOUND");
      return false;
    }

    const result = await db.query(
      `
      SELECT users.email
      FROM devices
      JOIN users
      ON devices.user_id = users.id
      WHERE devices.machine_id = $1
      LIMIT 1
      `,
      [machine_id]
    );

    if (result.rows.length === 0) {

      console.log("❌ USER EMAIL NOT FOUND");
      return false;
    }

    const email = result.rows[0].email;

    const success = await sendEmail(
      email,
      `📸 DeviceGuard ${type} Evidence`,
      `
      <h2>📸 New ${type} Evidence Captured</h2>

      <p>Your stolen device uploaded new evidence.</p>

      <p><b>Machine ID:</b> ${machine_id}</p>

      <br>

      <p>— DeviceGuard Security</p>
      `,
      [filePath]
    );

    console.log("📬 EMAIL SUCCESS:", success);

    return success;

  } catch (err) {

    console.log("❌ EMAIL PROCESS FAILED");
    console.log(err);

    return false;
  }
}

// ================= SCREENSHOT =================
router.post(
  "/upload/screenshot",
  upload.single("screenshot"),
  async (req, res) => {

    try {

      const {
        machine_id,
        latitude,
        longitude,
        city,
        country
      } = req.body;

      if (!machine_id || !req.file) {

        return res.status(400).json({
          error: "Missing machine_id or file",
        });
      }

      const fullPath = path.join(
        uploadPath,
        req.file.filename
      );

      await db.query(
        `
        INSERT INTO device_evidence
        (
          machine_id,
          type,
          file_path,
          latitude,
          longitude,
          city,
          country,
          created_at
        )
        VALUES
        (
          $1,
          'screenshot',
          $2,
          $3,
          $4,
          $5,
          $6,
          NOW()
        )
        `,
        [
          machine_id,
          req.file.filename,
          latitude || null,
          longitude || null,
          city || null,
          country || null
        ]
      );

      await sendEvidenceEmail(
        machine_id,
        fullPath,
        "Screenshot"
      );

      res.json({
        success: true,
      });

    } catch (err) {

      console.error("🔥 SCREENSHOT ERROR:", err);

      res.status(500).json({
        error: err.message,
      });
    }
  }
);

// ================= CAMERA =================
router.post(
  "/upload/camera",
  upload.single("camera"),
  async (req, res) => {

    try {

      const {
        machine_id,
        latitude,
        longitude,
        city,
        country
      } = req.body;

      if (!machine_id || !req.file) {

        return res.status(400).json({
          error: "Missing machine_id or file",
        });
      }

      const fullPath = path.join(
        uploadPath,
        req.file.filename
      );

      await db.query(
        `
        INSERT INTO device_evidence
        (
          machine_id,
          type,
          file_path,
          latitude,
          longitude,
          city,
          country,
          created_at
        )
        VALUES
        (
          $1,
          'camera',
          $2,
          $3,
          $4,
          $5,
          $6,
          NOW()
        )
        `,
        [
          machine_id,
          req.file.filename,
          latitude || null,
          longitude || null,
          city || null,
          country || null
        ]
      );

      await sendEvidenceEmail(
        machine_id,
        fullPath,
        "Camera"
      );

      res.json({
        success: true,
      });

    } catch (err) {

      console.error("🔥 CAMERA ERROR:", err);

      res.status(500).json({
        error: err.message,
      });
    }
  }
);

module.exports = router;
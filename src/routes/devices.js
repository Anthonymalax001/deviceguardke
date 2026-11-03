const express = require("express");

const crypto = require("crypto");

const db = require("../db");

const auth = require("../middleware/auth");

const sendEmail = require("../utils/email");



const router = express.Router();



console.log("📦 Devices route active - enhanced device identity version");
// ============================================================// HELPERS// ============================================================
function cleanString(value) {

  if (value === undefined || value === null) {

    return null;

  }



  const cleaned = String(value).trim();

  return cleaned === "" ? null : cleaned;

}



function isValidImei(value) {

  if (!value) {

    return true;

  }



  return /^\d{15}$/.test(value);

}



function escapeHtml(value) {

  return String(value ?? "")

    .replace(/&/g, "&amp;")

    .replace(/</g, "&lt;")

    .replace(/>/g, "&gt;")

    .replace(/"/g, "&quot;")

    .replace(/'/g, "&#039;");

}
// ============================================================// GET ALL DEVICES FOR LOGGED-IN USER// ============================================================
router.get("/", auth, async (req, res) => {

  try {

    console.log("📱 GET DEVICES USER_ID:", req.user.id);



    const result = await db.query(

      `

      SELECT

        id,

        user_id,

        name,

        type,

        imei,

        imei_2,

        serial_number,

        mac_address,

        brand,

        model,

        status,

        device_type,

        machine_id,

        owner_name,

        hostname,

        platform,

        os_type,

        os_release,

        arch,

        last_seen,

        email,

        ip,

        isp,

        city,

        country,

        latitude,

        longitude

      FROM devices

      WHERE user_id = $1

      ORDER BY last_seen DESC NULLS LAST, id DESC

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
// ============================================================// ENSURE AGENT TOKEN// ============================================================
router.post("/:machine_id/agent-token", auth, async (req, res) => {

  try {

    const machineId = cleanString(req.params.machine_id);



    if (!machineId) {

      return res.status(400).json({

        error: "machine_id is required"

      });

    }



    const existing = await db.query(

      `

      SELECT

        id,

        machine_id,

        agent_token

      FROM devices

      WHERE machine_id = $1

      AND user_id = $2

      LIMIT 1

      `,

      [machineId, req.user.id]

    );



    if (existing.rows.length === 0) {

      return res.status(404).json({

        error: "Device not found"

      });

    }



    const device = existing.rows[0];
// Existing token — keep it.
    if (device.agent_token) {

      return res.json({

        success: true,

        agent_token: device.agent_token

      });

    }
// Generate a new secure agent token.
    const agentToken = crypto.randomBytes(32).toString("hex");



    const result = await db.query(

      `

      UPDATE devices

      SET agent_token = $1

      WHERE id = $2

      AND user_id = $3

      RETURNING id, machine_id, agent_token

      `,

      [

        agentToken,

        device.id,

        req.user.id

      ]

    );



    console.log(

      "🔐 AGENT TOKEN CREATED:",

      machineId,

      "USER_ID:",

      req.user.id

    );



    res.json({

      success: true,

      agent_token: result.rows[0].agent_token

    });

  } catch (err) {

    console.error("🔥 AGENT TOKEN ERROR:", err);



    res.status(500).json({

      error: err.message

    });

  }

});
// ============================================================// REGISTER DEVICE// ============================================================
router.post("/", auth, async (req, res) => {

  try {

    const {

      machine_id,

      name,

      type,

      imei,

      imei_2,

      serial_number,

      mac_address,

      brand,

      model,

      device_type,

      owner_name,

      hostname,

      platform,

      os_type,

      os_release,

      arch,

      email

    } = req.body;



    const machineId = cleanString(machine_id);



    if (!machineId) {

      return res.status(400).json({

        error: "machine_id is required"

      });

    }



    const normalizedImei = cleanString(imei);

    const normalizedImei2 = cleanString(imei_2);



    if (!isValidImei(normalizedImei)) {

      return res.status(400).json({

        error: "IMEI 1 must contain exactly 15 digits"

      });

    }



    if (!isValidImei(normalizedImei2)) {

      return res.status(400).json({

        error: "IMEI 2 must contain exactly 15 digits"

      });

    }



    const exists = await db.query(

      `

      SELECT

        id,

        user_id,

        machine_id,

        status

      FROM devices

      WHERE machine_id = $1

      LIMIT 1

      `,

      [machineId]

    );



    if (exists.rows.length > 0) {

      return res.status(400).json({

        error: "Device already registered",

        device: exists.rows[0]

      });

    }



    const resolvedOwnerName =

      cleanString(owner_name) || null;



    const resolvedEmail =

      cleanString(email) || req.user.email || null;
// Generate the agent token when the device is registered.
    const agentToken = crypto.randomBytes(32).toString("hex");



    const result = await db.query(

      `

      INSERT INTO devices

      (

        user_id,

        type,

        imei,

        imei_2,

        serial_number,

        mac_address,

        brand,

        model,

        status,

        device_type,

        machine_id,

        owner_name,

        name,

        hostname,

        platform,

        os_type,

        os_release,

        arch,

        email,

        agent_token,

        last_seen

      )

      VALUES

      (

        $1,

        $2,

        $3,

        $4,

        $5,

        $6,

        $7,

        $8,

        'active',

        $9,

        $10,

        $11,

        $12,

        $13,

        $14,

        $15,

        $16,

        $17,

        $18,

        $19,

        NOW()

      )

      RETURNING

        id,

        user_id,

        type,

        imei,

        imei_2,

        serial_number,

        mac_address,

        brand,

        model,

        status,

        device_type,

        machine_id,

        owner_name,

        name,

        hostname,

        platform,

        os_type,

        os_release,

        arch,

        email,

        last_seen,

        ip,

        isp,

        city,

        country,

        latitude,

        longitude

      `,

      [

        req.user.id,

        cleanString(type),

        normalizedImei,

        normalizedImei2,

        cleanString(serial_number),

        cleanString(mac_address),

        cleanString(brand),

        cleanString(model),

        cleanString(device_type),

        machineId,

        resolvedOwnerName,

        cleanString(name),

        cleanString(hostname),

        cleanString(platform),

        cleanString(os_type),

        cleanString(os_release),

        cleanString(arch),

        resolvedEmail,

        agentToken

      ]

    );



    console.log(

      "✅ DEVICE REGISTERED:",

      machineId,

      "USER_ID:",

      req.user.id

    );



    res.status(201).json({

      ...result.rows[0],

      agent_token: agentToken

    });

  } catch (err) {

    console.error("🔥 REGISTER ERROR:", err);



    res.status(500).json({

      error: err.message

    });

  }

});
// ============================================================// UPDATE DEVICE IDENTITY// ============================================================
router.put("/:machine_id/identity", auth, async (req, res) => {

  try {

    const machineId = cleanString(req.params.machine_id);



    if (!machineId) {

      return res.status(400).json({

        error: "machine_id is required"

      });

    }



    const {

      name,

      type,

      imei,

      imei_2,

      serial_number,

      brand,

      model,

      device_type,

      owner_name

    } = req.body;



    const normalizedImei = cleanString(imei);

    const normalizedImei2 = cleanString(imei_2);



    if (!isValidImei(normalizedImei)) {

      return res.status(400).json({

        error: "IMEI 1 must contain exactly 15 digits"

      });

    }



    if (!isValidImei(normalizedImei2)) {

      return res.status(400).json({

        error: "IMEI 2 must contain exactly 15 digits"

      });

    }



    const existing = await db.query(

      `

      SELECT id

      FROM devices

      WHERE machine_id = $1

      AND user_id = $2

      LIMIT 1

      `,

      [machineId, req.user.id]

    );



    if (existing.rows.length === 0) {

      return res.status(404).json({

        error: "Device not found"

      });

    }



    const result = await db.query(

      `

      UPDATE devices

      SET

        name = COALESCE($1, name),

        type = COALESCE($2, type),

        imei = COALESCE($3, imei),

        imei_2 = COALESCE($4, imei_2),

        serial_number = COALESCE($5, serial_number),

        brand = COALESCE($6, brand),

        model = COALESCE($7, model),

        device_type = COALESCE($8, device_type),

        owner_name = COALESCE($9, owner_name)

      WHERE machine_id = $10

      AND user_id = $11

      RETURNING \*

      `,

      [

        cleanString(name),

        cleanString(type),

        normalizedImei,

        normalizedImei2,

        cleanString(serial_number),

        cleanString(brand),

        cleanString(model),

        cleanString(device_type),

        cleanString(owner_name),

        machineId,

        req.user.id

      ]

    );



    console.log(

      "✅ DEVICE IDENTITY UPDATED:",

      machineId,

      "USER_ID:",

      req.user.id

    );



    res.json({

      success: true,

      device: result.rows[0]

    });

  } catch (err) {

    console.error("🔥 UPDATE IDENTITY ERROR:", err);



    res.status(500).json({

      error: err.message

    });

  }

});
// ============================================================// MARK DEVICE STOLEN// ============================================================
router.put("/:machine_id/stolen", auth, async (req, res) => {

  try {

    const machineId = cleanString(req.params.machine_id);



    if (!machineId) {

      return res.status(400).json({

        error: "machine_id is required"

      });

    }



    const result = await db.query(

      `

      UPDATE devices

      SET status = 'stolen'

      WHERE machine_id = $1

      AND user_id = $2

      RETURNING \*

      `,

      [machineId, req.user.id]

    );



    if (result.rows.length === 0) {

      return res.status(404).json({

        error: "Device not found"

      });

    }



    const device = result.rows[0];



    console.log(

      "🚨 DEVICE MARKED STOLEN:",

      device.machine_id,

      "USER_ID:",

      req.user.id

    );



    try {

      const ownerEmail =

        device.email ||

        req.user.email;



      if (ownerEmail) {

        await sendEmail(

          ownerEmail,

          "🚨 Device Marked as Stolen",

          `

          <h2>🚨 DeviceGuard Alert</h2>

          <p>Your device has been marked as stolen.</p>



          <p>

            <b>Machine ID:</b>

            ${escapeHtml(device.machine_id)}

          </p>



          <p>

            <b>Device:</b>

            ${escapeHtml(

              device.name ||

              device.model ||

              device.hostname ||

              "Unknown device"

            )}

          </p>



          <p>

            <b>Brand:</b>

            ${escapeHtml(device.brand || "Unknown")}

          </p>



          <p>

            <b>Model:</b>

            ${escapeHtml(device.model || "Unknown")}

          </p>



          <p>

            DeviceGuard will now enter the stolen-device recovery workflow.

          </p>



          <br>



          <p>— DeviceGuard Security</p>

          `

        );



        console.log("📧 Stolen email sent");

      } else {

        console.log(

          "⚠️ No owner email available for stolen-device alert"

        );

      }

    } catch (emailErr) {

      console.log(

        "⚠️ Email failed:",

        emailErr.message

      );

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
// ============================================================// VIEW DEVICE EVIDENCE// ============================================================
router.get("/:machine_id/evidence", auth, async (req, res) => {

  try {

    const machineId = cleanString(req.params.machine_id);



    const deviceResult = await db.query(

      `

      SELECT

        id,

        machine_id,

        user_id,

        name,

        brand,

        model,

        hostname,

        status

      FROM devices

      WHERE machine_id = $1

      AND user_id = $2

      LIMIT 1

      `,

      [machineId, req.user.id]

    );



    if (deviceResult.rows.length === 0) {

      return res.status(404).send(`

        <h1>❌ Device not found</h1>

      `);

    }



    const device = deviceResult.rows[0];



    const evidence = await db.query(

      `

      SELECT

        id,

        machine_id,

        type,

        file_path,

        latitude,

        longitude,

        city,

        country,

        created_at

      FROM device_evidence

      WHERE machine_id = $1

      ORDER BY created_at DESC

      `,

      [machineId]

    );



    let html = `

    <!DOCTYPE html>

    <html>

    <head>

      <meta charset="UTF-8">

      <meta name="viewport" content="width=device-width, initial-scale=1.0">

      <title>Device Evidence - DeviceGuard</title>



      <style>

        body {

          font-family: Arial, sans-serif;

          background: #111827;

          color: white;

          padding: 30px;

          margin: 0;

        }



        .container {

          max-width: 900px;

          margin: 0 auto;

        }



        h1 {

          color: #60a5fa;

          margin-bottom: 8px;

        }



        .subtitle {

          color: #9ca3af;

          margin-bottom: 25px;

        }



        .device-card,

        .card {

          background: #1f2937;

          padding: 20px;

          margin-bottom: 20px;

          border-radius: 12px;

        }



        .device-card {

          border-left: 4px solid #2563eb;

        }



        .meta {

          color: #d1d5db;

          margin-top: 8px;

          line-height: 1.6;

        }



        img {

          width: 100%;

          max-width: 700px;

          border-radius: 10px;

          margin-top: 12px;

          border: 2px solid #374151;

          display: block;

        }



        .location {

          color: #93c5fd;

          margin-top: 10px;

        }



        .empty {

          color: #9ca3af;

          font-size: 18px;

        }



        .status-stolen {

          color: #f87171;

          font-weight: bold;

        }



        .status-active {

          color: #4ade80;

          font-weight: bold;

        }

      </style>

    </head>



    <body>

      <div class="container">



        <h1>📸 DeviceGuard Evidence</h1>



        <div class="subtitle">

          Evidence belonging to your authorized device.

        </div>



        <div class="device-card">



          <h2>

            ${escapeHtml(

              device.name ||

              device.model ||

              device.hostname ||

              "Device"

            )}

          </h2>



          <div class="meta">

            <b>Machine ID:</b>

            ${escapeHtml(device.machine_id)}

          </div>



          <div class="meta">

            <b>Brand:</b>

            ${escapeHtml(device.brand || "Unknown")}

          </div>



          <div class="meta">

            <b>Model:</b>

            ${escapeHtml(device.model || "Unknown")}

          </div>



          <div class="meta">

            <b>Status:</b>



            <span class="${

              device.status === "stolen"

                ? "status-stolen"

                : "status-active"

            }">



              ${escapeHtml(

                String(device.status || "unknown").toUpperCase()

              )}



            </span>

          </div>



        </div>



        <hr>

        <br>

    `;



    if (evidence.rows.length === 0) {

      html += `

        <div class="card">

          <div class="empty">

            No evidence uploaded yet.

          </div>

        </div>

      `;

    } else {

      for (const item of evidence.rows) {

        const imageUrl =

          `/uploads/evidence/${encodeURIComponent(

            item.file_path

          )}`;



        const createdAt =

          item.created_at

            ? new Date(item.created_at).toLocaleString()

            : "Unknown";



        html += `

          <div class="card">



            <h2>

              ${escapeHtml(

                String(item.type || "evidence").toUpperCase()

              )}

            </h2>



            <div class="meta">

              <b>Captured:</b>

              ${escapeHtml(createdAt)}

            </div>

        `;



        if (

          item.latitude !== null &&

          item.latitude !== undefined &&

          item.longitude !== null &&

          item.longitude !== undefined

        ) {

          html += `

            <div class="location">

              📍 ${escapeHtml(item.latitude)},

              ${escapeHtml(item.longitude)}



              ${

                item.city || item.country

                  ? `<br>${escapeHtml(

                      [item.city, item.country]

                        .filter(Boolean)

                        .join(", ")

                    )}`

                  : ""

              }



            </div>

          `;

        }



        html += `

            <img

              src="${imageUrl}"

              alt="DeviceGuard evidence"

            />



          </div>

        `;

      }

    }



    html += `

      </div>

    </body>

    </html>

    `;



    res.send(html);

  } catch (err) {

    console.error(

      "🔥 EVIDENCE VIEW ERROR:",

      err

    );



    res.status(500).send(`

      <h1>Server Error</h1>

      <pre>${escapeHtml(err.message)}</pre>

    `);

  }

});




// ============================================================
// GET DEVICES BELONGING TO A BUSINESS
// The signed-in user must be a member of this organization.
// ============================================================

router.get("/business/:organizationId", auth, async (req, res) => {
  try {
    const organizationId = Number.parseInt(req.params.organizationId, 10);

    if (!Number.isInteger(organizationId) || organizationId <= 0) {
      return res.status(400).json({
        error: "A valid organizationId is required"
      });
    }

    const membership = await db.query(
      `
      SELECT organization_id, role
      FROM organization_members
      WHERE organization_id = $1
        AND user_id = $2
      LIMIT 1
      `,
      [organizationId, req.user.id]
    );

    if (membership.rows.length === 0) {
      return res.status(403).json({
        error: "You are not a member of this business"
      });
    }
    const result = await db.query(
      `
      SELECT
        id,
        user_id,
        organization_id,
        name,
        type,
        imei,
        imei_2,
        serial_number,
        mac_address,
        brand,
        model,
        status,
        device_type,
        machine_id,
        owner_name,
        hostname,
        platform,
        os_type,
        os_release,
        arch,
        last_seen,
        email,
        ip,
        isp,
        city,
        country,
        latitude,
        longitude
      FROM devices
      WHERE organization_id = $1
      ORDER BY last_seen DESC NULLS LAST, id DESC
      `,
      [organizationId]
    );
    return res.json(result.rows);
  } catch (err) {
    console.error("❌ GET BUSINESS DEVICES ERROR:", err);

    return res.status(500).json({
      error: "Failed to retrieve business devices"
    });
  }
});
// ============================================================
// GET DEVICES BELONGING TO A BUSINESS
// ============================================================

router.get("/business/:organizationId", auth, async (req, res) => {
  try {
    const organizationId = Number.parseInt(
      req.params.organizationId,
      10
    );

    if (!Number.isInteger(organizationId) || organizationId <= 0) {
      return res.status(400).json({
        error: "A valid organizationId is required"
      });
    }

    // Verify that the logged-in user belongs to this business.
    const membership = await db.query(
      `
      SELECT organization_id
      FROM organization_members
      WHERE organization_id = $1
        AND user_id = $2
      LIMIT 1
      `,
      [organizationId, req.user.id]
    );

    if (membership.rows.length === 0) {
      return res.status(403).json({
        error: "You are not a member of this business"
      });
    }

    const result = await db.query(
      `
      SELECT *
      FROM devices
      WHERE organization_id = $1
      ORDER BY last_seen DESC NULLS LAST, id DESC
      `,
      [organizationId]
    );

    return res.json(result.rows);
  } catch (err) {
    console.error("GET BUSINESS DEVICES ERROR:", err);

    return res.status(500).json({
      error: "Failed to retrieve business devices"
    });
  }
});
// ============================================================
// ASSIGN A REGISTERED DEVICE TO A BUSINESS
// Only a business admin can perform this action.
// The device must belong to the logged-in user.
// ============================================================

router.put("/:machine_id/business", auth, async (req, res) => {
  try {
    const machineId = cleanString(req.params.machine_id);
    const organizationId = Number.parseInt(
      req.body.organization_id,
      10
    );

    if (!machineId) {
      return res.status(400).json({
        error: "machine_id is required"
      });
    }

    if (
      !Number.isInteger(organizationId) ||
      organizationId <= 0
    ) {
      return res.status(400).json({
        error: "A valid organization_id is required"
      });
    }

    // Confirm that the logged-in user is an admin of this business.
    const membership = await db.query(
      `
      SELECT organization_id
      FROM organization_members
      WHERE organization_id = $1
        AND user_id = $2
        AND role = 'admin'
      LIMIT 1
      `,
      [organizationId, req.user.id]
    );

    if (membership.rows.length === 0) {
      return res.status(403).json({
        error: "You must be a business admin to assign devices"
      });
    }

    // The device must belong to the logged-in user.
    const existing = await db.query(
      `
      SELECT id, organization_id
      FROM devices
      WHERE machine_id = $1
        AND user_id = $2
      LIMIT 1
      `,
      [machineId, req.user.id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({
        error: "Device not found in your account"
      });
    }

    const currentOrganizationId =
      existing.rows[0].organization_id;

    // Do not silently move a device from another business.
    if (
      currentOrganizationId !== null &&
      Number(currentOrganizationId) !== organizationId
    ) {
      return res.status(409).json({
        error: "This device is already assigned to another business"
      });
    }

    const result = await db.query(
      `
      UPDATE devices
      SET organization_id = $1
      WHERE id = $2
        AND user_id = $3
        AND (
          organization_id IS NULL
          OR organization_id = $1
        )
      RETURNING
        id,
        user_id,
        organization_id,
        name,
        machine_id,
        type,
        brand,
        model,
        status,
        device_type,
        last_seen
      `,
      [
        organizationId,
        existing.rows[0].id,
        req.user.id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(409).json({
        error: "Device assignment could not be completed"
      });
    }

    return res.json({
      success: true,
      message: "Device assigned to business successfully",
      device: result.rows[0]
    });
  } catch (err) {
    console.error("BUSINESS DEVICE ASSIGNMENT ERROR:", err);

    return res.status(500).json({
      error: "Failed to assign device to business"
    });
  }
});

// ============================================================
// GET DEVICES BELONGING TO A BUSINESS
// ============================================================

router.get("/business/:organizationId", auth, async (req, res) => {
  try {
    const organizationId = Number.parseInt(
      req.params.organizationId,
      10
    );

    if (!Number.isInteger(organizationId) || organizationId <= 0) {
      return res.status(400).json({
        error: "A valid organizationId is required"
      });
    }

    // Verify that the logged-in user belongs to this business.
    const membership = await db.query(
      `
      SELECT organization_id, role
      FROM organization_members
      WHERE organization_id = $1
        AND user_id = $2
      LIMIT 1
      `,
      [organizationId, req.user.id]
    );

    if (membership.rows.length === 0) {
      return res.status(403).json({
        error: "You are not a member of this business"
      });
    }

    // Never expose agent_token through the business listing.
    const result = await db.query(
      `
      SELECT
        id,
        user_id,
        organization_id,
        name,
        type,
        imei,
        imei_2,
        serial_number,
        mac_address,
        brand,
        model,
        status,
        device_type,
        machine_id,
        owner_name,
        hostname,
        platform,
        os_type,
        os_release,
        arch,
        last_seen,
        email,
        ip,
        isp,
        city,
        country,
        latitude,
        longitude
      FROM devices
      WHERE organization_id = $1
      ORDER BY last_seen DESC NULLS LAST, id DESC
      `,
      [organizationId]
    );

    return res.json(result.rows);
  } catch (err) {
    console.error("GET BUSINESS DEVICES ERROR:", err);

    return res.status(500).json({
      error: "Failed to retrieve business devices"
    });
  }
});

// ============================================================
// ASSIGN A REGISTERED DEVICE TO A BUSINESS
// Only a business admin can perform this action.
// ============================================================

router.put("/:machine_id/business", auth, async (req, res) => {
  try {
    const machineId = cleanString(req.params.machine_id);
    const organizationId = Number.parseInt(
      req.body.organization_id,
      10
    );

    if (!machineId) {
      return res.status(400).json({
        error: "machine_id is required"
      });
    }

    if (!Number.isInteger(organizationId) || organizationId <= 0) {
      return res.status(400).json({
        error: "A valid organization_id is required"
      });
    }

    // Only an admin of this business may assign devices.
    const membership = await db.query(
      `
      SELECT organization_id
      FROM organization_members
      WHERE organization_id = $1
        AND user_id = $2
        AND role = 'admin'
      LIMIT 1
      `,
      [organizationId, req.user.id]
    );

    if (membership.rows.length === 0) {
      return res.status(403).json({
        error: "You must be a business admin to assign devices"
      });
    }

    // The device must belong to the logged-in user.
    const existing = await db.query(
      `
      SELECT id, organization_id
      FROM devices
      WHERE machine_id = $1
        AND user_id = $2
      LIMIT 1
      `,
      [machineId, req.user.id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({
        error: "Device not found in your account"
      });
    }

    const currentOrganizationId =
      existing.rows[0].organization_id;

    // Do not silently move a device from another business.
    if (
      currentOrganizationId !== null &&
      currentOrganizationId !== undefined &&
      Number(currentOrganizationId) !== organizationId
    ) {
      return res.status(409).json({
        error: "Device is already assigned to another business"
      });
    }

    const result = await db.query(
      `
      UPDATE devices
      SET organization_id = $1
      WHERE id = $2
        AND user_id = $3
        AND (
          organization_id IS NULL
          OR organization_id = $1
        )
      RETURNING
        id,
        user_id,
        organization_id,
        machine_id,
        name,
        status,
        device_type
      `,
      [
        organizationId,
        existing.rows[0].id,
        req.user.id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(409).json({
        error: "Device assignment could not be completed"
      });
    }

    return res.json({
      success: true,
      message: "Device assigned to business successfully",
      device: result.rows[0]
    });
  } catch (err) {
    console.error("BUSINESS DEVICE ASSIGNMENT ERROR:", err);

    return res.status(500).json({
      error: "Failed to assign device to business"
    });
  }
});

module.exports = router;
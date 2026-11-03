console.log("🟣 location.js LOADED");

const express = require("express");
const router = express.Router();

const pool = require("../db");
const sendEmail = require("../utils/email");


// ============================================================
// RECOVERY ALERT SETTINGS
// ============================================================

const ALERT_COOLDOWN_MINUTES = 10;
const MIN_MOVEMENT_METERS = 100;


// ============================================================
// HELPERS
// ============================================================

function cleanString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const cleaned = String(value).trim();

  return cleaned === "" ? null : cleaned;
}

function cleanNumber(value) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


// ============================================================
// DISTANCE CALCULATION
// ============================================================

function calculateDistanceMeters(
  latitude1,
  longitude1,
  latitude2,
  longitude2
) {
  if (
    !Number.isFinite(latitude1) ||
    !Number.isFinite(longitude1) ||
    !Number.isFinite(latitude2) ||
    !Number.isFinite(longitude2)
  ) {
    return 0;
  }

  const earthRadiusMeters = 6371000;

  const lat1 = latitude1 * Math.PI / 180;
  const lat2 = latitude2 * Math.PI / 180;

  const deltaLatitude =
    (latitude2 - latitude1) *
    Math.PI /
    180;

  const deltaLongitude =
    (longitude2 - longitude1) *
    Math.PI /
    180;

  const a =
    Math.sin(deltaLatitude / 2) *
    Math.sin(deltaLatitude / 2) +
    Math.cos(lat1) *
    Math.cos(lat2) *
    Math.sin(deltaLongitude / 2) *
    Math.sin(deltaLongitude / 2);

  const c =
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    );

  return earthRadiusMeters * c;
}


// ============================================================
// RESOLVE DEVICE
//
// Accepts either:
// 1. machine_id -> ANDROID-xxxx
// 2. numeric database device id
// ============================================================

async function resolveDevice(deviceIdentifier) {
  const identifier = cleanString(deviceIdentifier);

  if (!identifier) {
    return null;
  }

  // ----------------------------------------------------------
  // First try machine_id
  // ----------------------------------------------------------

  let result = await pool.query(
    `
    SELECT
      id,
      user_id,
      machine_id,
      name,
      brand,
      model,
      status
    FROM devices
    WHERE machine_id = $1
    LIMIT 1
    `,
    [identifier]
  );

  if (result.rows.length > 0) {
    return result.rows[0];
  }

  // ----------------------------------------------------------
  // Numeric device id fallback
  // ----------------------------------------------------------

  if (/^\d+$/.test(identifier)) {
    result = await pool.query(
      `
      SELECT
        id,
        user_id,
        machine_id,
        name,
        brand,
        model,
        status
      FROM devices
      WHERE id = $1
      LIMIT 1
      `,
      [Number(identifier)]
    );

    if (result.rows.length > 0) {
      return result.rows[0];
    }
  }

  return null;
}


// ============================================================
// GET PREVIOUS LOCATION
// ============================================================

async function getPreviousLocation(deviceId) {
  const result = await pool.query(
    `
    SELECT
      id,
      latitude,
      longitude,
      city,
      country,
      created_at
    FROM device_location
    WHERE device_id = $1
    ORDER BY created_at DESC, id DESC
    LIMIT 1
    `,
    [deviceId]
  );

  return result.rows[0] || null;
}


// ============================================================
// GET LAST RECOVERY ALERT
// ============================================================

async function getLastRecoveryAlert(deviceId) {
  const result = await pool.query(
    `
    SELECT
      id,
      location_id,
      latitude,
      longitude,
      city,
      country,
      sent_at
    FROM location_alerts
    WHERE device_id = $1
    ORDER BY sent_at DESC, id DESC
    LIMIT 1
    `,
    [deviceId]
  );

  return result.rows[0] || null;
}


// ============================================================
// FIND OWNER EMAIL
// ============================================================

async function getDeviceOwnerEmail(deviceId) {
  const result = await pool.query(
    `
    SELECT
      users.email
    FROM devices
    JOIN users
      ON users.id = devices.user_id
    WHERE devices.id = $1
    LIMIT 1
    `,
    [deviceId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0].email || null;
}


// ============================================================
// SEND RECOVERY LOCATION ALERT
// ============================================================

async function sendRecoveryLocationAlert({
  device,
  location
}) {
  try {
    // --------------------------------------------------------
    // Only stolen devices generate recovery alerts
    // --------------------------------------------------------

    if (
      String(device.status || "").toLowerCase() !==
      "stolen"
    ) {
      return {
        sent: false,
        reason: "device_not_stolen"
      };
    }

    // --------------------------------------------------------
    // Owner email
    // --------------------------------------------------------

    const ownerEmail =
      await getDeviceOwnerEmail(device.id);

    if (!ownerEmail) {
      console.log(
        "⚠️ Recovery alert skipped: owner email not found"
      );

      return {
        sent: false,
        reason: "owner_email_not_found"
      };
    }

    // --------------------------------------------------------
    // Previous alert
    // --------------------------------------------------------

    const lastAlert =
      await getLastRecoveryAlert(device.id);

    // First location after stolen status
    if (!lastAlert) {
      console.log(
        "🚨 FIRST RECOVERY LOCATION ALERT"
      );

      return await deliverRecoveryAlert({
        ownerEmail,
        device,
        location
      });
    }

    // --------------------------------------------------------
    // Cooldown check
    // --------------------------------------------------------

    const lastAlertTime =
      new Date(lastAlert.sent_at).getTime();

    const now =
      Date.now();

    const minutesSinceLastAlert =
      (now - lastAlertTime) / 60000;

    if (
      minutesSinceLastAlert <
      ALERT_COOLDOWN_MINUTES
    ) {
      console.log(
        `⏳ Recovery alert cooldown active: ${minutesSinceLastAlert.toFixed(1)} min`
      );

      return {
        sent: false,
        reason: "cooldown"
      };
    }

    // --------------------------------------------------------
    // Movement check
    // --------------------------------------------------------

    const currentLatitude =
      Number(location.latitude);

    const currentLongitude =
      Number(location.longitude);

    const lastLatitude =
      Number(lastAlert.latitude);

    const lastLongitude =
      Number(lastAlert.longitude);

    const movedMeters =
      calculateDistanceMeters(
        lastLatitude,
        lastLongitude,
        currentLatitude,
        currentLongitude
      );

    if (
      movedMeters <
      MIN_MOVEMENT_METERS
    ) {
      console.log(
        `📍 No meaningful movement since last alert: ${movedMeters.toFixed(1)}m`
      );

      return {
        sent: false,
        reason: "insufficient_movement",
        movedMeters
      };
    }

    console.log(
      `🚨 DEVICE MOVED ${movedMeters.toFixed(1)}m — sending recovery alert`
    );

    return await deliverRecoveryAlert({
      ownerEmail,
      device,
      location,
      movedMeters
    });

  } catch (err) {
    console.error(
      "❌ RECOVERY ALERT ERROR:",
      err
    );

    return {
      sent: false,
      reason: "alert_error",
      error: err.message
    };
  }
}


// ============================================================
// DELIVER RECOVERY ALERT
// ============================================================

async function deliverRecoveryAlert({
  ownerEmail,
  device,
  location,
  movedMeters = 0
}) {
  try {
    const latitude =
      location.latitude;

    const longitude =
      location.longitude;

    const city =
      location.city ||
      "Unknown";

    const country =
      location.country ||
      "Unknown";

    const mapsUrl =
      Number.isFinite(Number(latitude)) &&
      Number.isFinite(Number(longitude))
        ? `https://www.google.com/maps?q=${encodeURIComponent(
            `${latitude},${longitude}`
          )}`
        : null;

    const deviceName =
      device.name ||
      [device.brand, device.model]
        .filter(Boolean)
        .join(" ") ||
      "Your stolen device";

    const safeDeviceName =
      escapeHtml(deviceName);

    const safeMachineId =
      escapeHtml(
        device.machine_id ||
        "Unknown"
      );

    const safeCity =
      escapeHtml(city);

    const safeCountry =
      escapeHtml(country);

    const safeLatitude =
      escapeHtml(
        latitude ?? "Unknown"
      );

    const safeLongitude =
      escapeHtml(
        longitude ?? "Unknown"
      );

    const movementText =
      movedMeters > 0
        ? `<p><b>Movement since last alert:</b> ${movedMeters.toFixed(0)} metres</p>`
        : "";

    const mapButton =
      mapsUrl
        ? `
          <p>
            <a
              href="${mapsUrl}"
              target="_blank"
              style="
                display:inline-block;
                padding:12px 18px;
                background:#2563eb;
                color:white;
                text-decoration:none;
                border-radius:8px;
                font-weight:bold;
              "
            >
              📍 Open Location in Google Maps
            </a>
          </p>
        `
        : "";

    const subject =
      `🚨 DeviceGuard Recovery Alert — ${deviceName}`;

    const html = `
      <div
        style="
          font-family:Arial,Helvetica,sans-serif;
          line-height:1.6;
          color:#111827;
        "
      >

        <h2 style="color:#dc2626;">
          🚨 Stolen Device Location Detected
        </h2>

        <p>
          DeviceGuard has received a new location
          from your stolen device.
        </p>

        <hr>

        <p>
          <b>Device:</b>
          ${safeDeviceName}
        </p>

        <p>
          <b>Machine ID:</b>
          ${safeMachineId}
        </p>

        <p>
          <b>Status:</b>
          STOLEN
        </p>

        <p>
          <b>Location:</b>
          ${safeCity}, ${safeCountry}
        </p>

        <p>
          <b>Latitude:</b>
          ${safeLatitude}
        </p>

        <p>
          <b>Longitude:</b>
          ${safeLongitude}
        </p>

        ${movementText}

        <p>
          <b>Detected:</b>
          ${new Date().toLocaleString(
            "en-KE",
            {
              timeZone: "Africa/Nairobi"
            }
          )} EAT
        </p>

        ${mapButton}

        <hr>

        <p>
          DeviceGuard Security
        </p>

      </div>
    `;

    const emailSent =
      await sendEmail(
        ownerEmail,
        subject,
        html,
        []
      );

    if (!emailSent) {
      console.log(
        "❌ Recovery email was not sent"
      );

      return {
        sent: false,
        reason: "email_failed"
      };
    }

    // --------------------------------------------------------
    // Record successful alert
    // --------------------------------------------------------

    await pool.query(
      `
      INSERT INTO location_alerts
      (
        device_id,
        location_id,
        alert_type,
        latitude,
        longitude,
        city,
        country,
        sent_at
      )
      VALUES
      (
        $1,
        $2,
        'new_location',
        $3,
        $4,
        $5,
        $6,
        NOW()
      )
      `,
      [
        device.id,
        location.id,
        location.latitude,
        location.longitude,
        location.city || null,
        location.country || null
      ]
    );

    console.log(
      "📧 RECOVERY ALERT SENT:",
      ownerEmail
    );

    return {
      sent: true,
      email: ownerEmail,
      movedMeters
    };

  } catch (err) {
    console.error(
      "❌ RECOVERY EMAIL DELIVERY ERROR:",
      err
    );

    return {
      sent: false,
      reason: "delivery_error",
      error: err.message
    };
  }
}


// ============================================================
// TEST ROUTE
// ============================================================

router.get("/test", (req, res) => {
  console.log("✅ LOCATION TEST HIT");

  res.json({
    message: "LOCATION WORKS"
  });
});


// ============================================================
// UPDATE LOCATION
// ============================================================

router.post("/update", async (req, res) => {
  try {
    console.log(
      "📍 Incoming location update:",
      req.body
    );

    const {
      device_id,
      machine_id,
      ip,
      country,
      city,
      latitude,
      longitude,
      isp
    } = req.body;

    // --------------------------------------------------------
    // Android should normally send machine_id
    // --------------------------------------------------------

    const deviceIdentifier =
      cleanString(machine_id) ||
      cleanString(device_id);

    if (!deviceIdentifier) {
      return res.status(400).json({
        error:
          "machine_id or device_id is required"
      });
    }

    // --------------------------------------------------------
    // Resolve actual device
    // --------------------------------------------------------

    const device =
      await resolveDevice(deviceIdentifier);

    if (!device) {
      console.log(
        "❌ Device not found:",
        deviceIdentifier
      );

      return res.status(404).json({
        error: "Device not found",
        machine_id: deviceIdentifier
      });
    }

    console.log(
      "✅ Device resolved:",
      device.id,
      device.machine_id
    );

    // --------------------------------------------------------
    // Get previous location BEFORE inserting the new one
    // --------------------------------------------------------

    const previousLocation =
      await getPreviousLocation(device.id);

    // --------------------------------------------------------
    // Clean location data
    // --------------------------------------------------------

    const normalizedIp =
      cleanString(ip);

    const normalizedCountry =
      cleanString(country);

    const normalizedCity =
      cleanString(city);

    const normalizedIsp =
      cleanString(isp);

    const normalizedLatitude =
      cleanNumber(latitude);

    const normalizedLongitude =
      cleanNumber(longitude);

    // --------------------------------------------------------
    // Save location history
    // --------------------------------------------------------

    const historyResult =
      await pool.query(
        `
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
        VALUES
        (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7
        )
        RETURNING *;
        `,
        [
          device.id,
          normalizedIp,
          normalizedCountry,
          normalizedCity,
          normalizedLatitude,
          normalizedLongitude,
          normalizedIsp
        ]
      );

    // --------------------------------------------------------
    // Update live device location
    // --------------------------------------------------------

    const deviceResult =
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
        WHERE id = $7
        RETURNING
          id,
          machine_id,
          name,
          brand,
          model,
          status,
          latitude,
          longitude,
          ip,
          city,
          country,
          isp,
          last_seen;
        `,
        [
          normalizedLatitude,
          normalizedLongitude,
          normalizedIp,
          normalizedCity,
          normalizedCountry,
          normalizedIsp,
          device.id
        ]
      );

    const savedLocation =
      historyResult.rows[0];

    console.log(
      "✅ Location saved:",
      savedLocation
    );

    // --------------------------------------------------------
    // RECOVERY ALERT
    //
    // Only stolen devices enter this flow.
    // The first location alerts immediately.
    // Later alerts require:
    //   - cooldown elapsed
    //   - meaningful movement
    // --------------------------------------------------------

    const recoveryAlert =
      await sendRecoveryLocationAlert({
        device,
        location: savedLocation
      });

    // --------------------------------------------------------
    // FINAL RESPONSE
    // --------------------------------------------------------

    return res.json({
      success: true,

      device:
        deviceResult.rows[0],

      location:
        savedLocation,

      recovery_alert:
        recoveryAlert
    });

  } catch (err) {
    console.error(
      "❌ LOCATION ERROR:",
      err.message
    );

    res.status(500).json({
      error:
        "Server error updating location",
      details:
        err.message
    });
  }
});


// ============================================================
// GET LATEST LOCATION
// ============================================================

router.get("/:device_id", async (req, res) => {
  try {
    const {
      device_id
    } = req.params;

    console.log(
      "📡 Fetching location for:",
      device_id
    );

    // --------------------------------------------------------
    // Resolve device
    // --------------------------------------------------------

    const device =
      await resolveDevice(device_id);

    if (!device) {
      return res.status(404).json({
        error: "Device not found"
      });
    }

    // --------------------------------------------------------
    // Get latest location
    // --------------------------------------------------------

    const result =
      await pool.query(
        `
        SELECT
          id,
          device_id,
          ip,
          country,
          city,
          latitude,
          longitude,
          isp,
          created_at
        FROM device_location
        WHERE device_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT 1
        `,
        [device.id]
      );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "No location found"
      });
    }

    return res.json({
      success: true,

      device: {
        id: device.id,
        machine_id: device.machine_id,
        name: device.name,
        brand: device.brand,
        model: device.model,
        status: device.status
      },

      location:
        result.rows[0]
    });

  } catch (err) {
    console.error(
      "❌ GET LOCATION ERROR:",
      err.message
    );

    res.status(500).json({
      error:
        "Failed to fetch location",
      details:
        err.message
    });
  }
});


module.exports = router;

const SibApiV3Sdk = require("sib-api-v3-sdk");

const fs = require("fs");
const path = require("path");

console.log("🔥 EMAIL.JS RECOVERY + EVIDENCE VERSION LOADED 🔥");

// ============================================================
// BREVO CLIENT
// ============================================================

const client =
  SibApiV3Sdk.ApiClient.instance;

const apiKey =
  client.authentications["api-key"];

apiKey.apiKey =
  process.env.BREVO_API_KEY;

// ============================================================
// SEND EMAIL
// ============================================================

async function sendEmail(
  to,
  subject,
  html,
  attachments = []
) {
  try {
    const apiInstance =
      new SibApiV3Sdk.TransactionalEmailsApi();

    // ========================================================
    // BUILD ATTACHMENTS
    // ========================================================

    const formattedAttachments = [];

    if (
      Array.isArray(attachments) &&
      attachments.length > 0
    ) {
      for (const attachment of attachments) {
        if (!attachment) {
          console.log("⚠️ EMPTY ATTACHMENT — SKIPPING");
          continue;
        }

        let fileBuffer;
        let fileName;

        // Cloudinary / memory upload attachment
        if (Buffer.isBuffer(attachment.buffer)) {
          fileBuffer = attachment.buffer;
          fileName =
            attachment.name || "device-evidence.jpg";
        }

        // Existing local-file attachment support
        else if (typeof attachment === "string") {
          console.log(
            "📎 ATTACHMENT PATH:",
            attachment
          );

          if (!fs.existsSync(attachment)) {
            console.log(
              "❌ FILE NOT FOUND:",
              attachment
            );
            continue;
          }

          fileBuffer =
            fs.readFileSync(attachment);

          fileName =
            path.basename(attachment);
        } else {
          console.log(
            "⚠️ UNSUPPORTED ATTACHMENT — SKIPPING"
          );
          continue;
        }

        console.log(
          "📦 FILE SIZE:",
          fileBuffer.length
        );

        formattedAttachments.push({
          name: fileName,
          content: fileBuffer.toString("base64")
        });

        console.log(
          "✅ ATTACHMENT ADDED:",
          fileName
        );
      }
    }

    // ========================================================
    // EMAIL DATA
    // ========================================================

    const emailData = {
      sender: {
        name: "DeviceGuard",
        email: process.env.EMAIL_FROM
      },

      to: [
        {
          email: to
        }
      ],

      subject: subject,

      htmlContent: html
    };

    // ========================================================
    // ONLY ADD ATTACHMENT WHEN A REAL FILE EXISTS
    // ========================================================

    if (formattedAttachments.length > 0) {
      emailData.attachment =
        formattedAttachments;
    }

    // ========================================================
    // LOGGING
    // ========================================================

    console.log(
      "📎 TOTAL ATTACHMENTS:",
      formattedAttachments.length
    );

    console.log("📤 SENDING EMAIL...");
    console.log("📨 TO:", to);
    console.log("📝 SUBJECT:", subject);

    // ========================================================
    // SEND
    // ========================================================

    const response =
      await apiInstance.sendTransacEmail(
        emailData
      );

    console.log("✅ EMAIL SENT");
    console.log(response);

    return true;

  } catch (err) {
    console.log("❌ EMAIL SEND FAILED");

    if (err.response) {
      console.log(err.response.body);
    } else {
      console.log(err.message);
    }

    return false;
  }
}

module.exports = sendEmail;

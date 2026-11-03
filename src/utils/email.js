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
      for (const filePath of attachments) {
        console.log(
          "📎 ATTACHMENT PATH:",
          filePath
        );

        if (!filePath) {
          console.log(
            "⚠️ EMPTY ATTACHMENT PATH — SKIPPING"
          );

          continue;
        }

        if (!fs.existsSync(filePath)) {
          console.log(
            "❌ FILE NOT FOUND:",
            filePath
          );

          continue;
        }

        const fileBuffer =
          fs.readFileSync(filePath);

        console.log(
          "📦 FILE SIZE:",
          fileBuffer.length
        );

        formattedAttachments.push({
          name:
            path.basename(filePath),

          content:
            fileBuffer.toString("base64")
        });

        console.log(
          "✅ ATTACHMENT ADDED:",
          path.basename(filePath)
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
    // IMPORTANT:
    // ONLY ADD ATTACHMENT PROPERTY WHEN
    // THERE IS AT LEAST ONE REAL FILE.
    // ========================================================

    if (
      formattedAttachments.length > 0
    ) {
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

    console.log(
      "📤 SENDING EMAIL..."
    );

    console.log(
      "📨 TO:",
      to
    );

    console.log(
      "📝 SUBJECT:",
      subject
    );


    // ========================================================
    // SEND
    // ========================================================

    const response =
      await apiInstance.sendTransacEmail(
        emailData
      );

    console.log(
      "✅ EMAIL SENT"
    );

    console.log(
      response
    );

    return true;

  } catch (err) {
    console.log(
      "❌ EMAIL SEND FAILED"
    );

    if (err.response) {
      console.log(
        err.response.body
      );
    } else {
      console.log(
        err.message
      );
    }

    return false;
  }
}


module.exports = sendEmail;
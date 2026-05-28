const SibApiV3Sdk = require("sib-api-v3-sdk");
const fs = require("fs");
const path = require("path");

console.log("🔥 EMAIL.JS FINAL ATTACHMENT VERSION LOADED 🔥");

const client = SibApiV3Sdk.ApiClient.instance;

const apiKey = client.authentications["api-key"];

apiKey.apiKey = process.env.BREVO_API_KEY;

// ================= SEND EMAIL =================
async function sendEmail(
  to,
  subject,
  html,
  attachments = []
) {
  try {

    const apiInstance =
      new SibApiV3Sdk.TransactionalEmailsApi();

    let formattedAttachments = [];

    // ================= ATTACHMENTS =================
    for (const filePath of attachments) {

      console.log("📎 ATTACHMENT PATH:", filePath);

      if (!fs.existsSync(filePath)) {
        console.log("❌ FILE NOT FOUND");
        continue;
      }

      const fileBuffer =
        fs.readFileSync(filePath);

      console.log(
        "📦 FILE SIZE:",
        fileBuffer.length
      );

      formattedAttachments.push({
        name: path.basename(filePath),

        content:
          fileBuffer.toString("base64")
      });

      console.log("✅ ATTACHMENT ADDED");
    }

    console.log(
      "📎 TOTAL ATTACHMENTS:",
      formattedAttachments.length
    );

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

      htmlContent: html,

      attachment: formattedAttachments
    };

    console.log("📤 SENDING EMAIL...");

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
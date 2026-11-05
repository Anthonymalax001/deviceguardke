
const cloudinary = require("cloudinary").v2;
const path = require("path");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

function checkCloudinaryConfig() {
  const required = [
    "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_API_KEY",
    "CLOUDINARY_API_SECRET"
  ];

  const missing = required.filter(
    (key) => !process.env[key]
  );

  if (missing.length > 0) {
    throw new Error(
      `Missing Cloudinary configuration: ${missing.join(", ")}`
    );
  }
}

function uploadEvidence(buffer, filename) {
  return new Promise((resolve, reject) => {
    try {
      checkCloudinaryConfig();

      if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        return reject(
          new Error("Evidence upload requires a non-empty Buffer.")
        );
      }

      const safeFilename = path
        .basename(String(filename || "evidence").replace(/\\/g, "/"))
        .replace(/[\r\n\0]/g, "_");

      const upload = cloudinary.uploader.upload_stream(
        {
          folder: "deviceguardke/evidence",
          resource_type: "image",
          type: "authenticated",
          use_filename: false,
          unique_filename: true,
          filename_override: safeFilename
        },
        (error, result) => {
          if (error) {
            return reject(error);
          }

          if (!result || !result.public_id) {
            return reject(
              new Error("Cloudinary did not return a valid public ID.")
            );
          }

          resolve(result);
        }
      );

      // Send the complete Buffer directly to Cloudinary.
      upload.end(buffer);

    } catch (error) {
      reject(error);
    }
  });
}

function getEvidenceUrl(publicId, format) {
  checkCloudinaryConfig();

  if (
    typeof publicId !== "string" ||
    !publicId.trim()
  ) {
    throw new Error("A valid evidence public ID is required.");
  }

  if (
    typeof format !== "string" ||
    !/^[a-zA-Z0-9]+$/.test(format)
  ) {
    throw new Error("A valid evidence format is required.");
  }

  return cloudinary.utils.private_download_url(
    publicId,
    format,
    {
      resource_type: "image",
      type: "authenticated",
      expires_at: Math.floor(Date.now() / 1000) + 300
    }
  );
}

module.exports = {
  uploadEvidence,
  getEvidenceUrl
};

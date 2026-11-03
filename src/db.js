require("dotenv").config();

const { Pool } = require("pg");

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
    })
  : new Pool({
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 5432),
      database: process.env.DB_NAME,
      ssl:
        process.env.DB_SSL === "true"
          ? { rejectUnauthorized: false }
          : false,
    });

module.exports = pool;

pool
  .query("SELECT current_database() AS database, current_user AS role")
  .then((result) => {
    console.log("🟢 Connected to database:", result.rows[0].database);
    console.log("🟢 Connected as role:", result.rows[0].role);
  })
  .catch((err) => {
    console.error("🔴 Database connection error:", err.message);
  });
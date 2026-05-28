require("dotenv").config();

const { Pool } = require("pg");

const pool = new Pool({
  user: process.env.DB_USER,
  password: String(process.env.DB_PASSWORD), // ⬅️ FORCE STRING
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
});

module.exports = pool;

pool.connect()
  .then(client => {
    return client.query("SELECT current_database()")
      .then(res => {
        console.log("🟢 Connected to database:", res.rows[0].current_database);
        client.release();
      });
  })
  .catch(err => console.error("🔴 Database connection error:", err.message));

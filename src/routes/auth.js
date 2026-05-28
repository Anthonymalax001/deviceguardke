console.log("🟢 NEW AUTH.JS VERSION ACTIVE");
console.log("🔥 AUTH ROUTES FILE LOADED");

const express = require("express");
const pool = require("../db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const router = express.Router();

/* ================= REGISTER ================= */

router.post("/register", async (req, res) => {

  try {

    const { name, email, password, phone } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        error: "Name, email and password are required"
      });
    }

    /* CHECK IF USER EXISTS */

    const existingUser = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({
        error: "User already exists"
      });
    }

    /* HASH PASSWORD */

    const passwordHash = await bcrypt.hash(password, 10);

    /* INSERT USER */

    const newUser = await pool.query(
      `INSERT INTO users (name, email, phone, password_hash)
       VALUES ($1,$2,$3,$4)
       RETURNING id, name, email, phone`,
      [
        name,
        email,
        phone || null,
        passwordHash
      ]
    );

    console.log("✅ User registered:", email);

    res.json({
      message: "Registration successful",
      user: newUser.rows[0]
    });

  } catch (err) {

    console.error("❌ REGISTER ERROR:", err);

    res.status(500).json({
      error: "Registration failed",
      details: err.message
    });

  }

});


/* ================= LOGIN ================= */

router.post("/login", async (req, res) => {

  try {

    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: "Email and password required"
      });
    }

    const result = await pool.query(
      "SELECT id, email, password_hash FROM users WHERE email = $1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({
        error: "Invalid email or password"
      });
    }

    const user = result.rows[0];

    const passwordMatch = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordMatch) {
      return res.status(401).json({
        error: "Invalid email or password"
      });
    }

    /* CREATE TOKEN */

    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "1d" }
    );

    console.log("✅ User logged in:", user.email);

    res.json({
      message: "Login successful",
      token
    });

  } catch (err) {

    console.error("❌ LOGIN ERROR:", err);

    res.status(500).json({
      error: "Login failed",
      details: err.message
    });

  }

});

module.exports = router;

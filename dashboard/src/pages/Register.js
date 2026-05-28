import React, { useState } from "react";
import api from "../api";
import { useNavigate, Link } from "react-router-dom";

function Register() {

  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handlePhone = (e) => {

    let value = e.target.value.replace(/\D/g, "");

    if (value.length > 10) {
      value = value.slice(0, 10);
    }

    setPhone(value);
  };

  const handleRegister = async (e) => {

    e.preventDefault();

    try {

      await api.post("/api/auth/register", {
        name,
        email,
        phone,
        password
      });

      alert("Registration successful 😄");

      navigate("/login");

    } catch (err) {

      console.error(err);

      alert(
        err.response?.data?.error ||
        "Registration failed"
      );
    }
  };

  return (

    <div className="min-h-screen flex items-center justify-center bg-black px-4">

      <div className="bg-zinc-900 border border-zinc-800 shadow-2xl rounded-2xl w-full max-w-md p-8">

        <h1 className="text-3xl font-bold text-center text-white mb-2">
          DeviceGuard
        </h1>

        <p className="text-gray-400 text-center mb-8">
          Create your secure account
        </p>

        <form onSubmit={handleRegister} className="space-y-5">

          <div>
            <label className="block mb-2 text-gray-300 font-medium">
              Full Name
            </label>

            <input
              type="text"
              placeholder="John Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full bg-zinc-800 text-white border border-zinc-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-white"
            />
          </div>

          <div>
            <label className="block mb-2 text-gray-300 font-medium">
              Email
            </label>

            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-zinc-800 text-white border border-zinc-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-white"
            />
          </div>

          <div>
            <label className="block mb-2 text-gray-300 font-medium">
              Phone Number
            </label>

            <input
              type="text"
              placeholder="0712345678"
              value={phone}
              onChange={handlePhone}
              required
              className="w-full bg-zinc-800 text-white border border-zinc-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-white"
            />

            <p className="text-sm text-gray-500 mt-1">
              Maximum 10 digits
            </p>
          </div>

          <div>
            <label className="block mb-2 text-gray-300 font-medium">
              Password
            </label>

            <div className="relative">

              <input
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-zinc-800 text-white border border-zinc-700 rounded-xl px-4 py-3 pr-16 outline-none focus:ring-2 focus:ring-white"
              />

              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-3 text-sm text-gray-400 hover:text-white"
              >
                {showPassword ? "Hide" : "Show"}
              </button>

            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-white text-black hover:bg-gray-200 py-3 rounded-xl font-semibold transition"
          >
            Register
          </button>

        </form>

        <p className="text-center text-gray-400 mt-6">
          Already have an account?{" "}
          <Link
            to="/login"
            className="text-white font-semibold hover:underline"
          >
            Login
          </Link>
        </p>

      </div>

    </div>
  );
}

export default Register;
import React, { useState } from "react";
import api from "../api";
import { useNavigate } from "react-router-dom";

function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);

  const login = async (e) => {
    e.preventDefault();

    try {
      setLoading(true);

      const res = await api.post("/api/auth/login", {
        email,
        password,
      });

      const token = res.data.token;

      localStorage.setItem("token", token);

      navigate("/devices");

    } catch (err) {
      console.error(err);

      alert(
        err.response?.data?.error ||
        "Login failed"
      );

    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#020817] flex items-center justify-center px-4">

      <div className="w-full max-w-md bg-[#0f172a] border border-slate-800 rounded-2xl shadow-2xl p-8">

        {/* LOGO */}
        <div className="text-center mb-8">

          <h1 className="text-4xl font-bold text-white mb-2">
            DeviceGuard
          </h1>

          <p className="text-slate-400">
            Secure. Track. Recover.
          </p>

        </div>

        {/* TITLE */}
        <div className="mb-6">

          <h2 className="text-2xl font-semibold text-white">
            Welcome Back
          </h2>

          <p className="text-slate-400 mt-1">
            Login to your dashboard
          </p>

        </div>

        {/* FORM */}
        <form onSubmit={login} className="space-y-5">

          {/* EMAIL */}
          <div>
            <label className="block text-sm text-slate-300 mb-2">
              Email
            </label>

            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) =>
                setEmail(e.target.value)
              }
              required
              className="
                w-full
                bg-[#1e293b]
                border border-slate-700
                rounded-xl
                px-4 py-3
                text-white
                outline-none
                focus:border-blue-500
                transition
              "
            />
          </div>

          {/* PASSWORD */}
          <div>
            <label className="block text-sm text-slate-300 mb-2">
              Password
            </label>

            <input
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) =>
                setPassword(e.target.value)
              }
              required
              className="
                w-full
                bg-[#1e293b]
                border border-slate-700
                rounded-xl
                px-4 py-3
                text-white
                outline-none
                focus:border-blue-500
                transition
              "
            />
          </div>

          {/* BUTTON */}
          <button
            type="submit"
            disabled={loading}
            className="
              w-full
              bg-blue-600
              hover:bg-blue-700
              transition
              text-white
              py-3
              rounded-xl
              font-semibold
              disabled:opacity-50
            "
          >
            {loading ? "Logging in..." : "Login"}
          </button>

        </form>

        {/* FOOTER */}
        <div className="mt-8 text-center text-slate-500 text-sm">
          DeviceGuard © 2026
        </div>

      </div>

    </div>
  );
}

export default Login;
import React, { useState, useEffect } from "react";
import api from "../api";
import { useNavigate } from "react-router-dom";

function Devices() {

  const [devices, setDevices] = useState([]);

  const navigate = useNavigate();

  // ================= LOAD DEVICES =================
  const loadDevices = async () => {

    try {

      const res = await api.get("/api/dashboard/devices");

      setDevices(res.data);

    } catch (err) {

      console.error("Failed to load devices:", err);

      // 🔐 TOKEN EXPIRED / INVALID
      if (err.response?.status === 401) {

        localStorage.removeItem("token");

        navigate("/login");
      }
    }
  };

  // ================= EFFECT =================
  useEffect(() => {

    const token = localStorage.getItem("token");

    if (!token) {

      navigate("/login");

      return;
    }

    loadDevices();

    // 🔄 AUTO REFRESH
    const interval = setInterval(() => {

      loadDevices();

    }, 10000);

    return () => clearInterval(interval);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ================= LOGOUT =================
  const logout = () => {

    localStorage.removeItem("token");
    localStorage.removeItem("machine_id");

    navigate("/login");
  };

  // ================= MARK STOLEN =================
  const markStolen = async (machine_id) => {

    try {

      await api.post("/api/dashboard/mark-stolen", {
        machine_id,
      });

      loadDevices();

    } catch (err) {

      console.error(err);

      alert("Failed to mark device stolen");
    }
  };

  // ================= MARK SAFE =================
  const markSafe = async (machine_id) => {

    try {

      await api.post("/api/dashboard/mark-safe", {
        machine_id,
      });

      loadDevices();

    } catch (err) {

      console.error(err);

      alert("Failed to mark device safe");
    }
  };

  // ================= OPEN EVIDENCE =================
  const openEvidence = (machine_id) => {

    localStorage.setItem("machine_id", machine_id);

    navigate("/evidence");
  };

  // ================= OPEN TRACKING =================
  const openTracking = (machine_id) => {

    localStorage.setItem("machine_id", machine_id);

    navigate("/tracking");
  };

  return (

    <div className="min-h-screen bg-black text-white">

      {/* ================= NAVBAR ================= */}
      <div className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur">

        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">

          {/* BRAND */}
          <div>

            <h1 className="text-2xl md:text-3xl font-black tracking-tight">
              DeviceGuard
            </h1>

            <p className="text-gray-400 text-sm mt-1">
              AI-Powered Device Security Platform
            </p>

          </div>

          {/* ACTIONS */}
          <div className="flex gap-3">

            <button
              onClick={logout}
              className="bg-red-600 hover:bg-red-700 px-5 py-3 rounded-2xl font-semibold transition w-full sm:w-auto"
            >
              Logout
            </button>

          </div>

        </div>
      </div>

      {/* ================= MAIN ================= */}
      <div className="max-w-7xl mx-auto px-4 py-8">

        {/* ================= HERO ================= */}
        <div className="mb-10">

          <div className="inline-flex items-center gap-2 bg-blue-500/10 text-blue-400 border border-blue-500/20 px-4 py-2 rounded-full text-sm font-semibold mb-5">
            🛡️ ACTIVE SECURITY MONITORING
          </div>

          <h2 className="text-4xl md:text-5xl font-black leading-tight mb-4">
            Your Devices
          </h2>

          <p className="text-gray-400 text-base md:text-lg max-w-3xl">
            Monitor, protect, and track all your registered devices
            with real-time security monitoring and evidence collection.
          </p>

        </div>

        {/* ================= AGENT CARD ================= */}
        <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800 rounded-3xl p-6 md:p-8 mb-10 shadow-2xl">

          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">

            <div>

              <div className="inline-flex items-center gap-2 bg-green-500/10 text-green-400 border border-green-500/20 px-4 py-2 rounded-full text-sm font-semibold mb-4">
                🟢 Security Agent
              </div>

              <h2 className="text-2xl md:text-3xl font-black mb-3">
                Install DeviceGuard Agent
              </h2>

              <p className="text-gray-400 leading-relaxed max-w-2xl">
                Install the monitoring agent to enable screenshot capture,
                theft detection, camera evidence collection,
                and real-time device protection.
              </p>

            </div>

            <button
  onClick={async () => {

    try {

      const response = await api.get(
        "/api/agent/download",
        {
          responseType: "blob"
        }
      );

      const url = window.URL.createObjectURL(
        new Blob([response.data])
      );

      const link = document.createElement("a");

      link.href = url;

      link.setAttribute(
        "download",
        "deviceguard-agent.py"
      );

      document.body.appendChild(link);

      link.click();

      link.remove();

    } catch (err) {

      console.error(err);

      alert("Failed to download agent");
    }
  }}
  className="inline-flex items-center justify-center bg-green-600 hover:bg-green-700 px-6 py-4 rounded-2xl font-bold transition whitespace-nowrap"
>
  Download Agent
</button>
          </div>

        </div>

        {/* ================= NO DEVICES ================= */}
        {devices.length === 0 ? (

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-10 text-center">

            <div className="text-6xl mb-5">
              💻
            </div>

            <h2 className="text-2xl font-bold mb-3">
              No Devices Registered
            </h2>

            <p className="text-gray-400">
              Install the DeviceGuard agent to start monitoring your devices.
            </p>

          </div>

        ) : (

          /* ================= DEVICES GRID ================= */
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">

            {devices.map((device) => (

              <div
                key={device.id}
                className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-2xl hover:border-zinc-700 hover:scale-[1.01] transition-all duration-300"
              >

                {/* TOP */}
                <div className="flex items-start justify-between gap-4 mb-6">

                  <div>

                    <h2 className="text-xl md:text-2xl font-bold mb-2 break-words">
                      💻 {device.hostname || "Unknown Device"}
                    </h2>

                    <p className="text-gray-400 text-sm break-all">
                      {device.machine_id}
                    </p>

                  </div>

                  <div
                    className={`w-4 h-4 rounded-full mt-2 shadow-lg ${
                      device.status === "stolen"
                        ? "bg-red-500"
                        : "bg-green-500"
                    }`}
                  />

                </div>

                {/* INFO */}
                <div className="space-y-5 mb-8">

                  <div>

                    <p className="text-gray-500 text-sm mb-1">
                      Platform
                    </p>

                    <p className="text-white font-semibold text-lg">
                      {device.platform || "Unknown"}
                    </p>

                  </div>

                  <div>

                    <p className="text-gray-500 text-sm mb-1">
                      Security Status
                    </p>

                    <p
                      className={`font-black uppercase text-lg ${
                        device.status === "stolen"
                          ? "text-red-500"
                          : "text-green-500"
                      }`}
                    >
                      {device.status}
                    </p>

                  </div>

                </div>

                {/* BUTTONS */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

                  {device.status !== "stolen" ? (

                    <button
                      onClick={() =>
                        markStolen(device.machine_id)
                      }
                      className="bg-red-600 hover:bg-red-700 px-4 py-3 rounded-2xl font-bold transition"
                    >
                      Mark Stolen
                    </button>

                  ) : (

                    <button
                      onClick={() =>
                        markSafe(device.machine_id)
                      }
                      className="bg-green-600 hover:bg-green-700 px-4 py-3 rounded-2xl font-bold transition"
                    >
                      Mark Safe
                    </button>

                  )}

                  <button
                    onClick={() =>
                      openEvidence(device.machine_id)
                    }
                    className="bg-blue-600 hover:bg-blue-700 px-4 py-3 rounded-2xl font-bold transition"
                  >
                    Evidence
                  </button>

                  <button
                    onClick={() =>
                      openTracking(device.machine_id)
                    }
                    className="sm:col-span-2 bg-purple-600 hover:bg-purple-700 px-4 py-3 rounded-2xl font-bold transition"
                  >
                    📍 Track Device
                  </button>

                </div>

              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Devices;
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

function Tracking() {

  const navigate = useNavigate();

  const [mapType, setMapType] = useState("live");

  const [lastUpdate, setLastUpdate] = useState(
    new Date().toLocaleString()
  );

  // ================= AUTH CHECK =================
  useEffect(() => {

    const token = localStorage.getItem("token");

    if (!token) {

      navigate("/login");

      return;
    }

    // 🔄 AUTO UPDATE CLOCK
    const interval = setInterval(() => {

      setLastUpdate(
        new Date().toLocaleString()
      );

    }, 1000);

    return () => clearInterval(interval);

  }, [navigate]);

  // ================= GO BACK =================
  const goBack = () => {

    navigate("/devices");
  };

  return (

    <div className="min-h-screen bg-black text-white">

      {/* ================= NAVBAR ================= */}
      <div className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur">

        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">

          <div>

            <h1 className="text-2xl md:text-3xl font-black tracking-tight">
              Live Tracking
            </h1>

            <p className="text-gray-400 text-sm mt-1">
              Real-time device intelligence & monitoring
            </p>

          </div>

          <button
            onClick={goBack}
            className="bg-blue-600 hover:bg-blue-700 px-5 py-3 rounded-2xl font-bold transition w-full sm:w-auto"
          >
            ← Back
          </button>

        </div>
      </div>

      {/* ================= MAIN ================= */}
      <div className="max-w-7xl mx-auto px-4 py-8">

        {/* ================= HERO ================= */}
        <div className="mb-10">

          <div className="inline-flex items-center gap-2 bg-purple-500/10 text-purple-400 border border-purple-500/20 px-4 py-2 rounded-full text-sm font-semibold mb-5">
            📍 LIVE DEVICE TRACKING
          </div>

          <h2 className="text-4xl md:text-5xl font-black leading-tight mb-4">
            Tracking Intelligence
          </h2>

          <p className="text-gray-400 text-base md:text-lg max-w-3xl">
            Monitor device movement, GPS activity,
            and evidence capture locations in real time.
          </p>

        </div>

        {/* ================= STATUS CARDS ================= */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">

          {/* ONLINE */}
          <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800 rounded-3xl p-6 shadow-2xl">

            <div className="flex items-center gap-3 mb-4">

              <div className="w-4 h-4 bg-green-500 rounded-full animate-pulse" />

              <h2 className="text-xl font-bold">
                Device Status
              </h2>

            </div>

            <p className="text-green-500 font-black text-3xl">
              ONLINE
            </p>

          </div>

          {/* TRACKING */}
          <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800 rounded-3xl p-6 shadow-2xl">

            <div className="mb-4">

              <h2 className="text-xl font-bold">
                Tracking
              </h2>

            </div>

            <p className="text-blue-500 font-black text-3xl">
              ACTIVE
            </p>

          </div>

          {/* UPDATE */}
          <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800 rounded-3xl p-6 shadow-2xl">

            <div className="mb-4">

              <h2 className="text-xl font-bold">
                Last Update
              </h2>

            </div>

            <p className="text-white text-lg font-semibold">
              {lastUpdate}
            </p>

          </div>

        </div>

        {/* ================= MAP SWITCHER ================= */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">

          <button
            onClick={() => setMapType("live")}
            className={`px-6 py-4 rounded-2xl font-bold transition-all duration-300 ${
              mapType === "live"
                ? "bg-blue-600 shadow-lg shadow-blue-600/30"
                : "bg-zinc-800 hover:bg-zinc-700"
            }`}
          >
            🌍 Live Tracking Map
          </button>

          <button
            onClick={() => setMapType("evidence")}
            className={`px-6 py-4 rounded-2xl font-bold transition-all duration-300 ${
              mapType === "evidence"
                ? "bg-purple-600 shadow-lg shadow-purple-600/30"
                : "bg-zinc-800 hover:bg-zinc-700"
            }`}
          >
            📸 Evidence Map
          </button>

        </div>

        {/* ================= MAP CARD ================= */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl">

          {/* HEADER */}
          <div className="p-6 border-b border-zinc-800">

            <h2 className="text-2xl md:text-3xl font-black mb-2">

              {mapType === "live"
                ? "Device Location Map"
                : "Evidence Intelligence Map"}

            </h2>

            <p className="text-gray-400">

              {mapType === "live"
                ? "Real-time GPS tracking and monitoring"
                : "Screenshot & camera evidence capture locations"}

            </p>

          </div>

          {/* ================= MAP ================= */}
          <iframe
            title="tracking-map"
            src={
              mapType === "live"
                ? "http://localhost:5050/map.html"
                : "http://localhost:5050/evidence-map.html"
            }
            className="w-full h-[75vh] border-0 bg-black"
          />

        </div>

      </div>
    </div>
  );
}

export default Tracking;
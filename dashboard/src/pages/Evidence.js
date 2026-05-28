import React, { useEffect, useState } from "react";
import api from "../api";
import { useNavigate } from "react-router-dom";

function Evidence() {

  const [evidence, setEvidence] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState(null);

  const navigate = useNavigate();

  useEffect(() => {

    const token = localStorage.getItem("token");

    if (!token) {

      navigate("/login");

      return;
    }

    loadEvidence();

    // 🔄 AUTO REFRESH EVIDENCE
    const interval = setInterval(() => {

      loadEvidence();

    }, 10000);

    return () => clearInterval(interval);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ================= LOAD EVIDENCE =================
  const loadEvidence = async () => {

    try {

      const machine_id =
        localStorage.getItem("machine_id");

      if (!machine_id) {

        navigate("/devices");

        return;
      }

      const res = await api.get(
        `/api/dashboard/device/${machine_id}`
      );

      setEvidence(res.data);

    } catch (err) {

      console.error(
        "❌ ERROR FETCHING EVIDENCE:",
        err
      );

      // 🔐 TOKEN EXPIRED
      if (err.response?.status === 401) {

        localStorage.removeItem("token");

        navigate("/login");
      }

    } finally {

      setLoading(false);
    }
  };

  // ================= GO BACK =================
  const goBack = () => {

    navigate("/devices");
  };

  return (

    <div className="min-h-screen bg-black text-white">

      {/* ================= NAVBAR ================= */}
      <div className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur">

        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between gap-4">

          <div>

            <h1 className="text-2xl md:text-3xl font-black">
              Evidence Center
            </h1>

            <p className="text-gray-400 text-sm mt-1">
              Screenshots & camera captures
            </p>

          </div>

          <button
            onClick={goBack}
            className="bg-blue-600 hover:bg-blue-700 px-5 py-3 rounded-2xl font-bold transition"
          >
            ← Back
          </button>

        </div>
      </div>

      {/* ================= CONTENT ================= */}
      <div className="max-w-7xl mx-auto px-4 py-8">

        {/* ================= HERO ================= */}
        <div className="mb-10">

          <div className="inline-flex items-center gap-2 bg-purple-500/10 text-purple-400 border border-purple-500/20 px-4 py-2 rounded-full text-sm font-semibold mb-5">
            📂 LIVE EVIDENCE STREAM
          </div>

          <h2 className="text-4xl md:text-5xl font-black leading-tight mb-4">
            Device Evidence
          </h2>

          <p className="text-gray-400 text-base md:text-lg max-w-3xl">
            View screenshots and camera captures collected from the monitored device.
            Evidence updates automatically in real time.
          </p>

        </div>

        {/* ================= LOADING ================= */}
        {loading && (

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-10 text-center text-gray-400">

            Loading evidence...

          </div>
        )}

        {/* ================= EMPTY ================= */}
        {!loading && evidence.length === 0 && (

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-10 text-center">

            <div className="text-6xl mb-5">
              📁
            </div>

            <h2 className="text-2xl font-bold mb-3">
              No Evidence Found
            </h2>

            <p className="text-gray-400">
              No screenshots or camera captures have been uploaded yet.
            </p>

          </div>
        )}

        {/* ================= GRID ================= */}
        {!loading && evidence.length > 0 && (

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">

            {evidence.map((item) => (

              <div
                key={item.id}
                className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl hover:border-zinc-700 hover:scale-[1.01] transition-all duration-300"
              >

                {/* IMAGE */}
                <div className="overflow-hidden relative">

                  <img
                    src={`http://localhost:5050/uploads/evidence/${item.file_path}`}
                    alt="evidence"
                    onClick={() =>
                      setSelectedImage(
                        `http://localhost:5050/uploads/evidence/${item.file_path}`
                      )
                    }
                    className="w-full h-72 object-cover cursor-pointer hover:scale-105 transition duration-300"
                  />

                  <div className="absolute top-4 left-4">

                    <span
                      className={`px-4 py-2 rounded-full text-xs font-black shadow-lg ${
                        item.type === "camera"
                          ? "bg-blue-600"
                          : "bg-purple-600"
                      }`}
                    >
                      {item.type.toUpperCase()}
                    </span>

                  </div>

                </div>

                {/* INFO */}
                <div className="p-6">

                  <div className="space-y-5">

                    <div>

                      <p className="text-gray-500 text-sm mb-1">
                        Machine ID
                      </p>

                      <p className="break-all text-white font-semibold">
                        {item.machine_id}
                      </p>

                    </div>

                    <div>

                      <p className="text-gray-500 text-sm mb-1">
                        Captured At
                      </p>

                      <p className="text-white">
                        {new Date(
                          item.created_at
                        ).toLocaleString()}
                      </p>

                    </div>

                  </div>

                </div>

              </div>
            ))}
          </div>
        )}
      </div>

      {/* ================= FULLSCREEN IMAGE ================= */}
      {selectedImage && (

        <div
          onClick={() => setSelectedImage(null)}
          className="fixed inset-0 bg-black/95 flex items-center justify-center z-50 p-4"
        >

          <button
            onClick={() => setSelectedImage(null)}
            className="absolute top-5 right-5 bg-red-600 hover:bg-red-700 w-12 h-12 rounded-full text-2xl font-bold"
          >
            ×
          </button>

          <img
            src={selectedImage}
            alt="fullscreen"
            className="max-w-full max-h-full rounded-3xl shadow-2xl"
          />

        </div>
      )}
    </div>
  );
}

export default Evidence;
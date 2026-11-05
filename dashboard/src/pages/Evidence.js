
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

    // Auto refresh evidence every 10 seconds.
    const interval = setInterval(() => {
      loadEvidence();
    }, 10000);

    return () => clearInterval(interval);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ================= LOAD EVIDENCE =================

  const loadEvidence = async () => {
    try {
      const machine_id = localStorage.getItem("machine_id");

      if (!machine_id) {
        navigate("/devices");
        return;
      }

      const res = await api.get(
        `/api/dashboard/device/${encodeURIComponent(machine_id)}`
      );

      setEvidence(res.data);

    } catch (err) {
      console.error(
        "❌ ERROR FETCHING EVIDENCE:",
        err
      );

      // Token expired.
      if (err.response?.status === 401) {
        localStorage.removeItem("token");
        navigate("/login");
      }

    } finally {
      setLoading(false);
    }
  };

  // ================= OPEN EVIDENCE MAP =================

  const openEvidenceMap = () => {
    const token = localStorage.getItem("token");

    if (!token) {
      navigate("/login");
      return;
    }

    try {
      const backendUrl = new URL(
        api.defaults.baseURL || window.location.origin,
        window.location.origin
      );

      const backendOrigin = backendUrl.origin;

      const mapUrl = new URL(
        "/evidence-map.html",
        backendOrigin
      ).toString();

      // Open synchronously inside the button click
      // so the browser does not block the popup.
      const mapWindow = window.open(mapUrl, "_blank");

      if (!mapWindow) {
        alert(
          "Your browser blocked the map window. Please allow popups for DeviceGuard and try again."
        );
        return;
      }

      let completed = false;

      const handleMapMessage = (event) => {
        // Only accept messages from this map window
        // and the configured backend origin.
        if (
          event.source !== mapWindow ||
          event.origin !== backendOrigin
        ) {
          return;
        }

        if (
          !event.data ||
          event.data.type !== "DEVICEGUARD_MAP_READY" ||
          completed
        ) {
          return;
        }

        completed = true;

        // Send the existing login token directly
        // to the map window using the exact backend origin.
        mapWindow.postMessage(
          {
            type: "DEVICEGUARD_MAP_AUTH",
            token
          },
          backendOrigin
        );

        window.removeEventListener(
          "message",
          handleMapMessage
        );
      };

      window.addEventListener(
        "message",
        handleMapMessage
      );

      // Clean up if the map never becomes ready.
      setTimeout(() => {
        if (!completed) {
          window.removeEventListener(
            "message",
            handleMapMessage
          );
        }
      }, 15000);

    } catch (err) {
      console.error(
        "❌ EVIDENCE MAP ERROR:",
        err
      );

      alert("Unable to open the Evidence Intelligence Map.");
    }
  };

  // ================= IMAGE URL =================

  const getImageUrl = (item) => {
    // Prefer a secure Cloudinary URL when supplied by the backend.
    if (
      typeof item.image_url === "string" &&
      item.image_url.startsWith("https://")
    ) {
      return item.image_url;
    }

    // Legacy local evidence fallback.
    const backendUrl = api.defaults.baseURL;

    if (backendUrl && item.file_path) {
      return new URL(
        `/uploads/evidence/${encodeURIComponent(item.file_path)}`,
        backendUrl
      ).toString();
    }

    return "";
  };

  // ================= GO BACK =================

  const goBack = () => {
    navigate("/devices");
  };

  return (
    <div className="min-h-screen bg-black text-white">

      {/* ================= NAVBAR ================= */}

      <div className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur">

        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-4">

          <div>
            <h1 className="text-2xl md:text-3xl font-black">
              Evidence Center
            </h1>

            <p className="text-gray-400 text-sm mt-1">
              Screenshots & camera captures
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">

            <button
              onClick={openEvidenceMap}
              className="bg-purple-600 hover:bg-purple-700 px-5 py-3 rounded-2xl font-bold transition"
            >
              🗺️ Evidence Intelligence Map
            </button>

            <button
              onClick={goBack}
              className="bg-blue-600 hover:bg-blue-700 px-5 py-3 rounded-2xl font-bold transition"
            >
              ← Back
            </button>

          </div>
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

            {evidence.map((item) => {
              const imageUrl = getImageUrl(item);

              return (
                <div
                  key={item.id}
                  className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl hover:border-zinc-700 hover:scale-[1.01] transition-all duration-300"
                >

                  {/* IMAGE */}

                  <div className="overflow-hidden relative">

                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt="Device evidence"
                        onClick={() =>
                          setSelectedImage(imageUrl)
                        }
                        className="w-full h-72 object-cover cursor-pointer hover:scale-105 transition duration-300"
                      />
                    ) : (
                      <div className="w-full h-72 flex items-center justify-center bg-zinc-800 text-gray-400">
                        Image unavailable
                      </div>
                    )}

                    <div className="absolute top-4 left-4">
                      <span
                        className={`px-4 py-2 rounded-full text-xs font-black shadow-lg ${
                          item.type === "camera"
                            ? "bg-blue-600"
                            : "bg-purple-600"
                        }`}
                      >
                        {String(item.type || "evidence").toUpperCase()}
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
              );
            })}

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
            alt="Fullscreen evidence"
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-full rounded-3xl shadow-2xl"
          />

        </div>
      )}

    </div>
  );
}

export default Evidence;

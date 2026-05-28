import React from "react";

import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import Register from "./pages/Register";
import Login from "./pages/Login";
import Devices from "./pages/Devices";
import Evidence from "./pages/Evidence";
import Tracking from "./pages/Tracking";

import ProtectedRoute from "./components/ProtectedRoute";

function App() {

  // ================= CHECK AUTH =================
  const token = localStorage.getItem("token");

  return (

    <Router>

      <Routes>

        {/* ================= ROOT REDIRECT ================= */}
        <Route
          path="/"
          element={
            token ? (
              <Navigate to="/devices" replace />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        {/* ================= PUBLIC ROUTES ================= */}

        {/* LOGIN */}
        <Route
          path="/login"
          element={
            token ? (
              <Navigate to="/devices" replace />
            ) : (
              <Login />
            )
          }
        />

        {/* REGISTER */}
        <Route
          path="/register"
          element={
            token ? (
              <Navigate to="/devices" replace />
            ) : (
              <Register />
            )
          }
        />

        {/* ================= PROTECTED ROUTES ================= */}

        {/* DEVICES */}
        <Route
          path="/devices"
          element={
            <ProtectedRoute>
              <Devices />
            </ProtectedRoute>
          }
        />

        {/* EVIDENCE */}
        <Route
          path="/evidence"
          element={
            <ProtectedRoute>
              <Evidence />
            </ProtectedRoute>
          }
        />

        {/* TRACKING */}
        <Route
          path="/tracking"
          element={
            <ProtectedRoute>
              <Tracking />
            </ProtectedRoute>
          }
        />

        {/* ================= 404 ================= */}
        <Route
          path="*"
          element={
            <Navigate
              to={token ? "/devices" : "/login"}
              replace
            />
          }
        />

      </Routes>

    </Router>
  );
}

export default App;
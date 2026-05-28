import React from "react";
import { Navigate, useLocation } from "react-router-dom";

function ProtectedRoute({ children }) {

  const token = localStorage.getItem("token");

  const location = useLocation();

  // 🔐 NO TOKEN
  if (!token) {

    return (
      <Navigate
        to="/login"
        state={{ from: location }}
        replace
      />
    );
  }

  // ✅ TOKEN EXISTS
  return children;
}

export default ProtectedRoute;
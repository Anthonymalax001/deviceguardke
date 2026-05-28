import axios from "axios";

const api = axios.create({

  // ✅ API URL
  baseURL:
    process.env.REACT_APP_API_URL ||
    "http://localhost:5050",

});

/* 🔐 ADD TOKEN TO EVERY REQUEST */
api.interceptors.request.use((config) => {

  const token = localStorage.getItem("token");

  if (token) {

    config.headers.Authorization =
      `Bearer ${token}`;
  }

  return config;

});

export default api;
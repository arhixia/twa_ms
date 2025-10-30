//src/store/useAuthStore

import { create } from "zustand";

const useAuthStore = create((set) => ({
  token: localStorage.getItem("token"),
  role: localStorage.getItem("role"),
  fullname: localStorage.getItem("fullname"),

  // ✅ корректная установка с синхронизацией в localStorage
  setAuth: (token, role, fullname) => {
    localStorage.setItem("token", token);
    localStorage.setItem("role", role);
    localStorage.setItem("fullname", fullname);
    set({ token, role, fullname });
  },

  // ✅ очистка при logout
  logout: () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("fullname");
    set({ token: null, role: null, fullname: "" });
  },

  // ✅ восстановление данных при старте
  restoreAuth: () => {
    const token = localStorage.getItem("token");
    const role = localStorage.getItem("role");
    const fullname = localStorage.getItem("fullname");
    if (token && role) {
      set({ token, role, fullname });
    }
  },
}));

export default useAuthStore;

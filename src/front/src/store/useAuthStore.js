//src/store/useAuthStore

import { create } from "zustand";

const useAuthStore = create((set) => ({
  token: localStorage.getItem("token"),
  role: localStorage.getItem("role"),
  fullname: localStorage.getItem("fullname"),
  activeTasksCount: 0,
  assignedTasksCount: 0,
  availableTasksCount: 0,
  myTasksCount: 0,
  techActiveTasksCount: 0,
  adminTasksCount: 0,
  
  

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
    set({
       token: null,
        role: null, 
        fullname: "",
        activeTasksCount: 0,
        assignedTasksCount: 0,
        availableTasksCount: 0, 
        myTasksCount: 0,
        techActiveTasksCount: 0,
        adminTasksCount: 0,
       });
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

  setActiveTasksCount: (count) => set({ activeTasksCount: count }),
  setAssignedTasksCount: (count) => set({ assignedTasksCount: count }),
  setAvailableTasksCount: (count) => set({ availableTasksCount: count }),
  setMyTasksCount: (count) => set({ myTasksCount: count }),
  setTechActiveTasksCount: (count) => set({ techActiveTasksCount: count }),
  setAdminTasksCount: (count) => set({ adminTasksCount: count }),
  
  
  
  updateActiveTasksCount: async () => {
    try {
      const { fetchActiveTasks } = await import('../api');
      const data = await fetchActiveTasks();
      set({ activeTasksCount: data.total_count || 0 });
    } catch (e) {
      console.error("Ошибка обновления количества активных задач:", e);
    }
  },

  updateAssignedTasksCount: async () => {
    try {
      const { getAssignedTasks } = await import('../api');
      const data = await getAssignedTasks();
      set({ assignedTasksCount: data.total_count || 0 });
    } catch (e) {
      console.error("Ошибка обновления количества назначенных задач:", e);
    }
  },

  updateAvailableTasksCount: async () => {
    try {
      const { fetchAvailableTasks } = await import('../api');
      const data = await fetchAvailableTasks();
      set({ availableTasksCount: data.total_count || 0 });
    } catch (e) {
      console.error("Ошибка обновления количества доступных задач:", e);
    }
  },

  updateMyTasksCount: async () => {
    try {
      const { fetchMyTasks } = await import('../api');
      const data = await fetchMyTasks();
      set({ myTasksCount: data.total_count || 0 });
    } catch (e) {
      console.error("Ошибка обновления количества моих задач:", e);
    }
  },

   updateTechActiveTasksCount: async () => {
    try {
      const { fetchTechActiveTasks } = await import('../api');
      const data = await fetchTechActiveTasks();
      set({ techActiveTasksCount: data.total_count || 0 });
    } catch (e) {
      console.error("Ошибка обновления количества активных задач тех.спеца:", e);
    }
  },

  updateAdminTasksCount: async () => {
    try {
      const { adminListTasks } = await import('../api');
      const data = await adminListTasks();
      set({ adminTasksCount: data.total_count || 0 });
    } catch (e) {
      console.error("Ошибка обновления количества задач админа:", e);
    }
  },

}));

export default useAuthStore;

import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchAdminProfile,
  getAdminCompaniesList,
  getAdminEquipmentList,
  getAdminWorkTypesList,
  adminFilterCompletedTasks,
  getActiveMontajniks, // Используем существующий эндпоинт
} from "../../api";
import MultiSelectFilter from "../../components/MultiSelectFilter"; // Добавляем импорт компонента
import "../../styles/LogistPage.css";

// Вспомогательная функция для дебаунса
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}



export default function AdminProfilePage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [companies, setCompanies] = useState([]);



  // Состояния для фильтров истории задач
  const [selectedFilters, setSelectedFilters] = useState({
    company_id: [],
    assigned_user_id: [],
    work_type_id: [],
    equipment_id: [],
    search: "",
  });



  // Дебаунс для поиска
  const debouncedSearch = useDebounce(selectedFilters.search, 500);

  useEffect(() => {
    loadProfile();
    loadRefsForModals();
    loadFilterOptions();
  }, []);

  useEffect(() => {
    // Загружаем задачи при изменении дебаунснутого поиска или других фильтров
    const filtersToUse = { ...selectedFilters, search: debouncedSearch };
    loadHistoryTasks(filtersToUse);
  }, [debouncedSearch, selectedFilters.company_id, selectedFilters.assigned_user_id, selectedFilters.work_type_id, selectedFilters.equipment_id]);

  async function loadProfile() {
    setLoading(true);
    try {
      const data = await fetchAdminProfile();
      setProfile(data);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || "Ошибка загрузки профиля");
    } finally {
      setLoading(false);
    }
  }

  async function loadRefsForModals() {
    try {
      const [eqRes, wtRes, compRes] = await Promise.allSettled([
        getAdminEquipmentList(),
        getAdminWorkTypesList(),
        getAdminCompaniesList(),
      ]);

      setCompanies(compRes.status === "fulfilled" ? compRes.value || [] : []);
      if (eqRes.status === "fulfilled") {
        const equipmentList = eqRes.value || [];
        const uniqueCategories = [...new Set(equipmentList.map((e) => e.category))];
        setCategories(uniqueCategories);
        setFilteredCategories(uniqueCategories);
      }
    } catch {
      setCompanies([]);
      setCategories([]);
      setFilteredCategories([]);
    }
  }

  async function loadFilterOptions() {
    try {
      const [montajniksData, workTypesData, equipmentsData] = await Promise.all([
        getActiveMontajniks(), // Используем существующий эндпоинт
        getAdminWorkTypesList(),
        getAdminEquipmentList()
      ]);
      setMontajniks(montajniksData || []);
      setWorkTypes(workTypesData || []);
      setEquipments(equipmentsData || []);
    } catch (e) {
      console.error("Ошибка загрузки опций фильтров:", e);
    }
  }

  async function loadHistoryTasks(filters) {
    try {
      setHistoryLoading(true);
      const data = await adminFilterCompletedTasks(filters);
      setHistoryTasks(data || []);
    } catch (err) {
      console.error("Ошибка загрузки истории задач:", err);
      setHistoryTasks([]);
    } finally {
      setHistoryLoading(false);
    }
  }



  if (loading) return <div className="logist-main"><div className="empty">Загрузка...</div></div>;
  if (error) return <div className="logist-main"><div className="error">{error}</div></div>;

  return (
    <div className="logist-main">
      <div className="page">
        <div className="page-header">
          <h1>Личный кабинет</h1>
        </div>

        <div className="profile-overview">
          <div className="profile-card">
            <h2>Информация</h2>
            <p>
              <b>Имя:</b> {profile?.name || "—"}
            </p>
            <p>
              <b>Фамилия:</b> {profile?.lastname || "—"}
            </p>
          </div>
        </div>

       
      </div>
    </div>
  );
}


//Доделать админа
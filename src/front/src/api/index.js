import axios from "axios";

const BASE = import.meta.env.VITE_API_URL;

export const api = axios.create({
  baseURL: BASE,
  headers: { "Content-Type": "application/json" },
});

// перехватчик для токена
api.interceptors.request.use((cfg) => {
  const token = localStorage.getItem("token");
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

// ---------- AUTH ----------

export async function loginUser(login, password, telegramId = null) {
  const params = new URLSearchParams();
  params.append("username", login);
  params.append("password", password);

  const bodyData = {
    username: login,
    password: password,
    telegram_id: telegramId, //
  };

  const response = await fetch(`${BASE}/auth/token_with_tg`, { // Новый эндпоинт
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(bodyData),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: "Ошибка аутентификации" }));
    throw new Error(errorData.detail || "Ошибка аутентификации");
  }

  return response.json();
}


export async function verifyToken(token) {
  const res = await api.get(`/auth/verify-token/${token}`);
  return res.data;
}

export async function logout() {
  return (await api.post(`/auth/logout`)).data;
}




// ---------- DRAFTS ----------

export async function getAllDrafts() {
  return (await api.get("/logist/drafts")).data;
}

export async function createDraft(payload) {
  return (await api.post("/logist/drafts", payload)).data;
}

export async function getDraft(id) {
  return (await api.get(`/logist/drafts/${id}`)).data;
}

export async function patchDraft(id, payload) {
  return (await api.patch(`/logist/drafts/${id}`, payload)).data;
}

export async function deleteDraft(id) {
  return (await api.delete(`/logist/drafts/${id}`)).data;
}

// ---------- TASKS ----------

export async function publishTask(payload) {
  return (await api.post(`/logist/tasks`, payload)).data;
}

export async function editTask(id, payload) {
  return (await api.patch(`/logist/tasks/${id}`, payload)).data;
}

export async function fetchActiveTasks() {
  return (await api.get(`/logist/tasks/active`)).data;
}

export async function fetchHistory() {
  return (await api.get(`/logist/tasks/history`)).data;
}

export async function fetchTaskDetail(id) {
  return (await api.get(`/logist/tasks/${id}`)).data;
}

export async function getEquipmentList(){
  return (await api.get("/logist/equipment")).data;
}

export async function getWorkTypes(){
  return  (await api.get("/logist/work-types")).data;
}

export async function fetchTaskFullHistory(taskId) {
  return (await api.get(`/logist/tasks/${taskId}/history`)).data;
}



export async function getCompaniesList() {
  return (await api.get("/logist/companies")).data;
}


export async function getContactPersonsByCompany(companyId) {
  return (await api.get(`/logist/companies/${companyId}/contacts`)).data;
}

export async function getContactPersonPhone(contactPersonId) {
  return (await api.get(`/logist/contact-persons/${contactPersonId}/phone`)).data;
}


export async function addNewCompany(payload) {
  // payload: { name: "Название компании" }
  return (await api.post("/logist/companies", payload)).data;
}


export async function addContactPersonToCompany(companyId, payload) {
  // payload: { name: "ФИО контактного лица" }
  return (await api.post(`/logist/companies/${companyId}/contacts`, payload)).data;
}





// ---------- REPORTS ----------

export async function reviewReport(taskId, reportId, payload) {
  // payload: {"approval": "approved" | "rejected", "comment": "optional text",]}
  return (await api.post(`/logist/tasks/${taskId}/reports/${reportId}/review`, payload)).data;
}







// ---------- ATTACHMENTS ----------

export async function uploadFallback(file, taskId) {
  const form = new FormData();
  form.append("file", file);
  const res = await api.post(
    `/attachments/upload-fallback?task_id=${taskId}`, // передаём реальный taskId
    form,
    { headers: { "Content-Type": "multipart/form-data" } }
  );
  return res.data; // { attachment_id, storage_key }
}


export async function listAttachments(taskId) {
  return (await api.get(`/attachments/tasks/${taskId}/attachments`)).data;
}





// ---------- ADMIN ----------


// Получить список всех пользователей
export async function adminListUsers() {
  return (await api.get("/admin/users")).data;
}

// Создать пользователя
export async function adminCreateUser(payload) {
  return (await api.post("/admin/users", payload)).data;
}

// Удалить пользователя
export async function adminDeleteUser(userId) {
  return (await api.delete(`/admin/users/${userId}`)).data;
}

// Изменить роль пользователя
export async function adminChangeUserRole(userId, role) {
  return (await api.patch(`/admin/users/${userId}/role`, { role })).data;
}


// Изменить задачу
export async function adminUpdateTask(taskId, payload) {
  return (await api.patch(`/admin/tasks/${taskId}`, payload)).data;
}

// Получить все задачи (админ может видеть все)
export async function adminListTasks() {
  return (await api.get("/admin/tasks")).data;
}

// ✅ НОВАЯ ФУНКЦИЯ: получить задачу по ID (для админа)
export async function adminGetTaskById(taskId) {
  return (await api.get(`/admin/tasks/${taskId}`)).data;
}

export async function adminDeleteTask(taskId) {
  return (await api.delete(`/admin/tasks/${taskId}`)).data;
}



export async function getAdminCompaniesList() {
  return (await api.get("/admin/companies")).data;
}

export async function getAdminContactPersonPhone(contactPersonId) {
  return (await api.get(`/admin/contact-persons/${contactPersonId}/phone`)).data;
}

export async function getAdminContactPersonsByCompany(companyId) {
  return (await api.get(`/admin/companies/${companyId}/contacts`)).data;
}


// ---------- TECH_SUPP ----------



export async function fetchTechActiveTasks() {
  return (await api.get(`/tech_supp/tasks/active`)).data;
}


export async function fetchTechTaskFullHistory(taskId) {
  return (await api.get(`/tech_supp/tasks/${taskId}/history`)).data;
}

export async function fetchTechHistory() {
  return (await api.get(`/tech_supp/tasks/history`)).data;
}

export async function reviewTechReport(taskId, reportId, payload) {
  // payload: {"approval": "approved" | "rejected", "comment": "optional text", }
  return (await api.post(`/tech_supp/tasks/${taskId}/reports/${reportId}/review`, payload)).data;
}


export async function fetchTechTaskDetail(id) {
  return (await api.get(`/tech_supp/tasks/${id}`)).data;
}



export async function getTechCompaniesList() {
  return (await api.get("/tech_supp/companies")).data;
}


export async function getTechContactPersonsByCompany(companyId) {
  return (await api.get(`/tech_supp/companies/${companyId}/contacts`)).data;
}


export async function getTechContactPersonPhone(contactPersonId) {
  return (await api.get(`/tech_supp/contact-persons/${contactPersonId}/phone`)).data;
}

// ---------- MONTAJNIK ---------- 

export async function fetchMontajnikReportReviews() {
  return (await api.get("/montajnik/my_reports_reviews")).data;
}

// ✅ Получить свои задачи
export async function fetchMyTasks() {
  return (await api.get("/montajnik/tasks/mine")).data;
}

// ✅ Получить доступные задачи (broadcast)
export async function fetchAvailableTasks() {
  return (await api.get("/montajnik/tasks/available")).data;
}

// ✅ Принять задачу
export async function acceptTask(taskId) {
  return (await api.post(`/montajnik/tasks/${taskId}/accept`)).data;
}

// ✅ Изменить статус задачи
export async function changeTaskStatus(taskId, statusPayload) {
  return (await api.post(`/montajnik/tasks/${taskId}/status`, { status: statusPayload })).data;
}

// ✅ Создать отчёт
export async function createReport(taskId, text, photos = []) {
  // photos: ["storage_key1", ...]
  return (await api.post(`/montajnik/tasks/${taskId}/report`, { text, photos })).data;
}

// ✅ Отправить отчёт на проверку
export async function submitReportForReview(taskId, reportId) {
  return (await api.post(`/montajnik/tasks/${taskId}/report/${reportId}/submit`)).data;
}

// ✅ Получить профиль монтажника
export async function fetchMontajnikProfile() {
  return (await api.get("/montajnik/me")).data;
}

// ✅ Получить вложения отчёта (для монтажника)
export async function getMontajnikReportAttachments(taskId, reportId) {
  return (await api.get(`/montajnik/tasks/${taskId}/reports/${reportId}/attachments`)).data;
}

// ✅ Удалить вложение отчёта (для монтажника)
export async function deleteMontajnikReportAttachment(taskId, reportId, attachmentId) {
  return (await api.delete(`/montajnik/tasks/${taskId}/reports/${reportId}/attachments/${attachmentId}`)).data;
}


export async function fetchMontTaskDetail(id) {
  return (await api.get(`/montajnik/tasks/${id}`)).data;
}


export async function fetchAvailableMontTaskDetail(id) {
  return (await api.get(`/montajnik/tasks/available/${id}`)).data;
}


export async function fetchMontTaskFullHistory(taskId) {
  return (await api.get(`/montajnik/tasks/${taskId}/history`)).data;
}

export async function fetchMontHistory() {
  return (await api.get(`/montajnik/tasks/history`)).data;
}


export async function getMontCompaniesList() {
  return (await api.get("/montajnik/companies")).data;
}

export async function getMontContactPersonPhone(contactPersonId) {
  return (await api.get(`/montajnik/contact-persons/${contactPersonId}/phone`)).data;
}


export async function getMontContactPersonsByCompany(companyId) {
  return (await api.get(`/montajnik/companies/${companyId}/contacts`)).data;
}


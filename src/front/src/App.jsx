import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import useAuthStore from "./store/useAuthStore";
import LoginPage from "./pages/LoginPage";

// логист
import LogistPage from "./pages/logist/LogistPage";
import ActiveTasksPage from "./pages/logist/ActiveTasksPage";
import HistoryPage from "./pages/logist/HistoryPage";
import DraftsPage from "./pages/logist/DraftsPage";
import TaskDetailPage from "./pages/logist/TaskDetailPage";
import DraftDetailPage from "./pages/logist/DraftDetailPage";
import TaskHistoryPage from "./pages/logist/TaskHistoryPage";
import LogistProfilePage from "./pages/logist/LogistProfilePage";
import LogistCompletedTaskDetailPage from "./pages/logist/LogistCompletedTaskDetailPage";
import LogistArchivedTasksPage from "./pages/logist/LogistArchivedTasksPage";
import LogistArchivedTaskDetailPage from "./pages/logist/LogistArchivedTaskDetailPage";


import TechSuppPage from "./pages/tech_supp/TechSuppPage"; // <- Новый импорт
import TechActiveTasksPage from "./pages/tech_supp/TechActiveTasksPage"; // <- Новый импорт
import TechHistoryPage from "./pages/tech_supp/TechHistoryPage"; // <- Новый импорт
import TechTaskDetailPage from "./pages/tech_supp/TechTaskDetailPage"; // <- Новый импорт
import TechTaskHistoryPage from "./pages/tech_supp/TechTaskHistoryPage"; // <- Новый импорт
import TechSuppCompletedTaskDetailPage from "./pages/tech_supp/TechSuppCompletedTaskDetailPage";
import TechSuppProfilePage from "./pages/tech_supp/TechSuppProfilePage";

import AdminPage from "./pages/admin/AdminPage";
import UsersPage from "./pages/admin/UsersPage";
import AdminTasksPage from "./pages/admin/TaskPage";
import AdminTaskDetailPage from "./pages/admin/AdminTaskDetailPage";
import AdminTaskHistoryPage from "./pages/admin/AdminTaskHistoryPage";
import AdminProfilePage from "./pages/admin/AdminProfilePage";


import MontajnikPage from "./pages/montajnik/MontajnikPage"; // <- Новый импорт
import AvailableTasksPage from "./pages/montajnik/AvailableTasksPage"; 
import MyTasksPage from "./pages/montajnik/MyTasksPage";
import MontajnikTaskDetailPage from "./pages/montajnik/MontajnikTaskDetailPage";
import MontajnikTaskHistoryPage from "./pages/montajnik/MontajnikTaskHistoryPage";
import AvailableTaskDetailPage from "./pages/montajnik/AvailableTaskDetailPage";
import ProfilePage from "./pages/montajnik/ProfilePage";
import CompletedTaskDetailPage from "./pages/montajnik/CompletedTaskDetailPage";
import AssignedTasksPage from "./pages/montajnik/AssignedTasksPage";


export default function App() {
  const { token, role } = useAuthStore();

  if (!token) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      {role === "logist" && (
        <Route path="/logist" element={<LogistPage />}>
          <Route index element={<Navigate to="tasks/active" />} />
          <Route path="tasks/active" element={<ActiveTasksPage />} />
          <Route path="tasks/history" element={<HistoryPage />} />
          <Route path="drafts" element={<DraftsPage />} />
          <Route path="tasks/:id" element={<TaskDetailPage />} />
          <Route path="drafts/:id" element={<DraftDetailPage />} />
          <Route path="tasks/:id/history" element={<TaskHistoryPage />} />
          <Route path="me" element={<LogistProfilePage />} /> {/* Новый маршрут */}
          <Route path="completed-tasks/:id" element={<LogistCompletedTaskDetailPage />} /> {/* Новый маршрут */}
          <Route path="archived-tasks" element={<LogistArchivedTasksPage />} />
          <Route path="archived-tasks/:id" element={<LogistArchivedTaskDetailPage />} />
        </Route>
      )}

       {/* Админ */}
      {role === "admin" && (
        <Route path="/admin" element={<AdminPage />}>
          <Route index element={<Navigate to="users" />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="tasks" element={<AdminTasksPage />} />
          <Route path="tasks/:id" element={<AdminTaskDetailPage />} />
          <Route path="tasks/:id/history" element={<AdminTaskHistoryPage />} />
          <Route path="me" element={<AdminProfilePage />} /> {/* Новый маршрут */}
        </Route>
      )}

      {role === "tech_supp" && (
        <Route path="/tech_supp" element={<TechSuppPage />}>
          <Route index element={<Navigate to="tasks/active" />} />
          <Route path="tasks/active" element={<TechActiveTasksPage />} />
          <Route path="tasks/history" element={<TechHistoryPage />} />
          <Route path="tasks/:id" element={<TechTaskDetailPage />} />
          <Route path="tasks/:id/history" element={<TechTaskHistoryPage />} />
          <Route path="me" element={<TechSuppProfilePage />} /> {/* Новый маршрут */}
          <Route path="completed-tasks/:id" element={<TechSuppCompletedTaskDetailPage />} /> {/* Новый маршрут */}
        </Route>
      )}

      {role === "montajnik" && (
        <Route path="/montajnik" element={<MontajnikPage />}>
          <Route index element={<Navigate to="tasks/available" />} />
          <Route path="tasks/available" element={<AvailableTasksPage />} />
          <Route path="tasks/mine" element={<MyTasksPage />} />
          <Route path="tasks/assigned" element={<AssignedTasksPage />} />
          <Route path="tasks/:id" element={<MontajnikTaskDetailPage />} />
          <Route path="tasks/:id/history" element={<MontajnikTaskHistoryPage />} />
          <Route path="tasks/available/:id" element={<AvailableTaskDetailPage />} />
          <Route path="completed-tasks/:id" element={<CompletedTaskDetailPage />} />
          <Route path="me" element={<ProfilePage />} />

        </Route>
      )}
      


      <Route path="*" element={<Navigate to={`/${role}`} replace />} />
    </Routes>
  );
}


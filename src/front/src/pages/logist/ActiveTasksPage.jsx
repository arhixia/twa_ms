import React, { useEffect, useState } from "react";
import { fetchActiveTasks } from "../../api";
import TaskCard from "../../components/TaskCard";
import AddTaskModal from "./_AddTaskModal";


export default function ActiveTasksPage() {
    const [tasks,setTasks] = useState([]);
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);



    useEffect(() => {load() }, [] );
    async function load(){
        setLoading(true);
        try{ 
            const data = await fetchActiveTasks();
            setTasks(data);
        }catch(e){
            console.error(e);
        } finally{
            setLoading(false);
        } 
    }

    return (
        <div className="page">
            <div className="page-header">
            <h1>Активные заявки</h1>
            <button className="add-btn" onClick={()=>setOpen(true)}> Добавить задачу</button>
            </div>
            <div className="cards">
            {loading ? <div>Загрузка...</div> : tasks.length ? tasks.map(t=> <TaskCard key={t.id} task={t} />) : <div className="empty">Нет активных задач</div>}
            </div>
            <AddTaskModal open={open} onClose={()=>setOpen(false)} onSaved={load} />
        </div>
    ); 


}
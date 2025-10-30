import React, { useEffect, useState } from "react";
import { fetchHistory } from "../../api";
import TaskCard from "../../components/TaskCard";



export default function HistoryPage(){
    const [items,setItems]=useState([]);
    useEffect(()=>{ fetchHistory().then(d=>setItems(d)).catch(console.error) },[]);


    return (
    <div className="page">
    <div className="page-header"><h1>История заявок</h1></div>
    <div className="cards">{items.length? items.map(i=> <TaskCard key={i.id} task={i} />) : <div className="empty">Нет завершённых задач</div>}</div>
    </div>
    );
}
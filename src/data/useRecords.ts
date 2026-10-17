import {useEffect,useState} from 'react';
import type {Repository} from './repository';
import {tables,type Table,type Of} from '../domain/types';
export type Snapshot={[T in Table]:Of<T>[]} & {error?:string};
export const emptySnapshot=():Snapshot=>({profiles:[],categories:[],events:[],recurrences:[],overrides:[],reviewItems:[],reviewLogs:[]});
export function useRecords(repository:Repository){const [data,setData]=useState<Snapshot>(emptySnapshot);useEffect(()=>{let active=true,revision=0;async function refresh(){const n=++revision;try{const entries=await Promise.all(tables.map(async table=>[table,await repository.list(table,table==='recurrences')]));if(active&&n===revision)setData(Object.fromEntries(entries)as Snapshot);}catch{if(active)setData(old=>({...old,error:'读取此设备数据失败，请刷新重试；不要清除浏览器数据。'}));}}void refresh();const off=repository.subscribe(()=>void refresh());return()=>{active=false;off();};},[repository]);return data;}

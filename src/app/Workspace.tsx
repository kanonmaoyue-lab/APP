import {useEffect,useMemo,useRef,useState} from 'react';
import {v5} from 'uuid';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {Account} from '../auth/AuthGate';
import {useRecords} from '../data/useRecords';
import {newProfile,write,change} from '../domain/types';
import {today} from '../domain/dates';
import {createEngine,type Status} from '../sync/engine';
import {createTransport} from '../sync/transport';
import {Conflicts} from '../sync/Conflicts';
import {Shell,Empty,type Page} from './components';
import CalendarPage from '../features/calendar/CalendarPage';
import SettingsPage from '../features/settings/SettingsPage';
export default function Workspace({account,client}:{account:Account;client:SupabaseClient}){const r=account.repository,data=useRecords(r),[page,setPage]=useState<Page>('today'),[date,setDate]=useState(today),[status,setStatus]=useState<Status>('syncing'),[error,setError]=useState(''),engine=useRef<ReturnType<typeof createEngine>|null>(null);const fallback=useMemo(()=>newProfile(account.userId),[account.userId]),profile=data.profiles[0]??fallback;
 useEffect(()=>{const e=createEngine({repository:r,transport:createTransport(client),onStatus:setStatus,onError:setError,afterInitialPull:async()=>{if(!(await r.list('profiles')).length)await r.enqueue({...write(account.userId,[change(fallback)]),id:v5('initial-profile',account.userId)});}});engine.current=e;e.start();return()=>{e.stop();engine.current=null;};},[r,client,account.userId]);
 const label={syncing:'正在同步…',synced:'已同步',offline:'离线 · 修改保存在此设备',conflict:'需要处理同步冲突',authRequired:'登录已过期 · 修改仍保留'}[status];
 return <Shell page={page} onPage={p=>{setPage(p);if(p==='today')setDate(today(profile.timeZone));}} account={account.session.email} status={<div className="row"><span role="status">{label}</span><button className="text" onClick={()=>void engine.current?.flush()}>立即同步</button></div>}>{data.error&&<p role="alert" className="error">{data.error}</p>}{error&&<p role="alert" className="notice">{error}</p>}{status==='authRequired'&&<button onClick={account.reauthenticate}>重新登录，保留本地修改</button>}<Conflicts repository={r} onResolved={()=>void engine.current?.flush()}/>{page==='today'||page==='calendar'?<CalendarPage key={page} repository={r} profile={profile} date={date} onDate={setDate} initialView={page==='today'?'day':'month'}/>:page==='settings'?<SettingsPage repository={r} profile={profile} onSignOut={()=>void account.signOut()}/>:<section className="panel"><Empty title={page==='reviews'?'复习花园':'顺路走走'} text="功能正在重建，现有记录不会因此更改。"/></section>}</Shell>;}

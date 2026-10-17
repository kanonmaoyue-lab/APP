import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {resolve} from 'node:path';
const local='localhost,127.0.0.1,::1,db,auth,rest,kong,mailpit,supabase_db_little-days,supabase_auth_little-days,supabase_rest_little-days,supabase_kong_little-days';
const child=spawn(resolve('node_modules/.bin/supabase'),process.argv.slice(2),{env:{...process.env,SUPABASE_HOME:resolve('../.cache/supabase'),NO_PROXY:[process.env.NO_PROXY,local].filter(Boolean).join(','),no_proxy:[process.env.no_proxy,local].filter(Boolean).join(',')},stdio:['inherit','pipe','pipe']});
for(const stream of [child.stdout,child.stderr])createInterface({input:stream}).on('line',line=>{if(/key|token|secret|password|postgres(?:ql)?:\/\//i.test(line))return;console.log(line.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[redacted]'));});child.on('exit',code=>process.exitCode=code??1);child.on('error',()=>{console.error('Backend CLI could not start');process.exitCode=1;});

import type {SupabaseClient} from '@supabase/supabase-js';
export function localConfig():{url:string;key:string;service:string};
export function createUser():Promise<{client:SupabaseClient;admin:SupabaseClient;userId:string;email:string;password:string;url:string;key:string;cleanup:()=>Promise<void>}>;

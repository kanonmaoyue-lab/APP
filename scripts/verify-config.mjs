for (
  const name of [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_PUBLISHABLE_KEY',
    'ORS_API_KEY',
    'ALLOWED_ORIGINS',
  ]
) console.log(name + ': ' + (process.env[name]?.trim() ? 'set' : 'missing'));
console.log(
  'ORS_API_KEY and ALLOWED_ORIGINS are Edge Function server settings. Values are never printed.',
);

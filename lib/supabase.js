const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;

if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_KEY environment variables');
  console.error('Available env vars:', Object.keys(process.env).filter(k => k.startsWith('SUPA')));
  process.exit(1);
}

const supabase = createClient(url, key);

module.exports = supabase;

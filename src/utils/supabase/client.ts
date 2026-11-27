import { createBrowserClient } from '@supabase/ssr';

const defaultUrl = 'https://ebygsibxdxjxaetrqrya.supabase.co';
const defaultKey = 'sb_publishable_sGe982LRaxveX8O67APzgQ_ojL_YMev';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || defaultUrl;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || defaultKey;

export const createClient = () =>
  createBrowserClient(
    supabaseUrl,
    supabaseKey,
  );

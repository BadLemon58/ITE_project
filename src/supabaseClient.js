import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jzqyhkizjlzpnkxdvkvf.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6cXloa2l6amx6cG5reGR2a3ZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyNTgyOTAsImV4cCI6MjA4NzgzNDI5MH0.foRMyUkhrntWqCJWsHbIaBeGkpbqsu0vTaunQq8ygVs';

export const supabase = createClient(supabaseUrl, supabaseKey);
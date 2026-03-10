import { supabase } from '../supabaseClient';

export async function logEvent(type, message, meta = null) {
  try {
    await supabase.from('logs').insert([{ type, message, meta }]);
  } catch (error) {
    
  }
}




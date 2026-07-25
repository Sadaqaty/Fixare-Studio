// Supabase Client for Website Visitor Tracker
// Replace these with your actual Supabase project credentials
const VT_SUPABASE_URL = 'https://nwtrcdehilebjafrdyay.supabase.co';
const VT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im53dHJjZGVoaWxlYmphZnJkeWF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5NjU0MzMsImV4cCI6MjEwMDU0MTQzM30.vGXBpayxlG8_Smsdg8XVS06e1QoJoX2yNT5bSl7eiLQ';

let vtSupabase = null;

function getVtSupabase() {
  if (!vtSupabase && typeof window.supabase !== 'undefined') {
    vtSupabase = window.supabase.createClient(VT_SUPABASE_URL, VT_SUPABASE_KEY);
  }
  return vtSupabase;
}

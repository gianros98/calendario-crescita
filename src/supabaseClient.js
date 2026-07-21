import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://tfrjtnyaevtczaydxlpz.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRmcmp0bnlhZXZ0Y3pheWR4bHB6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2NDk1NTAsImV4cCI6MjEwMDIyNTU1MH0.T7hNt9O1zEglEheYA8VO3bfZ0Veh6ow7CZ4mKMt-hO4";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const STATE_ROW_ID = 1;
export const STATE_TABLE = "fiver_plan_state";

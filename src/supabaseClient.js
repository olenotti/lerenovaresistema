import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://avycrodccpqejrqqxuof.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF2eWNyb2RjY3BxZWpycXF4dW9mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg2MTk5MTYsImV4cCI6MjA2NDE5NTkxNn0.wgno1Hiyh5Mqq3a5wLKnjzoO1o-OZqjHmBWIoMpvHtk'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
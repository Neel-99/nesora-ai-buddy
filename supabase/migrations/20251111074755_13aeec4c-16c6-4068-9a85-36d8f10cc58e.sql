-- Fix security warnings from linter

-- Enable RLS on jira_metadata table
ALTER TABLE public.jira_metadata ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for jira_metadata
CREATE POLICY "Users can view their own Jira metadata"
ON public.jira_metadata FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own Jira metadata"
ON public.jira_metadata FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own Jira metadata"
ON public.jira_metadata FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own Jira metadata"
ON public.jira_metadata FOR DELETE
USING (auth.uid() = user_id);

-- Enable RLS on users table  
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for users table
CREATE POLICY "Users can view their own record"
ON public.users FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own record"
ON public.users FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Fix function search paths
ALTER FUNCTION public.update_profiles_updated_at() SET search_path = public;
ALTER FUNCTION public.update_jira_connections_updated_at() SET search_path = public;
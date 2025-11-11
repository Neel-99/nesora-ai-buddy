-- Fix jira_connections: handle invalid UUID data

-- First, delete rows with invalid UUID format
DELETE FROM public.jira_connections 
WHERE user_id ~ '[^0-9a-f-]' OR length(user_id) != 36;

-- Now proceed with schema changes

-- Step 1: Add id column
ALTER TABLE public.jira_connections 
ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();

-- Step 2: Convert user_id from TEXT to UUID
ALTER TABLE public.jira_connections 
ADD COLUMN user_id_new UUID;

-- Convert valid UUIDs
UPDATE public.jira_connections 
SET user_id_new = user_id::uuid 
WHERE user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- Remove old column
ALTER TABLE public.jira_connections DROP COLUMN user_id;
ALTER TABLE public.jira_connections RENAME COLUMN user_id_new TO user_id;
ALTER TABLE public.jira_connections ALTER COLUMN user_id SET NOT NULL;

-- Step 3: Set primary key
DO $$ 
BEGIN
  ALTER TABLE public.jira_connections ADD PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table THEN NULL;
END $$;

-- Step 4: Create unique index
CREATE UNIQUE INDEX IF NOT EXISTS jira_connections_user_id_idx 
ON public.jira_connections(user_id);

-- Step 5: Set defaults
ALTER TABLE public.jira_connections ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE public.jira_connections ALTER COLUMN updated_at SET DEFAULT now();

-- Step 6: Enable RLS
ALTER TABLE public.jira_connections ENABLE ROW LEVEL SECURITY;

-- Step 7: Create policies
DROP POLICY IF EXISTS "Users can view their own Jira connections" ON public.jira_connections;
DROP POLICY IF EXISTS "Users can insert their own Jira connections" ON public.jira_connections;
DROP POLICY IF EXISTS "Users can update their own Jira connections" ON public.jira_connections;
DROP POLICY IF EXISTS "Users can delete their own Jira connections" ON public.jira_connections;

CREATE POLICY "Users can view their own Jira connections"
ON public.jira_connections FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own Jira connections"
ON public.jira_connections FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own Jira connections"
ON public.jira_connections FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own Jira connections"
ON public.jira_connections FOR DELETE
USING (auth.uid() = user_id);

-- Step 8: Add trigger
CREATE OR REPLACE FUNCTION public.update_jira_connections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_jira_connections_updated_at ON public.jira_connections;

CREATE TRIGGER update_jira_connections_updated_at
BEFORE UPDATE ON public.jira_connections
FOR EACH ROW
EXECUTE FUNCTION public.update_jira_connections_updated_at();
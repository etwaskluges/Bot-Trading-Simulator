-- Add role column to auth.users if it doesn't exist
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';

-- Function to update user role to moderator
CREATE OR REPLACE FUNCTION update_user_role_to_moderator()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update the current user's role to moderator
  UPDATE auth.users
  SET role = 'moderator'
  WHERE id = auth.uid();
END;
$$;
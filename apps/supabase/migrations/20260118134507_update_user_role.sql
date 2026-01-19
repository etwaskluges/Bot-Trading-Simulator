-- Add role column to auth.users if it doesn't exist
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'authenticated';

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

-- Function to update any user's role (admin only)
CREATE OR REPLACE FUNCTION update_user_role(target_user_id UUID, new_role TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only allow moderators to change roles
  IF (SELECT role FROM auth.users WHERE id = auth.uid()) != 'moderator' THEN
    RAISE EXCEPTION 'Only moderators can change user roles';
  END IF;

  -- Validate role
  IF new_role NOT IN ('authenticated', 'moderator') THEN
    RAISE EXCEPTION 'Invalid role. Must be authenticated or moderator';
  END IF;

  -- Update the target user's role
  UPDATE auth.users
  SET role = new_role
  WHERE id = target_user_id;
END;
$$;

-- Function to check if current user is moderator
CREATE OR REPLACE FUNCTION is_current_user_moderator()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN (SELECT role FROM auth.users WHERE id = auth.uid()) = 'moderator';
END;
$$;
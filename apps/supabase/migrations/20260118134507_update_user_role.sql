-- Function to update user role to moderator
CREATE OR REPLACE FUNCTION make_user_moderator()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Insert new row for the user if it doesn't exist, or update existing role to moderator
  INSERT INTO public.privileges (user_id, exchange_role)
  VALUES (auth.uid(), 'moderator')
  ON CONFLICT (user_id)
  DO UPDATE SET exchange_role = 'moderator';
END;
$$;

-- Function to check if current user is moderator
CREATE OR REPLACE FUNCTION is_current_user_moderator()
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN (SELECT exchange_role FROM public.privileges WHERE user_id = auth.uid()) = 'moderator';
END;
$$;
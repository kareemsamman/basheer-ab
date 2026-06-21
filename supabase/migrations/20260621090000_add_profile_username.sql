-- Add username column for password-based login (employees can sign in with
-- a username or email + password, no OTP required).
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS username text;

-- Case-insensitive unique usernames, allowing NULLs for users without one.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_key
ON public.profiles (lower(username))
WHERE username IS NOT NULL;

COMMENT ON COLUMN public.profiles.username IS
  'Optional login username for password-based auth. Case-insensitive unique.';

-- Migration: Add user-to-user phone-based authorization support
-- Run this on the parking_system database

-- 1. Add delegate_user_id column to authorizations table
--    This links to the registered user who is being authorized (found via phone number)
ALTER TABLE public.authorizations
  ADD COLUMN IF NOT EXISTS delegate_user_id uuid REFERENCES public.users(user_id) ON DELETE SET NULL;

-- 2. Make delegate_face_image and delegate_embedding nullable
--    so that user-to-user authorizations (which use the delegate's own registered face)
--    do not require storing a face image directly in the authorization record
ALTER TABLE public.authorizations
  ALTER COLUMN delegate_face_image DROP NOT NULL;

ALTER TABLE public.authorizations
  ALTER COLUMN delegate_embedding DROP NOT NULL;

-- 3. Add index for fast lookup by delegate_user_id
CREATE INDEX IF NOT EXISTS idx_auth_delegate_user
  ON public.authorizations (delegate_user_id)
  WHERE delegate_user_id IS NOT NULL;

-- 4. Add a check: either delegate_face_image OR delegate_user_id must be set
--    (a valid authorization must have at least one form of delegate identity)
ALTER TABLE public.authorizations
  ADD CONSTRAINT authorization_has_delegate CHECK (
    delegate_face_image IS NOT NULL OR delegate_user_id IS NOT NULL
  );

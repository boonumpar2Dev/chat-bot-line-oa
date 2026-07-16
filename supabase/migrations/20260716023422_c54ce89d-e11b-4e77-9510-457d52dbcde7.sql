-- 1) Staff-only read policy on backup table (RLS already enabled, no policies today = locked)
CREATE POLICY "Owners and admins can view backup rollout data"
ON public._bak_live_rollout_20260703
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));

-- 2) Enforce one-role-per-user invariant at the schema level
ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_user_id_unique UNIQUE (user_id);

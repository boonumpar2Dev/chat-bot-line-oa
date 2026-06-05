-- Remove ai_delivery_logs from realtime publication to prevent PII broadcast to all staff
ALTER PUBLICATION supabase_realtime DROP TABLE public.ai_delivery_logs;

-- Tighten line-media storage policies: restrict to staff members and add UPDATE/DELETE
DROP POLICY IF EXISTS "Auth upload line-media" ON storage.objects;

CREATE POLICY "Staff can upload line-media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'line-media' AND public.is_staff_member(auth.uid()));

CREATE POLICY "Staff can update line-media"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'line-media' AND public.is_staff_member(auth.uid()))
WITH CHECK (bucket_id = 'line-media' AND public.is_staff_member(auth.uid()));

CREATE POLICY "Staff can delete line-media"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'line-media' AND public.is_staff_member(auth.uid()));
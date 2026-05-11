-- Migration: Thêm cột angle vào user_face_images
-- Chạy trong database: parking_system

-- Bước 1: Thêm cột angle
ALTER TABLE public.user_face_images
  ADD COLUMN IF NOT EXISTS angle VARCHAR(10)
  CHECK (angle IN ('front', 'left', 'right', 'up', 'down'));

-- Bước 2: Unique constraint – mỗi user chỉ có 1 ảnh mỗi góc
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_user_face_angle'
      AND conrelid = 'public.user_face_images'::regclass
  ) THEN
    ALTER TABLE public.user_face_images
      ADD CONSTRAINT uq_user_face_angle UNIQUE (user_id, angle);
  END IF;
END $$;

-- Bước 3: Cập nhật view v_pending_face_images để thêm cột angle
DROP VIEW IF EXISTS public.v_pending_face_images;
CREATE VIEW public.v_pending_face_images AS
  SELECT fi.image_id,
    fi.user_id,
    fi.image_path,
    fi.angle,
    fi.status,
    fi.created_at,
    u.full_name,
    u.phone_number
  FROM (public.user_face_images fi
    JOIN public.users u ON (u.user_id = fi.user_id))
  WHERE (fi.status)::text = ANY (ARRAY['pending'::text, 'processing'::text])
  ORDER BY fi.created_at;

-- Bước 4: Cập nhật view v_user_face_summary để tính số góc đã đăng ký
DROP VIEW IF EXISTS public.v_user_face_summary;
CREATE VIEW public.v_user_face_summary AS
  SELECT u.user_id,
    u.full_name,
    u.phone_number,
    count(fi.image_id) AS total_images,
    count(fi.image_id) FILTER (WHERE (fi.status)::text = 'pending'::text) AS pending_count,
    count(fi.image_id) FILTER (WHERE (fi.status)::text = 'processed'::text) AS processed_count,
    count(fe.embedding_id) AS embedding_count,
    max(fi.created_at) AS last_upload_at,
    array_agg(fi.angle ORDER BY fi.angle) FILTER (WHERE fi.angle IS NOT NULL) AS registered_angles,
    (count(fi.angle) FILTER (WHERE fi.angle IS NOT NULL) >= 5) AS has_all_angles
  FROM ((public.users u
    LEFT JOIN public.user_face_images fi ON (fi.user_id = u.user_id))
    LEFT JOIN public.face_embeddings fe ON ((fe.user_id = u.user_id) AND fe.is_active))
  GROUP BY u.user_id, u.full_name, u.phone_number;

-- Xác nhận
DO $$
BEGIN
  RAISE NOTICE 'Migration complete: column angle added to user_face_images';
END $$;

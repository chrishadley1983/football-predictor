-- Add image_url column to posts table
ALTER TABLE posts ADD COLUMN IF NOT EXISTS image_url text;

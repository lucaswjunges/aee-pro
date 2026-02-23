-- Add dimension rating columns to aee_sessions (scale 1-5, nullable)
ALTER TABLE aee_sessions ADD COLUMN rating_cognitive INTEGER;
ALTER TABLE aee_sessions ADD COLUMN rating_linguistic INTEGER;
ALTER TABLE aee_sessions ADD COLUMN rating_motor INTEGER;
ALTER TABLE aee_sessions ADD COLUMN rating_social INTEGER;
ALTER TABLE aee_sessions ADD COLUMN rating_autonomy INTEGER;
ALTER TABLE aee_sessions ADD COLUMN rating_academic INTEGER;

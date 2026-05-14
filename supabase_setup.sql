-- 1. DATABASE TABLES SETUP
-- Create the main 'cards' table for storing knowledge items, links, and file metadata
CREATE TABLE IF NOT EXISTS cards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('image', 'file', 'note', 'link', 'quote')),
  title TEXT,
  content TEXT,
  thumbnail_url TEXT,
  storage_path TEXT,
  mime_type TEXT,
  size BIGINT DEFAULT 0,
  color TEXT,
  metadata JSONB DEFAULT '{}', -- Stores AI summary, link metadata, etc.
  starred BOOLEAN DEFAULT FALSE,
  trashed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create the 'tags' table
CREATE TABLE IF NOT EXISTS tags (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) NOT NULL,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#8ab4f8',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(owner_id, name)
);

-- Create the join table for cards and tags
CREATE TABLE IF NOT EXISTS card_tags (
  card_id UUID REFERENCES cards(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (card_id, tag_id)
);

-- 2. ROW LEVEL SECURITY (RLS)
ALTER TABLE cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_tags ENABLE ROW LEVEL SECURITY;

-- Policies for 'cards'
CREATE POLICY "Users manage own cards" ON cards FOR ALL USING (auth.uid() = owner_id);

-- Policies for 'tags'
CREATE POLICY "Users manage own tags" ON tags FOR ALL USING (auth.uid() = owner_id);

-- Policies for 'card_tags'
CREATE POLICY "Users manage own card_tags" ON card_tags FOR ALL USING (
  EXISTS (SELECT 1 FROM cards WHERE cards.id = card_tags.card_id AND cards.owner_id = auth.uid())
);

-- 3. STORAGE POLICIES (REQUIRED FOR FILE UPLOADS)
-- Note: You must first create a bucket named 'user-files' in the Supabase Storage dashboard.
-- These policies allow users to manage their own files in a folder named after their UID.

CREATE POLICY "Users can upload their own files" ON storage.objects
  FOR INSERT TO authenticated 
  WITH CHECK (bucket_id = 'user-files' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can view their own files" ON storage.objects
  FOR SELECT TO authenticated 
  USING (bucket_id = 'user-files' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete their own files" ON storage.objects
  FOR DELETE TO authenticated 
  USING (bucket_id = 'user-files' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can update their own files" ON storage.objects
  FOR UPDATE TO authenticated 
  USING (bucket_id = 'user-files' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 4. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_cards_owner ON cards(owner_id);
CREATE INDEX IF NOT EXISTS idx_cards_type ON cards(type);
CREATE INDEX IF NOT EXISTS idx_cards_trashed ON cards(trashed);
CREATE INDEX IF NOT EXISTS idx_cards_starred ON cards(starred);
CREATE INDEX IF NOT EXISTS idx_tags_owner ON tags(owner_id);
CREATE INDEX IF NOT EXISTS idx_card_tags_card ON card_tags(card_id);
CREATE INDEX IF NOT EXISTS idx_card_tags_tag ON card_tags(tag_id);

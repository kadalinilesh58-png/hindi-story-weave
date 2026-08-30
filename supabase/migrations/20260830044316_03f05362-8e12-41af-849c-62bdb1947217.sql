CREATE TABLE public.stories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'Untitled',
  summary TEXT NOT NULL,
  notes TEXT,
  latest_part INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.story_parts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  story_id UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  part_number INTEGER NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  plan JSONB,
  status TEXT NOT NULL DEFAULT 'planning',
  word_count INTEGER NOT NULL DEFAULT 0,
  target_words INTEGER NOT NULL DEFAULT 80000,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (story_id, part_number)
);

CREATE TABLE public.story_scenes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  part_id UUID NOT NULL REFERENCES public.story_parts(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  chapter_no INTEGER NOT NULL DEFAULT 1,
  chapter_title TEXT NOT NULL DEFAULT '',
  brief TEXT NOT NULL DEFAULT '',
  content TEXT,
  word_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (part_id, idx)
);

CREATE INDEX story_scenes_part_status_idx ON public.story_scenes (part_id, status, idx);
CREATE INDEX story_parts_status_idx ON public.story_parts (status);

GRANT SELECT ON public.stories TO anon, authenticated;
GRANT SELECT ON public.story_parts TO anon, authenticated;
GRANT SELECT ON public.story_scenes TO anon, authenticated;
GRANT ALL ON public.stories TO service_role;
GRANT ALL ON public.story_parts TO service_role;
GRANT ALL ON public.story_scenes TO service_role;

ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_scenes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read stories" ON public.stories FOR SELECT USING (true);
CREATE POLICY "Anyone can read story parts" ON public.story_parts FOR SELECT USING (true);
CREATE POLICY "Anyone can read story scenes" ON public.story_scenes FOR SELECT USING (true);
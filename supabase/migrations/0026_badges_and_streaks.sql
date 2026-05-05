-- Badges and streaks system

CREATE TABLE player_streaks (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  polla_id UUID REFERENCES pollas(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  current_result_streak INTEGER NOT NULL DEFAULT 0,
  max_result_streak INTEGER NOT NULL DEFAULT 0,
  current_exact_streak INTEGER NOT NULL DEFAULT 0,
  max_exact_streak INTEGER NOT NULL DEFAULT 0,
  current_negative_streak INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(polla_id, user_id)
);

CREATE TABLE player_badges (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  badge_id TEXT NOT NULL,
  polla_id UUID REFERENCES pollas(id) ON DELETE CASCADE,
  earned_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}',
  UNIQUE(user_id, badge_id, polla_id)
);

-- Indexes
CREATE INDEX idx_player_streaks_polla ON player_streaks(polla_id);
CREATE INDEX idx_player_streaks_user ON player_streaks(user_id);
CREATE INDEX idx_player_badges_user ON player_badges(user_id);
CREATE INDEX idx_player_badges_badge ON player_badges(badge_id);

-- RLS
ALTER TABLE player_streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "player_streaks viewable by polla members" ON player_streaks FOR SELECT USING (
  EXISTS (SELECT 1 FROM polla_members WHERE polla_id = player_streaks.polla_id AND user_id = auth.uid() AND status = 'approved')
  OR EXISTS (SELECT 1 FROM pollas WHERE id = player_streaks.polla_id AND admin_id = auth.uid())
);

CREATE POLICY "player_badges viewable by polla members or public" ON player_badges FOR SELECT USING (
  polla_id IS NULL
  OR EXISTS (SELECT 1 FROM polla_members WHERE polla_id = player_badges.polla_id AND user_id = auth.uid() AND status = 'approved')
  OR EXISTS (SELECT 1 FROM pollas WHERE id = player_badges.polla_id AND admin_id = auth.uid())
);

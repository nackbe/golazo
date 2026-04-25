-- Initial schema for Golazo Polla Deportiva
-- Run with: supabase db push

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users are handled by Supabase Auth. This table extends profiles.
CREATE TABLE profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  alias TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tournaments (World Cup, Champions League, etc.)
CREATE TABLE tournaments (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  season TEXT NOT NULL,
  api_football_id INTEGER UNIQUE,
  logo_url TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT CHECK (status IN ('upcoming', 'ongoing', 'finished')) DEFAULT 'upcoming',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Teams
CREATE TABLE teams (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  api_football_id INTEGER UNIQUE,
  name TEXT NOT NULL,
  code TEXT,
  logo_url TEXT,
  country TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Matches / Fixtures
CREATE TABLE matches (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE NOT NULL,
  api_football_id INTEGER UNIQUE,
  home_team_id UUID REFERENCES teams(id),
  away_team_id UUID REFERENCES teams(id),
  home_goals INTEGER,
  away_goals INTEGER,
  status TEXT CHECK (status IN ('NS','1H','HT','2H','ET','P','FT','AFT','CANC')) DEFAULT 'NS',
  round TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  venue TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pollas (prediction pools)
CREATE TABLE pollas (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  tournament_id UUID REFERENCES tournaments(id) ON DELETE RESTRICT NOT NULL,
  admin_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  status TEXT CHECK (status IN ('draft','open','active','finished')) DEFAULT 'draft',
  auto_approve BOOLEAN DEFAULT FALSE,
  bet_deadline_minutes INTEGER DEFAULT 60,
  point_system JSONB DEFAULT '{
    "correct_result": 1,
    "home_goals": 1,
    "away_goals": 1,
    "exact_score": 3,
    "goal_difference": 1,
    "total_goals": 1,
    "team_qualified": 2,
    "champion": 10,
    "finalist": 5,
    "third_place": 3
  }'::jsonb,
  wildcards JSONB DEFAULT '[{"type":"x2","quantity":2},{"type":"x3","quantity":1}]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ
);

-- Polla memberships
CREATE TABLE polla_members (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  polla_id UUID REFERENCES pollas(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  alias TEXT NOT NULL,
  status TEXT CHECK (status IN ('pending','approved','rejected')) DEFAULT 'pending',
  total_points INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(polla_id, user_id)
);

-- Predictions per match
CREATE TABLE predictions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  polla_id UUID REFERENCES pollas(id) ON DELETE CASCADE NOT NULL,
  match_id UUID REFERENCES matches(id) ON DELETE CASCADE NOT NULL,
  home_goals INTEGER NOT NULL,
  away_goals INTEGER NOT NULL,
  wildcard_used TEXT CHECK (wildcard_used IN ('x2','x3')),
  points INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, polla_id, match_id)
);

-- Special predictions (champion, finalists, etc.)
CREATE TABLE special_predictions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  polla_id UUID REFERENCES pollas(id) ON DELETE CASCADE NOT NULL,
  type TEXT CHECK (type IN ('champion','finalist','third_place','qualified','quarterfinalist','semifinalist','top_scorer')) NOT NULL,
  team_id UUID REFERENCES teams(id),
  player_name TEXT,
  points INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ranking history (for evolution chart)
CREATE TABLE ranking_history (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  polla_id UUID REFERENCES pollas(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  match_id UUID REFERENCES matches(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  total_points INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_matches_tournament ON matches(tournament_id);
CREATE INDEX idx_matches_status ON matches(status);
CREATE INDEX idx_matches_scheduled ON matches(scheduled_at);
CREATE INDEX idx_predictions_user ON predictions(user_id);
CREATE INDEX idx_predictions_match ON predictions(match_id);
CREATE INDEX idx_polla_members_polla ON polla_members(polla_id);
CREATE INDEX idx_polla_members_user ON polla_members(user_id);
CREATE INDEX idx_special_predictions_polla ON special_predictions(polla_id);
CREATE INDEX idx_ranking_history_polla ON ranking_history(polla_id);

-- Row Level Security (RLS) policies
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE pollas ENABLE ROW LEVEL SECURITY;
ALTER TABLE polla_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE special_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ranking_history ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read all, update own
CREATE POLICY "Profiles are viewable by everyone" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Pollas: admin full control, members can read
CREATE POLICY "Pollas viewable by members" ON pollas FOR SELECT USING (
  EXISTS (SELECT 1 FROM polla_members WHERE polla_id = pollas.id AND user_id = auth.uid() AND status = 'approved')
  OR admin_id = auth.uid()
);
CREATE POLICY "Admin can update polla" ON pollas FOR UPDATE USING (admin_id = auth.uid());

-- Predictions: users can manage own, see others only after match started
CREATE POLICY "Users can manage own predictions" ON predictions FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users can view predictions after match started" ON predictions FOR SELECT USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM matches m WHERE m.id = predictions.match_id AND m.status != 'NS'
  )
);

-- Function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_predictions_updated_at BEFORE UPDATE ON predictions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

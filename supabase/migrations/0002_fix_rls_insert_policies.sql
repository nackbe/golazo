-- Fix missing INSERT RLS policies from initial schema
-- Run this in Supabase SQL Editor if onboarding fails with "permission denied"

-- Profiles: users can create their own profile
CREATE POLICY IF NOT EXISTS "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Pollas: users can create polls where they are admin
CREATE POLICY IF NOT EXISTS "Users can create pollas" ON pollas
  FOR INSERT WITH CHECK (auth.uid() = admin_id);

-- Polla members: users can join (insert their own membership)
CREATE POLICY IF NOT EXISTS "Users can join pollas" ON polla_members
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Predictions: users can create their own predictions
CREATE POLICY IF NOT EXISTS "Users can insert predictions" ON predictions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Special predictions: users can insert their own
CREATE POLICY IF NOT EXISTS "Users can insert special predictions" ON special_predictions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Ranking history: system can insert (used by point recalculation)
CREATE POLICY IF NOT EXISTS "System can insert ranking history" ON ranking_history
  FOR INSERT WITH CHECK (true);

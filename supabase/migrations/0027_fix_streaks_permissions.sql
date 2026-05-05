-- Fix permissions for player_streaks and player_badges
-- Required when tables were created manually in SQL Editor without CLI

GRANT ALL ON player_streaks TO service_role;
GRANT ALL ON player_badges TO service_role;

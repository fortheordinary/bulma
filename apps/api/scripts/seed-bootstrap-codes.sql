-- One-off: seed 5 ownerless bootstrap referral codes so the first friends can
-- onboard now that a referral code is mandatory. Ownerless => no credit awarded
-- on conversion (matches the original INITIAL bootstrap pattern).
-- Apply once against prod D1:
--   wrangler d1 execute bulma --env production --remote --file scripts/seed-bootstrap-codes.sql
INSERT INTO referral_codes (id, owner_user_id, code, status, created_at) VALUES
  ('rc_9utNbs2wbb1D', NULL, '7P44RD', 'available', 1780191720),
  ('rc_U21hm2ERVHY0', NULL, 'BEUXGP', 'available', 1780191720),
  ('rc_BiHUnbL7nkTj', NULL, '89DKRA', 'available', 1780191720),
  ('rc_Yl_c6Tp0fCtE', NULL, '8FG4UE', 'available', 1780191720),
  ('rc_ZGA4Wt-2ySq7', NULL, 'R32K8U', 'available', 1780191720);

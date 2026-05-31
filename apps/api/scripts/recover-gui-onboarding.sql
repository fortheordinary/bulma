-- One-off recovery: the first user (gui.rodz.dev) was approved by BlindPay, but
-- the receiver.update webhook predated the webhook-parsing fix and was dropped
-- as "unknown". Svix replays reuse the same svix-id, so the stale event can't be
-- reprocessed through the dedup guard. Reconstruct the ready state directly from
-- the verified webhook payloads (managed wallet bl_, AA bridge bw_, VA va_), then
-- mint the user's 5 referral codes (what provisionWalletAndVirtualAccount does).
UPDATE user_profile
SET wallet_id='bl_mSPLIVyMZWSC',
    wallet_address='0x1e7e919ba8c0dda1514c1ba7e6813db8715cf8e2',
    virtual_account_id='va_tZTCSe94rcLj',
    onboarding_state='ready'
WHERE user_id='dB0BCiUEabeNAfB6edV9fbz5YyIfITNw';

INSERT INTO referral_codes (id, owner_user_id, code, status, created_at) VALUES
  ('rc_L7drJebkzrQL', 'dB0BCiUEabeNAfB6edV9fbz5YyIfITNw', 'JRHT8Z', 'available', 1780192832),
  ('rc_erk_pWR3eEME', 'dB0BCiUEabeNAfB6edV9fbz5YyIfITNw', 'XNP4YD', 'available', 1780192832),
  ('rc_e-urm4VpjTWm', 'dB0BCiUEabeNAfB6edV9fbz5YyIfITNw', '7JTT4B', 'available', 1780192832),
  ('rc_jY1rYqb2UiL8', 'dB0BCiUEabeNAfB6edV9fbz5YyIfITNw', 'ZRVVEY', 'available', 1780192832),
  ('rc_OJ_KF3mdWoW2', 'dB0BCiUEabeNAfB6edV9fbz5YyIfITNw', 'ACQ7Y2', 'available', 1780192832);

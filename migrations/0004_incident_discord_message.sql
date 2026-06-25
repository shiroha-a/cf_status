-- Discord webhook message ID of the DOWN notification, so the corresponding
-- recovery can edit the same message (strikethrough + RECOVERED info) instead
-- of posting a second message. Null when no Discord notification was captured
-- (no webhook configured, webhook returned no id, or the POST failed).
ALTER TABLE incidents ADD COLUMN discord_message_id TEXT;

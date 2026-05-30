-- Record which Cloudflare data center (colo) performed each check, since the
-- scheduled handler may run in a different colo each time and response times
-- depend on the measurement origin.
ALTER TABLE checks ADD COLUMN colo TEXT;

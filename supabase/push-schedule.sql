-- Rivl: send push notifications every minute.
-- Run this once in the Supabase SQL editor after deploying, with the two
-- placeholders replaced:
--   YOUR-APP     your Vercel address, e.g. rivl-abc.vercel.app
--   YOUR-SECRET  the CRON_SECRET value you set in Vercel
-- Running it again with new values replaces the old schedule.

create extension if not exists pg_net;

select cron.schedule(
  'rivl-push-flush',
  '* * * * *',
  $$
    select net.http_post(
      url := 'https://YOUR-APP/api/push/flush',
      headers := '{"Authorization": "Bearer YOUR-SECRET"}'::jsonb,
      timeout_milliseconds := 20000
    )
  $$
);

select 'push schedule saved';

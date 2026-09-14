# Fantasy Footwork

A small private fantasy game for friends who watch *Dancing with the Stars*: draft couples in a snake draft, survive eliminations week by week, claim replacements from the Leftovers pool, and chase the Mirrorball.

Next.js 15 on Vercel, Supabase for auth, Postgres, and realtime. Google sign-in only. Leagues are created in the app and joined by invite link.

## Run it

```bash
npm install
cp .env.local.example .env.local   # fill in the Supabase keys
npm run dev
```

See `CLAUDE.md` for the working agreement (migrations, roster writes, commands) and `IMPLEMENTATION_PLAN.md` / `PHASE_1_5_MULTI_LEAGUE.md` for the spec.

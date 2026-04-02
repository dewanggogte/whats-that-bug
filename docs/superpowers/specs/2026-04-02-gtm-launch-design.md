# What's That Bug — GTM / Launch Strategy

**Date:** 2026-04-02
**Status:** Approved
**Live URL:** https://whats-that-bug.vercel.app

## Goals (in priority order)

1. **Community credibility** — land well in entomology/citizen science communities, build a niche audience that sticks
2. **Viral reach** — maximize shares and organic growth via the Wordle-style share cards
3. **Portfolio piece** — publicly shipped project that showcases the work

**Success criteria:** Qualitative — positive community engagement, people sharing scores, organic discussion. No hard numeric targets.

## Strategy: Community Seed, Then Ripple

Start where credibility exists (Reddit), use that reception to earn credibility in the next ring (iNaturalist), then expand to broader audiences if signal is strong.

## Timeline

### April 2-6 (Thu-Mon): Pre-Launch Prep

**Must-do (launch blockers):**

1. Fix photo credit — make attribution text a clickable link to `inat_url` in `src/scripts/game-ui.js` (CC-BY 4.0 source requirement)
2. Merge `feat/mvp-implementation` branch to `main`
3. Verify production deploy on whats-that-bug.vercel.app works end-to-end
4. Play through each of the 7 sets — confirm no broken images, wrong data, or UI glitches

**Should-do (strengthens launch):**

5. Add Open Graph meta tags (`og:title`, `og:description`, `og:image`) to `src/layouts/Base.astro` — controls how the link previews on Reddit, Twitter, and messaging apps
6. Take screenshots of a completed game session for Reddit posts (share card + gameplay)
7. Draft three Reddit posts with tailored framing per community (see Launch Day section)

**Nice-to-do (if time permits):**

8. Create an iNaturalist account and make 2-3 observations/comments before week 2
9. Add a "last updated" date to the about page for data transparency
10. Courtesy email to help@inaturalist.org describing the project

**No new features.** The game is ready. Resist the urge to add "one more thing."

### April 7 (Tue): Launch — r/whatsthisbug

**When:** Tuesday April 7, 8:00 AM EST

**Post structure:**
- Title: Casual, specific, not clickbaity. E.g., *"I built a bug identification game using real iNaturalist photos — think GeoGuessr but for insects"*
- Body: 2-3 short paragraphs. What it is, how taxonomic-distance scoring works (the unique hook), link to the game. Mention it's free, no ads, no signup.
- Include a screenshot of the emoji share card as the post image
- End with a genuine ask: *"Would love to know what you think, especially if the IDs seem off or the difficulty feels wrong"*

**Day-of behavior:**
- Stay online and respond to every comment for the first several hours
- If someone reports a wrong ID, acknowledge fast — "good catch, that's from iNaturalist's research-grade data but I'll flag it"
- Watch GoatCounter and Google Sheets feedback log for live signal

### April 9 (Thu): Cross-post to r/entomology

**When:** Thursday April 9, 9:00 AM EST

**Framing:** Slightly academic. Emphasize taxonomic-distance scoring mechanics, research-grade data, CC-BY licensing. This community values depth and rigor.

### April 11 (Sat): Cross-post to r/insects

**When:** Saturday April 11, 10:00 AM EST

**Framing:** Fun and visual. Lead with the share card screenshot, "can you beat my score?" energy. This is a leisure/hobby audience.

### April 7-13: Post-Launch Monitoring

**What to watch:**

| Signal | Where | What it tells you |
|---|---|---|
| Page views + referrers | GoatCounter | Which posts drive traffic, mobile vs desktop split |
| session_start count | Google Sheets | How many visitors actually play |
| completed: true rate | Google Sheets (session_end) | Are people finishing full sessions? |
| shareClicked: true rate | Google Sheets (session_end) | Is the viral loop working? |
| round_reaction split | Google Sheets | Difficulty calibration (too_easy / just_right / too_hard) |
| playAgain responses | Google Sheets (session_feedback) | Retention signal |
| Reddit comments | Reddit | Richest qualitative feedback — wrong IDs, difficulty, feature ideas |

**Quick-fix threshold:**
- Broken functionality or wrong data: fix immediately, redeploy
- UI polish or feature requests: note them, don't act during launch week — stay focused on engagement

### April 14-20: Second Wave

**iNaturalist Forums (April 14-16):**
- Post in the General category
- Frame around their data: *"I built a game using iNaturalist research-grade observations to help people learn insect taxonomy — feedback welcome"*
- Mention CC-BY compliance, attribution linking back to original observations
- Reference Reddit reception as social proof if it went well

**Broader Reddit (April 16-20, only if initial posts landed well):**
- r/InternetIsBeautiful — exists for exactly this kind of project
- r/webgames — if the game feels polished enough for a gaming audience
- r/SideProject — developer community, portfolio angle

**Expansion gate:** Only push wider if initial Reddit posts got meaningful engagement (upvotes, comments, people sharing scores). If reception was lukewarm (<20 upvotes), iterate on the game based on feedback before expanding.

**Twitter/X (optional, anytime):**
- Post your own share card with a one-liner and the link
- Tag @iNaturalist — low effort, might get a retweet
- Not a primary channel

## iNaturalist API Compliance

**Already compliant:**
- CC-BY only photos (filtered in fetch script)
- Research-grade only observations
- Photographer attribution displayed on every photo
- Custom User-Agent: `WhatsThatBugGame/1.0 (educational project)`
- Rate-limited API calls (~55/min, under 60/min recommendation)
- Non-commercial, free, no ads
- Photos hotlinked from iNaturalist's S3 (not stored locally)
- iNaturalist credited in footer and about page

**Gap to fix before launch:**
- Photo credit text must be a clickable link to `inat_url` (CC-BY 4.0 source attribution requirement)

**No notification to iNaturalist is required.** Courtesy email is a goodwill gesture, not a blocker.

## Optimal Posting Times (Research-Based)

| Sub | Subscribers | Best Days | Best Time (EST) | Audience |
|---|---|---|---|---|
| r/whatsthisbug | 1,117,000 | Tue - Thu | 7:00 - 9:00 AM | Casual, US homeowners/hobbyists |
| r/entomology | 207,800 | Tue - Wed | 8:00 - 11:00 AM | Academic, students/researchers |
| r/insects | 194,300 | Wed - Sat | 5:00 - 8:00 PM (weekday) / 9 AM - 12 PM (weekend) | Leisure, nature enthusiasts |

**Stagger posts across subs** — these communities share users. Posting the same thing in all three on the same day feels spammy.

**Seasonal bonus:** Early April is the start of bug season in the Northern Hemisphere. Activity in these subs is ramping up.

**Tool recommendation:** Run each sub through [laterforreddit.com/analysis](https://laterforreddit.com/analysis) or [postwatch.app](https://www.postwatch.app) before posting for subreddit-specific heatmaps.

## Risks & Tradeoffs

1. **Reddit timing is hit-or-miss.** Even with optimal timing, a post can die in /new. Mitigation: the staggered multi-sub approach gives you three shots, not one.
2. **Wrong ID reports.** iNaturalist research-grade data isn't perfect. If a community expert flags a wrong species, it could undermine credibility. Mitigation: respond fast, acknowledge gracefully, note it's sourced from iNat's community-verified data.
3. **No iNaturalist forum presence.** Posting there as a new user risks being seen as drive-by promotion. Mitigation: create account early, participate minimally before posting, and lead with the Reddit social proof.
4. **Mobile experience.** Reddit users skew mobile. If the game doesn't feel good on phones, you'll lose most of the Reddit traffic. Mitigation: test thoroughly on mobile before launch.
5. **Data freshness.** The 2,621 observations were fetched at a point in time. Observations can be deleted or re-identified. Mitigation: plan to re-run the fetch script monthly. Not a launch blocker.

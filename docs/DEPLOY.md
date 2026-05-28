# Deployments

Production deploys must go through `.github/workflows/deploy.yml` so the PartyKit backend and Vercel frontend are deployed from the same commit.

## Required GitHub Secrets

- `PARTYKIT_LOGIN`: PartyKit login, for example `dewanggogte`.
- `PARTYKIT_TOKEN`: generated with `npx partykit token generate`.
- `PARTYKIT_TEAM`: optional PartyKit team id if deploying under a team.
- `VERCEL_TOKEN`: generated from Vercel account settings.
- `VERCEL_ORG_ID`: Vercel team/user id.
- `VERCEL_PROJECT_ID`: Vercel project id.

## Vercel Setting

Disable Vercel Git auto-deploys for this project. If Vercel deploys directly from GitHub, the frontend can go live before PartyKit and recreate the protocol skew that broke party host controls.

## Deploy Order

The workflow builds Vercel first, deploys PartyKit, then deploys the prebuilt Vercel output to production. That keeps the new frontend from going live before the matching backend is ready.

## Protocol Guard

The browser and PartyKit server share `PARTY_PROTOCOL_VERSION` from `src/scripts/party/protocol.js`. If a stale backend/frontend pair is served, the lobby shows a `PROTOCOL_MISMATCH` message instead of silently rendering host controls incorrectly.

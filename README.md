# Agri360 Request Materials — Form Builder

A small standalone Node/Express service that lets **CRM staff** build a
"request materials" form for a client deliverable, then publish it to the
client portal.

It is opened from a deliverable row in the Agri360 CRM, with the client and
deliverable carried in the URL:

```
https://<this-app>/?clientId=123&deliverableId=abc
```

Staff drag field types (short text, long text, number, date, file) into
question cards, name the form, optionally save/load templates, then click
**Publish**. On publish the form is created on the CRM and the staffer is sent
to the client-portal preview for the returned form token (opened in a new tab):

```
CLIENT_PORTAL_BASE + '/form/' + token
```

## Architecture (why a server, not a static SPA)

The CRM is authenticated with a **shared builder key**. A static client-side
SPA must never hold that key, so this app is a tiny Express server that:

1. Serves the builder SPA from `./public`.
2. **Proxies every `/api/*` call to the CRM**, adding the
   `X-Builder-Key` header **server-side** (from `BUILDER_KEY` in env). The
   browser never sees the key.

It exposes only one non-secret value to the browser (`/config.js` →
`CLIENT_PORTAL_BASE`), which is a public URL.

Node 20 has a global `fetch`, so the only runtime dependency is `express`.

## Endpoints

| Route | Behaviour |
|-------|-----------|
| `GET /health` | `200 ok` (Coolify health check) |
| `GET /config.js` | Injects `window.__CLIENT_PORTAL_BASE__` (public, non-secret) |
| `ANY /api/*` | Proxied to `CRM_API_BASE` + same path, adding `X-Builder-Key`; returns the CRM's status + body |
| `GET /*` | Static SPA from `./public` |

The SPA uses these CRM endpoints through the proxy:

- `POST   /api/request-forms` — publish `{clientId, deliverableId, name, fields}` → `{id, token, ...}`
- `GET    /api/request-forms/templates` — list templates
- `POST   /api/request-forms/templates` — save `{name, fields}`
- `DELETE /api/request-forms/templates/:id` — delete a template
- `GET    /api/clients/:id` — client name for the header (best-effort)

## Environment

See `.env.example`:

- `CRM_API_BASE` — CRM base URL (default `https://agri360.proagrihub.com`)
- `BUILDER_KEY` — shared builder key (secret; **set in Coolify, never commit**)
- `CLIENT_PORTAL_BASE` — public portal base (default `https://clientportal.proagrihub.com`)
- `PORT` — listen port (default `3000`)

## Run locally

```bash
npm install
cp .env.example .env   # fill in BUILDER_KEY
node server.js         # http://localhost:3000
```

## Deploy (Coolify)

Build from the included `Dockerfile` (`node:20-alpine`, `EXPOSE 3000`).
Set the env vars above in the Coolify app (especially `BUILDER_KEY`).
The container listens on `process.env.PORT || 3000`.

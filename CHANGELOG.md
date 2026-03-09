# Changelog

## [1.0.2] — 2026-03-09

Operational infrastructure: admin dashboard, repo consolidation, and relicensing.

### Added

- **Admin dashboard** — password-protected at `/admin`, shows user/page stats and a signup toggle
- **Signup toggle** — admin can disable new account creation without affecting existing users; home page and NavBar respond immediately via config API
- **`GET /api/config`** — public endpoint for feature flags consumed by the frontend on load

### Changed

- **Relicensed to AGPL-3.0** — BSL-1.1 removed; this is now the single canonical CalAnywhere repo
- **Repo consolidation** — `dajbelshaw/CalAnywhere` archived; all development continues here

---

## [1.0.1] — 2026-03-09

Configurable availability hours and timezone support.

### Fixed

- **Configurable availability hours** — owners set their working hours (e.g. 09:00–17:00) per scheduling page, replacing the hardcoded values
- **Owner timezone setting** — IANA timezone selector on create/edit page, defaulting to browser-detected zone
- **DST-correct slot generation** — availability hours are converted to UTC per calendar date using the owner's named timezone, so BST/GMT transitions (and all other DST rules worldwide) are handled automatically
- **Dynamic visitor display** — scheduling page grid range adjusts to the visitor's local timezone equivalent of the owner's hours; a visitor in UTC+1 booking with a UTC+0 owner sees 10:00–18:00, not 09:00–17:00

---

## [1.0.0] — 2026-03-05

First release of CalAnywhere. The core product is complete and in production at scheduler.dougbelshaw.com.

### Added

- **Emoji ID authentication** — email-free accounts using 3-emoji handles (e.g. 🐶🍕🚀) and iCal URL as possession factor. No passwords, no OAuth
- **Sessions and recovery codes** — httpOnly cookie sessions (7-day TTL), 5 one-time recovery codes at signup
- **Dashboard** — create, edit, and delete scheduling pages; view appointment requests
- **Page ownership and expiry** — pages linked to accounts with configurable expiry (free tier: up to 30 days)
- **Multi-calendar support** — up to 2 iCal feeds per page (free tier)
- **Encrypted notification emails** — AES-256-GCM encrypted at rest, decrypted only at send time
- **Free tier limits** — 1 active page, 2 iCal feeds, 30-day max expiry
- **iCal DST normalisation** — handles malformed UNTIL dates from Google Calendar and other providers
- **Home page** — cloud product landing page with dashboard link when signed in, version number display
- **Production deployment** — Caddy reverse proxy, Docker Compose, GitHub Actions CI building to ghcr.io

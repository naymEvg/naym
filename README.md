# Visa Assistant MVP

This repository contains a full-stack MVP for "Visa Assistant" targeting RU market.

- Frontend: React + Vite + Tailwind + Lucide React
- Backend: Node.js + Express, JWT auth, file uploads, ZIP export
- Storage: local filesystem under /uploads/{env}/{user_id}/{country}/{doc_type}/{uuid}

## Quick Start

### Backend
1. cd backend
2. cp .env.example .env  # edit secrets/paths if needed
3. npm install
4. npm run dev

Backend runs at http://localhost:4000 by default.

### Frontend
1. cd frontend
2. npm install
3. npm run dev

Frontend runs at http://localhost:5173 by default.

Login with any email and password (MVP). Admin: admin@visa.local / any password.

## Notes
- Dev uses HTTP; deploy with HTTPS and reverse proxy.
- Files saved under /uploads; served through authenticated routes only.
- See `backend/src/db/countries.json` for initial rules and checklists.
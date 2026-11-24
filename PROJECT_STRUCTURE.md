# Rhitusworld Photography — Gift Certificate & Lifecycle Studio
## Full-Stack Vite + React + PostgreSQL Project Structure

```text
rhitusworld-gift-studio/
├── README.md
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── .env
│   ├── .env.example
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── App.css
│       └── index.css
└── backend/
    ├── package.json
    ├── .env
    ├── .env.example
    ├── server.js
    └── db/
        └── schema.sql
```

### Quick Start Guide

1. **Database Setup (PostgreSQL 15+)**
   ```bash
   createdb rhitusworld_studio
   psql -d rhitusworld_studio -f backend/db/schema.sql
   ```

2. **Start Backend API (`http://localhost:4000`)**
   ```bash
   cd backend
   cp .env.example .env
   npm install
   npm run dev
   ```

3. **Start Vite Frontend (`http://localhost:5173`)**
   ```bash
   cd frontend
   cp .env.example .env
   npm install
   npm run dev
   ```
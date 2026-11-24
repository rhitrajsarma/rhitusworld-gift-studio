# Rhitusworld Photography — Gift Certificate & Lifecycle Studio

A full-stack **Vite + React** and **Node.js + Express + PostgreSQL** application for issuing, customizing, printing, and managing the complete financial lifecycle of gift certificates for **Rhitusworld Photography** (Monroe, CT).

---

## ✨ Key Features

- **Bespoke Certificate Composer & Live Proof:**
  - Real-time certificate preview styled after the official *Rhitu's World Photography* portrait voucher template.
  - Three switchable fine-art themes: **Ivory & Gold**, **Darkroom Noir**, and **Minimalist Gallery**.
  - Built-in photography session packages (*Two-Hour Custom Portrait Photography Session*, *Signature Family Portrait Session*, *Mini Natural Light Portrait Session*, *Newborn & Maternity Fine Art Session*, or *Custom Studio Credit*).
  - Automatic unique serial code generation (`RWP-YYYY-XXXX`).
- **Full Lifecycle & Financial Tracking:**
  - Real-time KPI summary cards: **Total Issued**, **Active Credit**, **Redeemed Value**, and **Expired / Void** liability.
  - Partial and full session redemptions with automatic balance recalculation.
  - Expiration date extensions, administrative voiding, and reactivation.
  - Immutable timestamped **Lifecycle Audit Trail** per certificate.
- **Print / PDF & Client Sharing:**
  - Dedicated `@media print` isolation stylesheet (`#react-print-stage`) for clean, full-bleed PDF or physical voucher printing.
  - One-click client summary copy to clipboard.
- **PostgreSQL Backend with Offline Resilience:**
  - Transactional REST API (`BEGIN` / `COMMIT` / `ROLLBACK`) backed by PostgreSQL 15+.
  - Automatic local browser cache fallback when running the frontend standalone without a live database connection.

---

## 📁 Project Folder Structure

```text
rhitusworld-gift-studio/
├── README.md
├── PROJECT_STRUCTURE.md
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── .env.example
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── App.css
│       └── index.css
└── backend/
    ├── package.json
    ├── .env.example
    ├── server.js
    └── db/
        └── schema.sql
```

---

## 🛠 Prerequisites

- **Node.js** v18 or higher (`node -v`)
- **PostgreSQL** 15 or higher (`psql --version`)

---

## 🚀 Getting Started

### 1. Initialize the PostgreSQL Database

Create a new PostgreSQL database and apply the relational schema (`gift_certificates` and `certificate_audit_logs`):

```bash
createdb rhitusworld_studio
psql -d rhitusworld_studio -f backend/db/schema.sql
```

### 2. Configure & Start the Backend API (`http://localhost:4000`)

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Update `backend/.env` with your PostgreSQL credentials if needed:

```env
PORT=4000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/rhitusworld_studio
```

### 3. Configure & Start the Vite React Frontend (`http://localhost:5173`)

Open a second terminal window:

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Ensure `frontend/.env` points to your backend API:

```env
VITE_API_URL=http://localhost:4000/api
```

---

## 🔌 Backend REST API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/certificates` | Fetch all gift certificates along with ordered `auditHistory` logs. |
| `POST` | `/api/certificates` | Issue and activate a new gift certificate and record its initial `Issued` audit entry. |
| `POST` | `/api/certificates/:id/redeem` | Record a partial or full session redemption (`{ amount, note }`) inside a DB transaction. |
| `PATCH` | `/api/certificates/:id` | Update `expirationDate`, toggle `isVoided`, and append an audit log entry. |

---

## 🖨 Printing & Exporting PDFs

1. Click any certificate in the **Registry** to open the **Lifecycle & Redemption Drawer**.
2. Click **Print / PDF** in the top-right corner of the drawer.
3. Choose **Save as PDF** or select your studio printer (enable *Background Graphics* in your browser's print dialog if printing the *Darkroom Noir* theme).

---

## 📸 Studio Contact Details (Embedded on Vouchers)

- **Studio:** Rhitusworld Photography (Authorized Photographer: Rhituraj Sarma)
- **Website:** `www.rhitusworld.com`
- **Email:** `rhituraj.sarma@outlook.com`
- **Phone:** `203-570-6131`
- **Location:** Monroe, CT
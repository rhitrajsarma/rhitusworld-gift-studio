# Rhitusworld Photography — Issue Gift Certificate & Lifecycle Management

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
- **Internal Photo-Session Scheduling:**
  - Staff can create, view, reschedule, and cancel sessions with client details, photographer, location, notes, and local-time entry.
  - Optional certificate links are informational; bookings never redeem credit or change balances or audit history.
  - PostgreSQL blocks overlapping active appointments for the same photographer; cancelled sessions release their time.
- **Print / PDF & Client Sharing:**
  - Dedicated `@media print` isolation stylesheet (`#react-print-stage`) for clean, full-bleed PDF or physical voucher printing.
  - One-click client summary copy to clipboard.
- **PostgreSQL Backend with Offline Resilience:**
  - Transactional REST API (`BEGIN` / `COMMIT` / `ROLLBACK`) backed by PostgreSQL 15+.
  - The certificate registry has a browser cache fallback; local photo bookings use a separate browser-only store and are never synchronized automatically.

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
│       ├── BookingWorkspace.jsx
│       ├── bookingUtils.js
│       ├── bookingUtils.test.js
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

Create a new PostgreSQL database and apply the relational schema (`gift_certificates`, `certificate_audit_logs`, and `bookings`):

```bash
createdb rhitusworld_studio
psql -d rhitusworld_studio -f backend/db/schema.sql
```

To upgrade an existing studio database, apply the same schema file again; it adds the bookings table and required indexes without replacing existing certificate data. The schema enables PostgreSQL's `btree_gist` extension for concurrency-safe photographer overlap enforcement, so the database role needs permission to install that extension.

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
| `GET` | `/api/bookings` | List server-backed photo-session bookings. |
| `POST` | `/api/bookings` | Create a booking with client, photographer, session, start/end timestamps, and an optional server certificate ID. |
| `PATCH` | `/api/bookings/:id` | Reschedule a booking or change its status to `cancelled`. |

### Staff booking behavior and offline limits

- Submit timezone-qualified timestamps; the workspace converts browser-local date/time inputs to UTC instants and displays times in the browser's local time zone.
- Active bookings for the same photographer cannot overlap. Adjacent appointments are allowed, and cancelled bookings do not reserve time. Concurrent conflicts are rejected by PostgreSQL with HTTP `409`.
- A server booking may optionally reference a server certificate. A browser-local booking stores its optional reference separately and never calls the redemption endpoint; balances and certificate audit logs are unchanged.
- When the API is unavailable, choose **This browser only** and acknowledge the warning to create or manage a local-only booking. Local records are stored in that browser's local storage, remain separate after reconnection, and are not uploaded, merged, or deleted automatically.
- Browser overlap checks cover only server bookings currently loaded on that device and its local bookings. If the API is offline, server data may be stale or missing; local records do not prevent conflicts on other devices and are not shared across browsers.
- If a server write times out or returns an uncertain server error, the workspace reports that its outcome is unknown and refreshes the schedule; it does not save a duplicate local booking automatically.

The API currently has no authentication and enables global CORS. Keep it on a trusted network; do not expose it publicly without adding appropriate access controls.

---

## 🖨 Printing & Exporting PDFs

1. Click any certificate in the **Registry** to open the **Lifecycle & Redemption Drawer**.
2. Click **Print / PDF** in the top-right corner of the drawer.
3. Choose **Save as PDF** or select your studio printer (enable *Background Graphics* in your browser's print dialog if printing the *Darkroom Noir* theme).

---

## 📸 Studio Contact Details (Embedded on Vouchers)

- **Studio:** Rhitusworld Photography (Authorized Photographer: Rhituraj Sarma)
- **Website:** `www.rhitusworld.com`
- **Email:** `***raj***@***.com`
- **Phone:** `***-***-***`
- **Location:** ***, CT
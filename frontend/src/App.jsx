import React, { useState, useEffect, useMemo } from 'react';
import {
  Award,
  Wallet,
  Camera,
  Archive,
  Search,
  Plus,
  Layers,
  Sparkles,
  Database,
  Server,
  Download,
  RotateCcw,
  Pencil,
  CheckCircle2,
  RefreshCw,
  Copy,
  Printer,
  X,
  CreditCard,
  CalendarPlus,
  ShieldAlert,
  Terminal,
  Check,
  AlertCircle
} from 'lucide-react';
import './App.css';

// ============================================================================
// CONSTANTS & POSTGRESQL SCHEMA / EXPRESS API REFERENCE
// ============================================================================
const STORAGE_KEY = 'rhitusworld_pg_cache_v1';
const API_CONFIG_KEY = 'rhitusworld_pg_api_config_v1';
const STUDIO_NAME_KEY = 'rhitusworld_studio_name_v1';

const resolveDefaultApiUrl = () => {
  if (typeof window !== 'undefined' && window.__VITE_API_URL__) {
    return window.__VITE_API_URL__;
  }
  if (typeof process !== 'undefined' && process.env && process.env.VITE_API_URL) {
    return process.env.VITE_API_URL;
  }
  return 'http://localhost:4000/api';
};

const DEFAULT_VITE_API_URL = resolveDefaultApiUrl();

const VITE_PROJECT_FILES_SNIPPET = `# 1. Scaffold & install dependencies
npm create vite@latest rhitusworld-studio -- --template react
cd rhitusworld-studio
npm install lucide-react
npm install -D tailwindcss @tailwindcss/vite

# 2. vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173 }
});

# 3. .env (in project root)
VITE_API_URL=http://localhost:4000/api

# 4. src/index.css & src/App.css
# Place index.css and App.css in src/ (App.jsx imports './App.css' and main.jsx imports './index.css')

# 5. src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);`;

const POSTGRES_SCHEMA_SQL = `-- PostgreSQL 15+ Schema for Rhitusworld Photography Gift Certificate Studio
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS gift_certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(32) UNIQUE NOT NULL,
  recipient_name VARCHAR(160) NOT NULL,
  recipient_email VARCHAR(160),
  purchaser_name VARCHAR(160) NOT NULL,
  purchaser_email VARCHAR(160),
  package_name VARCHAR(200) NOT NULL,
  package_description TEXT,
  original_amount NUMERIC(10, 2) NOT NULL CHECK (original_amount > 0),
  remaining_balance NUMERIC(10, 2) NOT NULL CHECK (remaining_balance >= 0),
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expiration_date DATE NOT NULL,
  authorized_photographer VARCHAR(160) NOT NULL DEFAULT 'Rhituraj Sarma',
  personal_message TEXT,
  theme VARCHAR(24) NOT NULL DEFAULT 'ivory',
  is_voided BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS certificate_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_id UUID NOT NULL REFERENCES gift_certificates(id) ON DELETE CASCADE,
  action VARCHAR(64) NOT NULL,
  amount NUMERIC(10, 2) DEFAULT 0,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_certificates_code ON gift_certificates(code);
CREATE INDEX IF NOT EXISTS idx_audit_certificate_id ON certificate_audit_logs(certificate_id);`;

const EXPRESS_BACKEND_SNIPPET = `// server.js — Node.js + Express + pg (node-postgres) REST API
import express from 'express';
import cors from 'cors';
import pg from 'pg';

const app = express();
app.use(cors());
app.use(express.json());

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// GET /api/certificates — List all vouchers with audit history
app.get('/api/certificates', async (req, res) => {
  const { rows } = await pool.query(\`
    SELECT c.*,
      COALESCE(json_agg(
        json_build_object(
          'id', a.id, 'action', a.action, 'amount', a.amount::float,
          'note', a.note, 'timestamp', a.created_at
        ) ORDER BY a.created_at ASC
      ) FILTER (WHERE a.id IS NOT NULL), '[]') AS "auditHistory"
    FROM gift_certificates c
    LEFT JOIN certificate_audit_logs a ON a.certificate_id = c.id
    GROUP BY c.id
    ORDER BY c.created_at DESC
  \`);
  res.json(rows.map(r => ({
    id: r.id,
    code: r.code,
    recipientName: r.recipient_name,
    recipientEmail: r.recipient_email,
    purchaserName: r.purchaser_name,
    purchaserEmail: r.purchaser_email,
    packageName: r.package_name,
    packageDescription: r.package_description,
    originalAmount: Number(r.original_amount),
    remainingBalance: Number(r.remaining_balance),
    issueDate: r.issue_date.toISOString().split('T')[0],
    expirationDate: r.expiration_date.toISOString().split('T')[0],
    authorizedPhotographer: r.authorized_photographer,
    personalMessage: r.personal_message,
    theme: r.theme,
    isVoided: r.is_voided,
    auditHistory: r.auditHistory
  })));
});

// POST /api/certificates — Issue new certificate
app.post('/api/certificates', async (req, res) => {
  const c = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(\`
      INSERT INTO gift_certificates (
        code, recipient_name, recipient_email, purchaser_name, purchaser_email,
        package_name, package_description, original_amount, remaining_balance,
        issue_date, expiration_date, authorized_photographer, personal_message, theme
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING id
    \`, [
      c.code, c.recipientName, c.recipientEmail, c.purchaserName, c.purchaserEmail,
      c.packageName, c.packageDescription, c.originalAmount, c.remainingBalance,
      c.issueDate, c.expirationDate, c.authorizedPhotographer, c.personalMessage, c.theme
    ]);
    await client.query(
      'INSERT INTO certificate_audit_logs (certificate_id, action, amount, note) VALUES ($1,$2,$3,$4)',
      [rows[0].id, 'Issued', c.originalAmount, \`Issued to \${c.recipientName}\`]
    );
    await client.query('COMMIT');
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// POST /api/certificates/:id/redeem — Record partial or full redemption
app.post('/api/certificates/:id/redeem', async (req, res) => {
  const { amount, note } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'UPDATE gift_certificates SET remaining_balance = GREATEST(0, remaining_balance - $1), updated_at = NOW() WHERE id = $2 RETURNING remaining_balance',
      [amount, req.params.id]
    );
    const action = Number(rows[0].remaining_balance) === 0 ? 'Fully Redeemed' : 'Partial Redemption';
    await client.query(
      'INSERT INTO certificate_audit_logs (certificate_id, action, amount, note) VALUES ($1,$2,$3,$4)',
      [req.params.id, action, amount, note]
    );
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// PATCH /api/certificates/:id — Extend expiration, void, or reactivate
app.patch('/api/certificates/:id', async (req, res) => {
  const { expirationDate, isVoided, auditAction, auditNote } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (expirationDate !== undefined) {
      await client.query('UPDATE gift_certificates SET expiration_date = $1, updated_at = NOW() WHERE id = $2', [expirationDate, req.params.id]);
    }
    if (isVoided !== undefined) {
      await client.query('UPDATE gift_certificates SET is_voided = $1, updated_at = NOW() WHERE id = $2', [isVoided, req.params.id]);
    }
    if (auditAction) {
      await client.query(
        'INSERT INTO certificate_audit_logs (certificate_id, action, amount, note) VALUES ($1,$2,0,$3)',
        [req.params.id, auditAction, auditNote || '']
      );
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.listen(4000, () => console.log('Rhitusworld PostgreSQL API listening on :4000'));`;

const PACKAGE_PRESETS = [
  {
    name: 'Two-Hour Custom Portrait Photography Session',
    price: 300,
    description:
      'Includes up to 2 hours of on-location or studio photography, pre-session style consultation, and professionally retouched high-resolution digital images.'
  },
  {
    name: 'Signature Family Portrait Session',
    price: 450,
    description:
      'Includes up to 2.5 hours of outdoor or studio photography, wardrobe consultation, and full high-resolution digital gallery.'
  },
  {
    name: 'Mini Natural Light Portrait Session',
    price: 250,
    description:
      'Includes a 45-minute natural light portrait session at a local Monroe, CT location and 15 retouched digital images.'
  },
  {
    name: 'Newborn & Maternity Fine Art Session',
    price: 550,
    description:
      'Includes up to 3 hours of gentle studio or in-home photography with heirloom prints and digital gallery.'
  },
  {
    name: 'Custom Studio Credit',
    price: 0,
    description:
      'Redeemable toward any bespoke portrait session or fine art print collection with Rhitusworld Photography.'
  }
];

// ============================================================================
// UTILITY HELPERS
// ============================================================================
function getTodayISO() {
  const now = new Date();
  const tzOffset = now.getTimezoneOffset() * 60000;
  return new Date(now - tzOffset).toISOString().split('T')[0];
}

function addMonthsISO(isoDateStr, months) {
  const base = isoDateStr ? new Date(isoDateStr + 'T12:00:00') : new Date();
  base.setMonth(base.getMonth() + months);
  const tzOffset = base.getTimezoneOffset() * 60000;
  return new Date(base - tzOffset).toISOString().split('T')[0];
}

function generateSerialCode() {
  const year = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `RWP-${year}-${rand}`;
}

function computeStatus(cert) {
  if (cert.isVoided) return 'Voided';
  const orig = Number(cert.originalAmount) || 0;
  const rem = Number(cert.remainingBalance) || 0;
  if (rem <= 0) return 'Redeemed';
  const today = getTodayISO();
  if (cert.expirationDate && cert.expirationDate < today) return 'Expired';
  if (rem < orig) return 'Partially Redeemed';
  return 'Active';
}

function formatCurrency(val) {
  const num = Number(val) || 0;
  return num.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  });
}

function formatDateReadable(isoStr) {
  if (!isoStr) return '—';
  const date = new Date(isoStr + 'T12:00:00');
  if (isNaN(date.getTime())) return isoStr;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function getSeedCertificates() {
  const today = getTodayISO();
  const nextYear = addMonthsISO(today, 12);
  const sixMonths = addMonthsISO(today, 6);
  return [
    {
      id: '550e8400-e29b-41d4-a716-446655440001',
      code: 'RWP-2026-8412',
      recipientName: 'Clara & Julian Mercer',
      recipientEmail: 'clara.mercer@example.com',
      purchaserName: 'Eleanor Sterling',
      purchaserEmail: 'eleanor@example.com',
      packageName: 'Two-Hour Custom Portrait Photography Session',
      packageDescription:
        'Includes up to 2 hours of on-location or studio photography, pre-session style consultation, and professionally retouched high-resolution digital images.',
      originalAmount: 300,
      remainingBalance: 300,
      issueDate: today,
      expirationDate: nextYear,
      authorizedPhotographer: 'Rhituraj Sarma',
      personalMessage: 'Celebrating your anniversary in Monroe — wishing you timeless portraits together.',
      theme: 'ivory',
      isVoided: false,
      auditHistory: [
        {
          timestamp: new Date().toISOString(),
          action: 'Issued',
          amount: 300,
          note: 'Certificate issued and activated ($300.00).'
        }
      ]
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440002',
      code: 'RWP-2026-5190',
      recipientName: 'Sophia & Liam Bennett',
      recipientEmail: 'sophia.b@example.com',
      purchaserName: 'Margaret Bennett',
      purchaserEmail: 'mbennett@example.com',
      packageName: 'Signature Family Portrait Session',
      packageDescription:
        'Includes up to 2.5 hours of outdoor or studio photography, wardrobe consultation, and full high-resolution digital gallery.',
      originalAmount: 450,
      remainingBalance: 200,
      issueDate: today,
      expirationDate: nextYear,
      authorizedPhotographer: 'Rhituraj Sarma',
      personalMessage: 'For our wonderful growing family!',
      theme: 'ivory',
      isVoided: false,
      auditHistory: [
        {
          timestamp: new Date().toISOString(),
          action: 'Issued',
          amount: 450,
          note: 'Certificate issued ($450.00).'
        },
        {
          timestamp: new Date().toISOString(),
          action: 'Partial Redemption',
          amount: 250,
          note: 'Autumn golden hour outdoor session deposit.'
        }
      ]
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440003',
      code: 'RWP-2026-3904',
      recipientName: 'Aria Montgomery',
      recipientEmail: 'aria.m@example.com',
      purchaserName: 'Devon Brooks',
      purchaserEmail: 'devon@example.com',
      packageName: 'Mini Natural Light Portrait Session',
      packageDescription:
        'Includes a 45-minute natural light portrait session at a local Monroe, CT location and 15 retouched digital images.',
      originalAmount: 250,
      remainingBalance: 0,
      issueDate: today,
      expirationDate: sixMonths,
      authorizedPhotographer: 'Rhituraj Sarma',
      personalMessage: 'Happy Graduation! Capture this milestone.',
      theme: 'noir',
      isVoided: false,
      auditHistory: [
        {
          timestamp: new Date().toISOString(),
          action: 'Issued',
          amount: 250,
          note: 'Certificate issued ($250.00).'
        },
        {
          timestamp: new Date().toISOString(),
          action: 'Fully Redeemed',
          amount: 250,
          note: 'Full redemption toward spring portrait session.'
        }
      ]
    }
  ];
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================
function PhotographerLogoSVG({ className = 'w-full h-full' }) {
  return (
    <svg viewBox="0 0 120 120" className={className} fill="currentColor" aria-label="Rhitusworld Photography Logo">
      <circle cx="52" cy="24" r="9.5" />
      <rect x="64" y="18" width="16" height="13" rx="2.5" />
      <rect x="80" y="21.5" width="4.5" height="6" rx="1" />
      <path d="M45 35 C41 34 36 37 33 41 L18 57 C15 60 14 64 14 69 L14 103 C14 107.5 17.5 111 22 111 C26.5 111 30 107.5 30 103 L30 73 L43 59 L48 64 C50 66 53 66 55 63 L64 49 C66 46 65 43 62 42 L53 49 L48 44 Z" />
      <rect x="65" y="34" width="14" height="5" rx="2" />
      <path d="M67 39 L40 108 C39.2 110 40.3 111.5 42.2 111.5 C43.6 111.5 44.8 110.6 45.4 109.2 L70 44 Z" />
      <path d="M69.5 39 L69.5 108.5 C69.5 110.4 70.8 111.5 72.2 111.5 C73.6 111.5 74.9 110.4 74.9 108.5 L74.9 39 Z" />
      <path d="M77 39 L104 108 C104.8 110 103.7 111.5 101.8 111.5 C100.4 111.5 99.2 110.6 98.6 109.2 L74 44 Z" />
      <polygon points="56,64 62,64 55,82 49,82" />
      <polygon points="82,64 88,64 95,82 89,82" />
    </svg>
  );
}

function StatusBadge({ status }) {
  const styles = {
    Active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    'Partially Redeemed': 'bg-amber-50 text-amber-700 border-amber-200',
    Redeemed: 'bg-sky-50 text-sky-700 border-sky-200',
    Expired: 'bg-stone-100 text-stone-600 border-stone-200',
    Voided: 'bg-rose-50 text-rose-700 border-rose-200'
  };
  const cls = styles[status] || styles.Active;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${cls}`}>
      {status}
    </span>
  );
}

function GiftCertificateProof({ cert }) {
  const theme = cert.theme || 'ivory';
  const isNoir = theme === 'noir';
  const isGallery = theme === 'gallery';

  const containerClasses = isNoir
    ? 'bg-[#141416] text-[#FAF9F6] border-[#C5A059]/60'
    : isGallery
    ? 'bg-white text-[#1C1C1E] border-stone-300'
    : 'bg-[#FBF9F4] text-[#1C1C1E] border-[#C5A059]/70';

  const innerBorderClasses = isNoir
    ? 'border-[#C5A059]/40'
    : isGallery
    ? 'border-stone-200'
    : 'border-[#C5A059]/45';

  const mutedText = isNoir ? 'text-stone-300' : 'text-[#52525B]';
  const accentText = isNoir ? 'text-[#C5A059]' : 'text-[#A8843E]';
  const lineBorder = isNoir ? 'border-stone-700' : 'border-stone-300';
  const status = computeStatus(cert);

  return (
    <div
      className={`certificate-paper relative rounded-2xl border-2 ${containerClasses} p-3 sm:p-5 shadow-md overflow-hidden select-none transition-all duration-300`}
    >
      {(status === 'Voided' || status === 'Redeemed' || status === 'Expired') && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-20">
          <span className="px-6 py-2 border-2 border-rose-600/60 text-rose-600/75 font-serif text-3xl sm:text-4xl font-bold tracking-[0.25em] uppercase -rotate-12 bg-white/85 backdrop-blur-[1px] rounded-lg">
            {status}
          </span>
        </div>
      )}

      <div className={`border ${innerBorderClasses} rounded-xl px-5 py-6 sm:px-9 sm:py-8 flex flex-col items-center text-center relative`}>
        {/* Brand Header Lockup */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
          <PhotographerLogoSVG className="w-14 h-14 sm:w-16 sm:h-16 shrink-0" />
          <div className="text-center sm:text-left">
            <div style={{ fontFamily: '"Great Vibes", cursive' }} className="text-4xl sm:text-5xl leading-none">
              Rhitu’s World
            </div>
            <div className={`text-[10px] sm:text-[15px] tracking-[0.42em] uppercase mt-1 font-light ${mutedText}`}>
              P H O T O G R A P H Y
            </div>
          </div>
        </div>

        {/* Tagline */}
        <p className={`mt-4 text-[10px] sm:text-[11px] tracking-[0.22em] uppercase font-medium ${accentText}`}>
          TIMELESS PORTRAITS &bull; NATURAL LIGHT &amp; OUTDOOR SESSIONS
        </p>

        {/* Gift Certificate Title & Divider */}
        <h3 className="mt-3 font-serif text-3xl sm:text-4xl font-semibold tracking-[0.14em] uppercase">
          GIFT CERTIFICATE
        </h3>
        <div className={`w-full max-w-md flex items-center justify-center gap-3 my-2.5 ${accentText}`}>
          <span className="flex-1 h-px bg-current opacity-45" />
          <span className="text-sm">&#10022;</span>
          <span className="flex-1 h-px bg-current opacity-45" />
        </div>

        {/* Entitlement Block */}
        <p className={`text-[10px] sm:text-[11px] tracking-[0.2em] uppercase ${mutedText} mt-1`}>
          THIS CERTIFICATE ENTITLES THE RECIPIENT TO
        </p>
        <h4 className="font-serif text-2xl sm:text-[26px] font-semibold italic mt-1">
          {cert.packageName || 'Two-Hour Custom Portrait Photography Session'}
        </h4>

        <div className={`mt-2.5 inline-flex items-baseline gap-2 px-4 py-1 rounded-full border ${innerBorderClasses}`}>
          <span className={`text-[10px] tracking-[0.18em] uppercase font-semibold ${mutedText}`}>SESSION VALUE:</span>
          <span className={`font-serif text-xl sm:text-2xl font-bold ${accentText}`}>
            {formatCurrency(cert.originalAmount)}
          </span>
        </div>

        {cert.packageDescription && (
          <p className={`mt-3 max-w-xl text-xs leading-relaxed ${mutedText}`}>{cert.packageDescription}</p>
        )}

        {cert.personalMessage && (
          <p className={`mt-2.5 max-w-lg font-serif italic text-sm ${accentText}`}>“{cert.personalMessage}”</p>
        )}

        {/* Two-Column Certificate Metadata Table */}
        <div className={`w-full mt-5 pt-4 border-t ${lineBorder} grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2.5 text-left text-xs`}>
          <div className={`flex items-baseline justify-between gap-2 border-b ${lineBorder} pb-1`}>
            <span className={`text-[10px] font-semibold tracking-wider uppercase ${mutedText} shrink-0`}>
              PRESENTED TO:
            </span>
            <span className="font-serif text-base font-semibold truncate">
              {cert.recipientName || 'Recipient Name'}
            </span>
          </div>
          <div className={`flex items-baseline justify-between gap-2 border-b ${lineBorder} pb-1`}>
            <span className={`text-[10px] font-semibold tracking-wider uppercase ${mutedText} shrink-0`}>
              CERTIFICATE NO.:
            </span>
            <span className="font-mono text-xs font-semibold">{cert.code || 'RWP-2026-0000'}</span>
          </div>

          <div className={`flex items-baseline justify-between gap-2 border-b ${lineBorder} pb-1`}>
            <span className={`text-[10px] font-semibold tracking-wider uppercase ${mutedText} shrink-0`}>
              WITH WARMEST WISHES FROM:
            </span>
            <span className="font-serif text-base font-medium truncate">
              {cert.purchaserName || 'Patron Name'}
            </span>
          </div>
          <div className={`flex items-baseline justify-between gap-2 border-b ${lineBorder} pb-1`}>
            <span className={`text-[10px] font-semibold tracking-wider uppercase ${mutedText} shrink-0`}>
              DATE ISSUED:
            </span>
            <span className="font-medium">{formatDateReadable(cert.issueDate)}</span>
          </div>

          <div className={`flex items-baseline justify-between gap-2 border-b ${lineBorder} pb-1`}>
            <span className={`text-[10px] font-semibold tracking-wider uppercase ${mutedText} shrink-0`}>
              AUTHORIZED PHOTOGRAPHER:
            </span>
            <span className="font-serif italic text-sm font-semibold">
              {cert.authorizedPhotographer || 'Rhituraj Sarma'}
            </span>
          </div>
          <div className={`flex items-baseline justify-between gap-2 border-b ${lineBorder} pb-1`}>
            <span className={`text-[10px] font-semibold tracking-wider uppercase ${mutedText} shrink-0`}>
              VALID THROUGH:
            </span>
            <span className="font-medium">{formatDateReadable(cert.expirationDate)}</span>
          </div>
        </div>

        {/* Booking Contact Footer */}
        <div className="w-full mt-5 pt-3 text-center space-y-1">
          <p className={`text-[10px] font-semibold tracking-[0.2em] uppercase ${accentText}`}>
            TO SCHEDULE YOUR SESSION
          </p>
          <p className="text-[11px] font-medium tracking-wide">
            www.rhitusworld.com &nbsp;&bull;&nbsp; rhituraj.sarma@outlook.com &nbsp;&bull;&nbsp; 203-570-6131 &nbsp;&bull;&nbsp; Monroe, CT
          </p>
          <p className={`text-[10px] leading-snug ${mutedText} max-w-lg mx-auto pt-1`}>
            Redeemable toward a portrait session ({formatCurrency(cert.originalAmount)} value). Non-refundable and not redeemable for cash. Please mention your certificate number when booking.
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN REACT APPLICATION COMPONENT
// ============================================================================
export default function App() {
  // Core Domain State
  const [studioName, setStudioName] = useState('Rhitusworld Photography');
  const [certificates, setCertificates] = useState([]);
  const [activeView, setActiveView] = useState('registry'); // 'registry' | 'issue' | 'postgres'
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedCertId, setSelectedCertId] = useState(null);
  const [printCert, setPrintCert] = useState(null);
  const [toast, setToast] = useState(null);

  // PostgreSQL Backend API Configuration & Connection Status
  const [apiConfig, setApiConfig] = useState({
    mode: 'auto', // 'auto' | 'postgres' | 'local'
    baseUrl: DEFAULT_VITE_API_URL
  });
  const [pgConnected, setPgConnected] = useState(false);
  const [pgChecking, setPgChecking] = useState(false);
  const [pgLastError, setPgLastError] = useState('');
  const [copiedCodeBlock, setCopiedCodeBlock] = useState('');

  // Composer Form State
  const [composerTheme, setComposerTheme] = useState('ivory');
  const [formState, setFormState] = useState({
    code: generateSerialCode(),
    amount: 300,
    packageName: PACKAGE_PRESETS[0].name,
    packageDescription: PACKAGE_PRESETS[0].description,
    recipientName: '',
    recipientEmail: '',
    purchaserName: '',
    purchaserEmail: '',
    authorizedPhotographer: 'Rhituraj Sarma',
    personalMessage: '',
    issueDate: getTodayISO(),
    expirationDate: addMonthsISO(getTodayISO(), 12)
  });

  // Lifecycle Drawer Action Inputs
  const [redeemAmount, setRedeemAmount] = useState('');
  const [redeemNote, setRedeemNote] = useState('');
  const [extendDate, setExtendDate] = useState('');
  const [voidReason, setVoidReason] = useState('');

  // Modals State
  const [showStudioModal, setShowStudioModal] = useState(false);
  const [studioNameDraft, setStudioNameDraft] = useState('');
  const [showResetModal, setShowResetModal] = useState(false);

  // Load Google Fonts dynamically for editorial typography
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600&family=Great+Vibes&family=Inter:wght@300;400;500;600&display=swap';
    document.head.appendChild(link);
  }, []);

  const notify = (message, type = 'success') => {
    setToast({ message, type, id: Date.now() });
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3400);
    return () => clearTimeout(t);
  }, [toast]);

  // Initial Load: Attempt PostgreSQL API fetch, gracefully fallback to cached state
  useEffect(() => {
    try {
      const savedStudio = localStorage.getItem(STUDIO_NAME_KEY);
      if (savedStudio) setStudioName(savedStudio);

      const savedCfg = localStorage.getItem(API_CONFIG_KEY);
      if (savedCfg) {
        const parsedCfg = JSON.parse(savedCfg);
        setApiConfig(parsedCfg);
        fetchFromPostgresOrCache(parsedCfg);
        return;
      }
    } catch (_) {}
    fetchFromPostgresOrCache(apiConfig);
  }, []);

  const fetchFromPostgresOrCache = async (cfg) => {
    setPgChecking(true);
    setPgLastError('');
    if (cfg.mode !== 'local') {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2200);
        const res = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/certificates`, {
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            setCertificates(data);
            setPgConnected(true);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
            setPgChecking(false);
            return;
          }
        }
        throw new Error(`HTTP ${res.status}`);
      } catch (err) {
        setPgConnected(false);
        setPgLastError(err.message || 'Unable to reach PostgreSQL API endpoint');
      }
    } else {
      setPgConnected(false);
    }

    // Fallback to local browser persistence
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setCertificates(parsed);
          setPgChecking(false);
          return;
        }
      }
    } catch (_) {}

    const seed = getSeedCertificates();
    setCertificates(seed);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
    setPgChecking(false);
  };

  const persistLocalMirror = (nextList) => {
    setCertificates(nextList);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextList));
    } catch (_) {}
  };

  // ============================================================================
  // KPI AGGREGATIONS & FILTERING
  // ============================================================================
  const kpis = useMemo(() => {
    let totalIssued = 0;
    let activeBalance = 0;
    let activeCount = 0;
    let redeemedValue = 0;
    let fullyRedeemedCount = 0;
    let inactiveCount = 0;
    let inactiveLiability = 0;

    certificates.forEach((cert) => {
      const orig = Number(cert.originalAmount) || 0;
      const rem = Number(cert.remainingBalance) || 0;
      const status = computeStatus(cert);

      if (status !== 'Voided') {
        totalIssued += orig;
        redeemedValue += Math.max(0, orig - rem);
      }
      if (status === 'Active' || status === 'Partially Redeemed') {
        activeBalance += rem;
        activeCount++;
      } else if (status === 'Redeemed') {
        fullyRedeemedCount++;
      } else if (status === 'Expired' || status === 'Voided') {
        inactiveCount++;
        inactiveLiability += rem;
      }
    });

    return {
      totalIssued,
      activeBalance,
      activeCount,
      redeemedValue,
      fullyRedeemedCount,
      inactiveCount,
      inactiveLiability
    };
  }, [certificates]);

  const filteredCertificates = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return certificates.filter((cert) => {
      const status = computeStatus(cert);
      if (statusFilter !== 'ALL' && status !== statusFilter) return false;
      if (!q) return true;
      const haystack = [
        cert.code,
        cert.recipientName,
        cert.recipientEmail,
        cert.purchaserName,
        cert.purchaserEmail,
        cert.packageName
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [certificates, searchQuery, statusFilter]);

  const selectedCert = useMemo(
    () => certificates.find((c) => c.id === selectedCertId) || null,
    [certificates, selectedCertId]
  );

  // Sync drawer inputs when a certificate is selected
  useEffect(() => {
    if (selectedCert) {
      setRedeemAmount(selectedCert.remainingBalance > 0 ? String(selectedCert.remainingBalance) : '');
      setRedeemNote('');
      setExtendDate(selectedCert.expirationDate || '');
      setVoidReason('');
    }
  }, [selectedCertId]);

  // ============================================================================
  // CRUD & LIFECYCLE HANDLERS (POSTGRESQL API + LOCAL STATE MIRROR)
  // ============================================================================
  const handlePackageSelect = (pkgName) => {
    const found = PACKAGE_PRESETS.find((p) => p.name === pkgName);
    setFormState((prev) => ({
      ...prev,
      packageName: pkgName,
      amount: found && found.price > 0 ? found.price : prev.amount,
      packageDescription: found ? found.description : prev.packageDescription
    }));
  };

  const handleIssueSubmit = async (e) => {
    e.preventDefault();
    const cleanCode = formState.code.trim().toUpperCase();
    const numericAmount = Number(formState.amount) || 0;

    if (!cleanCode || !formState.recipientName.trim() || !formState.purchaserName.trim() || numericAmount <= 0) {
      notify('Please complete all required certificate fields.', 'warning');
      return;
    }

    if (certificates.some((c) => c.code.toUpperCase() === cleanCode)) {
      notify(`Serial code ${cleanCode} already exists. Generated a fresh code.`, 'warning');
      setFormState((prev) => ({ ...prev, code: generateSerialCode() }));
      return;
    }

    const newCert = {
      id: crypto.randomUUID ? crypto.randomUUID() : `cert-${Date.now()}`,
      code: cleanCode,
      recipientName: formState.recipientName.trim(),
      recipientEmail: formState.recipientEmail.trim(),
      purchaserName: formState.purchaserName.trim(),
      purchaserEmail: formState.purchaserEmail.trim(),
      packageName: formState.packageName,
      packageDescription: formState.packageDescription.trim(),
      originalAmount: numericAmount,
      remainingBalance: numericAmount,
      issueDate: formState.issueDate,
      expirationDate: formState.expirationDate,
      authorizedPhotographer: formState.authorizedPhotographer.trim() || 'Rhituraj Sarma',
      personalMessage: formState.personalMessage.trim(),
      theme: composerTheme,
      isVoided: false,
      auditHistory: [
        {
          timestamp: new Date().toISOString(),
          action: 'Issued',
          amount: numericAmount,
          note: `Certificate issued to ${formState.recipientName.trim()} (${formatCurrency(numericAmount)}).`
        }
      ]
    };

    if (pgConnected) {
      try {
        const res = await fetch(`${apiConfig.baseUrl.replace(/\/$/, '')}/certificates`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newCert)
        });
        if (!res.ok) throw new Error('PostgreSQL INSERT rejected');
        const created = await res.json();
        if (created.id) newCert.id = created.id;
      } catch (err) {
        notify(`PostgreSQL write failed (${err.message}); saved locally.`, 'warning');
      }
    }

    const updated = [newCert, ...certificates];
    persistLocalMirror(updated);

    setFormState({
      code: generateSerialCode(),
      amount: 300,
      packageName: PACKAGE_PRESETS[0].name,
      packageDescription: PACKAGE_PRESETS[0].description,
      recipientName: '',
      recipientEmail: '',
      purchaserName: '',
      purchaserEmail: '',
      authorizedPhotographer: 'Rhituraj Sarma',
      personalMessage: '',
      issueDate: getTodayISO(),
      expirationDate: addMonthsISO(getTodayISO(), 12)
    });

    setActiveView('registry');
    setSelectedCertId(newCert.id);
    notify(
      pgConnected
        ? `Certificate ${newCert.code} committed to PostgreSQL.`
        : `Certificate ${newCert.code} issued and activated.`
    );
  };

  const handleApplyRedemption = async () => {
    if (!selectedCert) return;
    const status = computeStatus(selectedCert);
    if (status === 'Voided' || status === 'Expired' || status === 'Redeemed') {
      notify(`Cannot redeem a certificate with status: ${status}.`, 'warning');
      return;
    }

    const amt = parseFloat(redeemAmount);
    if (!amt || amt <= 0) {
      notify('Enter a valid redemption amount greater than $0.', 'warning');
      return;
    }
    if (amt > selectedCert.remainingBalance) {
      notify(`Amount exceeds remaining credit (${formatCurrency(selectedCert.remainingBalance)}).`, 'warning');
      return;
    }

    const nextBalance = Math.max(0, Number((selectedCert.remainingBalance - amt).toFixed(2)));
    const actionLabel = nextBalance === 0 ? 'Fully Redeemed' : 'Partial Redemption';
    const noteText = redeemNote.trim() || `Applied ${formatCurrency(amt)} toward studio session.`;

    if (pgConnected) {
      try {
        await fetch(`${apiConfig.baseUrl.replace(/\/$/, '')}/certificates/${selectedCert.id}/redeem`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: amt, note: noteText })
        });
      } catch (_) {}
    }

    const updated = certificates.map((c) => {
      if (c.id !== selectedCert.id) return c;
      return {
        ...c,
        remainingBalance: nextBalance,
        auditHistory: [
          ...(c.auditHistory || []),
          {
            timestamp: new Date().toISOString(),
            action: actionLabel,
            amount: amt,
            note: noteText
          }
        ]
      };
    });

    persistLocalMirror(updated);
    setRedeemAmount(nextBalance > 0 ? String(nextBalance) : '');
    setRedeemNote('');
    notify(`Recorded ${formatCurrency(amt)} redemption for ${selectedCert.code}.`);
  };

  const handleUpdateExpiration = async () => {
    if (!selectedCert || !extendDate) return;
    const oldDate = selectedCert.expirationDate;
    const noteText = `Valid through updated from ${formatDateReadable(oldDate)} to ${formatDateReadable(extendDate)}.`;

    if (pgConnected) {
      try {
        await fetch(`${apiConfig.baseUrl.replace(/\/$/, '')}/certificates/${selectedCert.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            expirationDate: extendDate,
            auditAction: 'Expiration Updated',
            auditNote: noteText
          })
        });
      } catch (_) {}
    }

    const updated = certificates.map((c) => {
      if (c.id !== selectedCert.id) return c;
      return {
        ...c,
        expirationDate: extendDate,
        auditHistory: [
          ...(c.auditHistory || []),
          {
            timestamp: new Date().toISOString(),
            action: 'Expiration Updated',
            amount: 0,
            note: noteText
          }
        ]
      };
    });

    persistLocalMirror(updated);
    notify('Certificate validity date updated.');
  };

  const handleToggleVoid = async (shouldVoid) => {
    if (!selectedCert) return;
    const actionLabel = shouldVoid ? 'Voided' : 'Reactivated';
    const noteText = shouldVoid
      ? voidReason.trim() || 'Certificate administratively voided.'
      : 'Certificate restored to active status.';

    if (pgConnected) {
      try {
        await fetch(`${apiConfig.baseUrl.replace(/\/$/, '')}/certificates/${selectedCert.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            isVoided: shouldVoid,
            auditAction: actionLabel,
            auditNote: noteText
          })
        });
      } catch (_) {}
    }

    const updated = certificates.map((c) => {
      if (c.id !== selectedCert.id) return c;
      return {
        ...c,
        isVoided: shouldVoid,
        auditHistory: [
          ...(c.auditHistory || []),
          {
            timestamp: new Date().toISOString(),
            action: actionLabel,
            amount: 0,
            note: noteText
          }
        ]
      };
    });

    persistLocalMirror(updated);
    setVoidReason('');
    notify(`Certificate ${selectedCert.code} ${shouldVoid ? 'voided' : 'reactivated'}.`);
  };

  const copyTextToClipboard = (text, label = 'Copied to clipboard.') => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      notify(label);
    } catch (_) {
      notify('Unable to copy to clipboard.', 'warning');
    }
    document.body.removeChild(ta);
  };

  const handleCopyVoucherDetails = () => {
    if (!selectedCert) return;
    const text = [
      `${studioName} — Gift Certificate`,
      `Certificate No.: ${selectedCert.code}`,
      `Presented To: ${selectedCert.recipientName}`,
      `From: ${selectedCert.purchaserName}`,
      `Session: ${selectedCert.packageName} (${formatCurrency(selectedCert.originalAmount)} Value)`,
      `Remaining Balance: ${formatCurrency(selectedCert.remainingBalance)}`,
      `Valid Through: ${formatDateReadable(selectedCert.expirationDate)}`,
      `Book at: www.rhitusworld.com | rhituraj.sarma@outlook.com | 203-570-6131`
    ].join('\n');
    copyTextToClipboard(text, 'Certificate details copied for client.');
  };

  const handlePrintCertificate = () => {
    if (!selectedCert) return;
    setPrintCert(selectedCert);
    setTimeout(() => {
      window.print();
      setTimeout(() => setPrintCert(null), 400);
    }, 100);
  };

  const handleExportJSONBackup = () => {
    const blob = new Blob([JSON.stringify(certificates, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rhitusworld-postgres-backup-${getTodayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    notify('JSON backup exported.');
  };

  const handleSaveApiConfig = (e) => {
    e.preventDefault();
    localStorage.setItem(API_CONFIG_KEY, JSON.stringify(apiConfig));
    fetchFromPostgresOrCache(apiConfig);
    notify('PostgreSQL API endpoint settings updated.');
  };

  // ============================================================================
  // RENDER
  // ============================================================================
  return (
    <div
      style={{ fontFamily: '"Inter", system-ui, sans-serif' }}
      className="min-h-screen flex flex-col bg-[#FAF9F6] text-[#1C1C1E] selection:bg-[#C5A059]/20"
    >
      {/* Print Stage */}
      {printCert && (
        <div id="react-print-stage">
          <GiftCertificateProof cert={printCert} />
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 pointer-events-none">
          <div
            className={`px-4 py-2.5 rounded-xl border shadow-lg text-xs font-medium ${
              toast.type === 'warning'
                ? 'border-amber-300 bg-amber-50 text-amber-900'
                : 'border-[#C5A059]/60 bg-[#1C1C1E] text-[#FAF9F6]'
            }`}
          >
            {toast.message}
          </div>
        </div>
      )}

      {/* Top Navigation Header */}
      <header className="sticky top-0 z-30 bg-[#FAF9F6]/90 backdrop-blur-md border-b border-stone-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-0 sm:h-20 flex flex-wrap items-center justify-between gap-3">
          {/* Brand Identity */}
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-full border border-[#C5A059]/60 bg-white flex items-center justify-center shadow-sm shrink-0 p-1.5">
              <PhotographerLogoSVG className="w-full h-full text-[#1C1C1E]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-serif text-2xl sm:text-[26px] font-semibold tracking-tight text-[#1C1C1E] leading-none">
                  {studioName}
                </h1>
                <button
                  onClick={() => {
                    setStudioNameDraft(studioName);
                    setShowStudioModal(true);
                  }}
                  title="Customize Studio Name"
                  className="p-1 rounded-lg text-[#52525B] hover:text-[#A8843E] hover:bg-[#F3F1EC] transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setActiveView('postgres')}
                  className="hidden md:inline-flex items-center gap-1.5 text-[11px] px-2.5 py-0.5 rounded-full bg-[#F3F1EC] border border-stone-200 text-[#52525B] font-medium hover:border-[#C5A059] transition-colors"
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      pgConnected ? 'bg-emerald-500' : 'bg-amber-500'
                    }`}
                  />
                  <span>{pgConnected ? 'PostgreSQL Connected' : 'PostgreSQL Standby (Local Cache)'}</span>
                </button>
              </div>
              <p className="text-xs text-[#52525B] mt-0.5">
                Vite + React Frontend &bull; PostgreSQL Relational Backend
              </p>
            </div>
          </div>

          {/* Primary Navigation Tabs & Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <nav className="flex bg-[#F3F1EC] p-1 rounded-xl border border-stone-200/70" role="tablist">
              <button
                onClick={() => setActiveView('registry')}
                className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all flex items-center gap-1.5 ${
                  activeView === 'registry'
                    ? 'bg-white text-[#1C1C1E] shadow-sm'
                    : 'text-[#52525B] hover:text-[#1C1C1E]'
                }`}
              >
                <Layers className="w-4 h-4 text-[#C5A059]" />
                <span>Registry</span>
              </button>
              <button
                onClick={() => setActiveView('issue')}
                className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all flex items-center gap-1.5 ${
                  activeView === 'issue'
                    ? 'bg-white text-[#1C1C1E] shadow-sm'
                    : 'text-[#52525B] hover:text-[#1C1C1E]'
                }`}
              >
                <Sparkles className="w-4 h-4 text-[#C5A059]" />
                <span>Issue</span>
              </button>
              <button
                onClick={() => setActiveView('postgres')}
                className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all flex items-center gap-1.5 ${
                  activeView === 'postgres'
                    ? 'bg-white text-[#1C1C1E] shadow-sm'
                    : 'text-[#52525B] hover:text-[#1C1C1E]'
                }`}
              >
                <Database className="w-4 h-4 text-[#C5A059]" />
                <span>Vite + PostgreSQL</span>
              </button>
            </nav>

            <button
              onClick={handleExportJSONBackup}
              title="Download JSON snapshot"
              className="px-3 py-2 rounded-xl border border-stone-200 bg-white hover:bg-[#F3F1EC] text-[#1C1C1E] text-xs font-medium transition-colors flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5 text-[#A8843E]" />
              <span className="hidden sm:inline">Backup JSON</span>
            </button>

            <button
              onClick={() => setShowResetModal(true)}
              title="Restore Demo Data"
              className="p-2 rounded-xl border border-stone-200 bg-white hover:bg-[#F3F1EC] text-[#52525B] hover:text-[#1C1C1E] transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* =================================================================
            VIEW 1: STUDIO REGISTRY & KPI DASHBOARD
        ================================================================= */}
        {activeView === 'registry' && (
          <section className="space-y-8">
            {/* KPI Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white rounded-2xl p-5 border border-stone-200/80 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wider text-[#52525B]">Total Issued</span>
                  <Award className="w-4 h-4 text-[#C5A059]" />
                </div>
                <p className="font-serif text-3xl font-semibold text-[#1C1C1E] mt-2">
                  {formatCurrency(kpis.totalIssued)}
                </p>
                <p className="text-xs text-[#52525B] mt-1">
                  Across {certificates.length} voucher{certificates.length === 1 ? '' : 's'}
                </p>
              </div>

              <div className="bg-white rounded-2xl p-5 border border-stone-200/80 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wider text-[#52525B]">Active Credit</span>
                  <Wallet className="w-4 h-4 text-emerald-600" />
                </div>
                <p className="font-serif text-3xl font-semibold text-[#1C1C1E] mt-2">
                  {formatCurrency(kpis.activeBalance)}
                </p>
                <p className="text-xs text-[#52525B] mt-1">
                  {kpis.activeCount} redeemable certificate{kpis.activeCount === 1 ? '' : 's'}
                </p>
              </div>

              <div className="bg-white rounded-2xl p-5 border border-stone-200/80 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wider text-[#52525B]">Redeemed Value</span>
                  <Camera className="w-4 h-4 text-sky-600" />
                </div>
                <p className="font-serif text-3xl font-semibold text-[#1C1C1E] mt-2">
                  {formatCurrency(kpis.redeemedValue)}
                </p>
                <p className="text-xs text-[#52525B] mt-1">{kpis.fullyRedeemedCount} fully redeemed</p>
              </div>

              <div className="bg-white rounded-2xl p-5 border border-stone-200/80 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wider text-[#52525B]">Expired / Void</span>
                  <Archive className="w-4 h-4 text-rose-500" />
                </div>
                <p className="font-serif text-3xl font-semibold text-[#1C1C1E] mt-2">{kpis.inactiveCount}</p>
                <p className="text-xs text-[#52525B] mt-1">
                  {formatCurrency(kpis.inactiveLiability)} unredeemed liability
                </p>
              </div>
            </div>

            {/* Filter Bar & Primary CTA */}
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-stone-200/80 shadow-xs flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
              <div className="flex flex-col sm:flex-row gap-3 flex-1">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-[#52525B] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search serial code, recipient, patron, or session..."
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-stone-200 bg-[#FAF9F6]/60 text-sm text-[#1C1C1E] placeholder:text-stone-400 focus:outline-none focus:border-[#C5A059] focus:bg-white transition-all"
                  />
                </div>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-4 py-2.5 rounded-xl border border-stone-200 bg-[#FAF9F6]/60 text-sm text-[#1C1C1E] focus:outline-none focus:border-[#C5A059] focus:bg-white transition-all"
                >
                  <option value="ALL">All Lifecycle States</option>
                  <option value="Active">Active</option>
                  <option value="Partially Redeemed">Partially Redeemed</option>
                  <option value="Redeemed">Redeemed</option>
                  <option value="Expired">Expired</option>
                  <option value="Voided">Voided</option>
                </select>
              </div>

              <button
                onClick={() => setActiveView('issue')}
                className="px-5 py-2.5 rounded-xl bg-[#1C1C1E] hover:bg-stone-800 text-[#FAF9F6] text-sm font-medium transition-all flex items-center justify-center gap-2 shadow-sm"
              >
                <Plus className="w-4 h-4 text-[#C5A059]" />
                <span>Create New Certificate</span>
              </button>
            </div>

            {/* Registry Table (Desktop) & Cards (Mobile) */}
            <div className="bg-white rounded-2xl border border-stone-200/80 shadow-xs overflow-hidden">
              {filteredCertificates.length === 0 ? (
                <div className="py-16 px-6 text-center">
                  <h3 className="font-serif text-xl font-semibold text-[#1C1C1E]">No matching gift certificates</h3>
                  <p className="text-sm text-[#52525B] mt-1 max-w-md mx-auto">
                    Try clearing your search filters or issue a new gift certificate for your client.
                  </p>
                </div>
              ) : (
                <>
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-stone-200/80 bg-[#F3F1EC]/60 text-[11px] font-semibold uppercase tracking-wider text-[#52525B]">
                          <th className="py-3.5 px-5">Certificate No.</th>
                          <th className="py-3.5 px-5">Presented To / From</th>
                          <th className="py-3.5 px-5">Session Package</th>
                          <th className="py-3.5 px-5">Remaining / Value</th>
                          <th className="py-3.5 px-5">Valid Through</th>
                          <th className="py-3.5 px-5">Lifecycle Status</th>
                          <th className="py-3.5 px-5 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-200/60 text-sm">
                        {filteredCertificates.map((cert) => {
                          const status = computeStatus(cert);
                          return (
                            <tr
                              key={cert.id}
                              onClick={() => setSelectedCertId(cert.id)}
                              className="hover:bg-[#F3F1EC]/60 cursor-pointer transition-colors"
                            >
                              <td className="py-4 px-5 font-mono text-xs font-semibold text-[#1C1C1E]">
                                {cert.code}
                              </td>
                              <td className="py-4 px-5">
                                <div className="font-medium text-[#1C1C1E]">{cert.recipientName}</div>
                                <div className="text-xs text-[#52525B]">From {cert.purchaserName}</div>
                              </td>
                              <td className="py-4 px-5 text-xs text-[#1C1C1E] max-w-xs truncate">
                                {cert.packageName}
                              </td>
                              <td className="py-4 px-5">
                                <div className="font-semibold text-[#1C1C1E]">
                                  {formatCurrency(cert.remainingBalance)}
                                </div>
                                <div className="text-[11px] text-[#52525B]">
                                  of {formatCurrency(cert.originalAmount)}
                                </div>
                              </td>
                              <td className="py-4 px-5 text-xs text-[#52525B]">
                                {formatDateReadable(cert.expirationDate)}
                              </td>
                              <td className="py-4 px-5">
                                <StatusBadge status={status} />
                              </td>
                              <td className="py-4 px-5 text-right">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedCertId(cert.id);
                                  }}
                                  className="px-3 py-1.5 rounded-lg border border-stone-200 bg-white hover:border-[#C5A059] text-xs font-medium text-[#1C1C1E] transition-colors"
                                >
                                  Manage
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Card List */}
                  <div className="md:hidden divide-y divide-stone-200/70">
                    {filteredCertificates.map((cert) => {
                      const status = computeStatus(cert);
                      return (
                        <div
                          key={cert.id}
                          onClick={() => setSelectedCertId(cert.id)}
                          className="p-4 space-y-2.5 hover:bg-[#F3F1EC]/50 cursor-pointer transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-xs font-semibold text-[#1C1C1E] bg-[#F3F1EC] px-2.5 py-1 rounded-md border border-stone-200/80">
                              {cert.code}
                            </span>
                            <StatusBadge status={status} />
                          </div>
                          <div>
                            <div className="font-serif text-lg font-semibold text-[#1C1C1E]">
                              {cert.recipientName}
                            </div>
                            <div className="text-xs text-[#52525B]">
                              Gifted by {cert.purchaserName} &bull; {cert.packageName}
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-xs pt-1 border-t border-stone-200/60">
                            <span className="text-[#52525B]">
                              Valid through {formatDateReadable(cert.expirationDate)}
                            </span>
                            <span className="font-semibold text-[#1C1C1E]">
                              {formatCurrency(cert.remainingBalance)}{' '}
                              <span className="font-normal text-[#52525B]">
                                / {formatCurrency(cert.originalAmount)}
                              </span>
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </section>
        )}

        {/* =================================================================
            VIEW 2: ISSUE GIFT CERTIFICATE & LIVE DESIGN STUDIO
        ================================================================= */}
        {activeView === 'issue' && (
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Column: Form */}
            <div className="lg:col-span-5 bg-white rounded-2xl p-6 sm:p-7 border border-stone-200/80 shadow-xs space-y-6">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#A8843E]">
                  New Issuance
                </span>
                <h2 className="font-serif text-2xl sm:text-3xl font-semibold text-[#1C1C1E] mt-1">
                  Compose Gift Certificate
                </h2>
                <p className="text-xs text-[#52525B] mt-1">
                  Configure session details and preview the bespoke certificate in real time.
                </p>
              </div>

              <form onSubmit={handleIssueSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-[#1C1C1E] mb-1.5">Certificate No.</label>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        required
                        value={formState.code}
                        onChange={(e) => setFormState({ ...formState, code: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-[#FAF9F6]/60 text-xs font-mono uppercase text-[#1C1C1E] focus:bg-white focus:outline-none focus:border-[#C5A059]"
                      />
                      <button
                        type="button"
                        onClick={() => setFormState({ ...formState, code: generateSerialCode() })}
                        title="Generate New Code"
                        className="px-2.5 py-2 rounded-xl border border-stone-200 hover:bg-[#F3F1EC] text-[#52525B] hover:text-[#1C1C1E] transition-colors"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[#1C1C1E] mb-1.5">Session Value (USD)</label>
                    <input
                      type="number"
                      min="25"
                      step="5"
                      required
                      value={formState.amount}
                      onChange={(e) => setFormState({ ...formState, amount: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-xl border border-stone-200 bg-[#FAF9F6]/60 text-sm text-[#1C1C1E] focus:bg-white focus:outline-none focus:border-[#C5A059]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#1C1C1E] mb-1.5">
                    Photography Session Package
                  </label>
                  <select
                    value={formState.packageName}
                    onChange={(e) => handlePackageSelect(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 bg-[#FAF9F6]/60 text-sm text-[#1C1C1E] focus:bg-white focus:outline-none focus:border-[#C5A059]"
                  >
                    {PACKAGE_PRESETS.map((pkg) => (
                      <option key={pkg.name} value={pkg.name}>
                        {pkg.price > 0 ? `${pkg.name} ($${pkg.price})` : pkg.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#1C1C1E] mb-1.5">
                    Session Inclusions Description
                  </label>
                  <textarea
                    rows={2}
                    value={formState.packageDescription}
                    onChange={(e) => setFormState({ ...formState, packageDescription: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl border border-stone-200 bg-[#FAF9F6]/60 text-xs text-[#1C1C1E] focus:bg-white focus:outline-none focus:border-[#C5A059]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-[#1C1C1E] mb-1.5">Presented To *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Clara & Julian Mercer"
                      value={formState.recipientName}
                      onChange={(e) => setFormState({ ...formState, recipientName: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-xl border border-stone-200 bg-[#FAF9F6]/60 text-sm text-[#1C1C1E] focus:bg-white focus:outline-none focus:border-[#C5A059]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#1C1C1E] mb-1.5">Recipient Email</label>
                    <input
                      type="email"
                      placeholder="client@example.com"
                      value={formState.recipientEmail}
                      onChange={(e) => setFormState({ ...formState, recipientEmail: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-xl border border-stone-200 bg-[#FAF9F6]/60 text-sm text-[#1C1C1E] focus:bg-white focus:outline-none focus:border-[#C5A059]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-[#1C1C1E] mb-1.5">
                      With Warmest Wishes From *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Eleanor Sterling"
                      value={formState.purchaserName}
                      onChange={(e) => setFormState({ ...formState, purchaserName: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-xl border border-stone-200 bg-[#FAF9F6]/60 text-sm text-[#1C1C1E] focus:bg-white focus:outline-none focus:border-[#C5A059]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#1C1C1E] mb-1.5">Patron Email</label>
                    <input
                      type="email"
                      placeholder="patron@example.com"
                      value={formState.purchaserEmail}
                      onChange={(e) => setFormState({ ...formState, purchaserEmail: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-xl border border-stone-200 bg-[#FAF9F6]/60 text-sm text-[#1C1C1E] focus:bg-white focus:outline-none focus:border-[#C5A059]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-[#1C1C1E] mb-1.5">
                      Authorized Photographer
                    </label>
                    <input
                      type="text"
                      value={formState.authorizedPhotographer}
                      onChange={(e) => setFormState({ ...formState, authorizedPhotographer: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-xl border border-stone-200 bg-[#FAF9F6]/60 text-sm text-[#1C1C1E] focus:bg-white focus:outline-none focus:border-[#C5A059]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#1C1C1E] mb-1.5">Optional Gift Note</label>
                    <input
                      type="text"
                      maxLength={120}
                      placeholder="e.g. Happy Anniversary!"
                      value={formState.personalMessage}
                      onChange={(e) => setFormState({ ...formState, personalMessage: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-xl border border-stone-200 bg-[#FAF9F6]/60 text-sm text-[#1C1C1E] focus:bg-white focus:outline-none focus:border-[#C5A059]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-[#1C1C1E] mb-1.5">Date Issued</label>
                    <input
                      type="date"
                      required
                      value={formState.issueDate}
                      onChange={(e) =>
                        setFormState({
                          ...formState,
                          issueDate: e.target.value,
                          expirationDate: addMonthsISO(e.target.value, 12)
                        })
                      }
                      className="w-full px-3.5 py-2 rounded-xl border border-stone-200 bg-[#FAF9F6]/60 text-sm text-[#1C1C1E] focus:bg-white focus:outline-none focus:border-[#C5A059]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#1C1C1E] mb-1.5">Valid Through</label>
                    <input
                      type="date"
                      required
                      value={formState.expirationDate}
                      onChange={(e) => setFormState({ ...formState, expirationDate: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-xl border border-stone-200 bg-[#FAF9F6]/60 text-sm text-[#1C1C1E] focus:bg-white focus:outline-none focus:border-[#C5A059]"
                    />
                  </div>
                </div>

                <div className="pt-2 flex flex-col sm:flex-row gap-3">
                  <button
                    type="submit"
                    className="flex-1 py-3 px-5 rounded-xl bg-[#1C1C1E] hover:bg-stone-800 text-[#FAF9F6] text-sm font-medium transition-all flex items-center justify-center gap-2 shadow-sm"
                  >
                    <CheckCircle2 className="w-4 h-4 text-[#C5A059]" />
                    <span>Issue &amp; Activate Certificate</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveView('registry')}
                    className="py-3 px-4 rounded-xl border border-stone-200 hover:bg-[#F3F1EC] text-[#52525B] text-sm font-medium transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>

            {/* Right Column: Live Certificate Proof */}
            <div className="lg:col-span-7 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs font-medium uppercase tracking-widest text-[#52525B]">
                  Live Certificate Proof
                </span>
                <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-stone-200/80">
                  {[
                    { id: 'ivory', label: 'Ivory & Gold' },
                    { id: 'noir', label: 'Darkroom Noir' },
                    { id: 'gallery', label: 'Minimalist Gallery' }
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setComposerTheme(t.id)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                        composerTheme === t.id
                          ? 'bg-[#1C1C1E] text-[#FAF9F6]'
                          : 'text-[#52525B] hover:text-[#1C1C1E]'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <GiftCertificateProof
                cert={{
                  ...formState,
                  recipientName: formState.recipientName || 'Clara & Julian Mercer',
                  purchaserName: formState.purchaserName || 'Eleanor Sterling',
                  originalAmount: Number(formState.amount) || 300,
                  remainingBalance: Number(formState.amount) || 300,
                  theme: composerTheme,
                  isVoided: false
                }}
              />
            </div>
          </section>
        )}

        {/* =================================================================
            VIEW 3: VITE + REACT & POSTGRESQL ARCHITECTURE
        ================================================================= */}
        {activeView === 'postgres' && (
          <section className="space-y-6">
            {/* Connection Configuration Card */}
            <div className="bg-white rounded-2xl p-6 border border-stone-200/80 shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-[#F4EDE0] flex items-center justify-center text-[#A8843E]">
                    <Server className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="font-serif text-2xl font-semibold text-[#1C1C1E]">
                      Vite + React &amp; PostgreSQL REST API Bridge
                    </h2>
                    <p className="text-xs text-[#52525B]">
                      Configured via <code className="font-mono bg-[#F3F1EC] px-1.5 py-0.5 rounded">VITE_API_URL</code> with local cache fallback.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${
                      pgConnected
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-amber-50 text-amber-800 border-amber-200'
                    }`}
                  >
                    {pgConnected ? <Check className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                    <span>
                      {pgChecking
                        ? 'Testing Connection...'
                        : pgConnected
                        ? 'Connected to PostgreSQL API'
                        : 'Offline / Local Cache Active'}
                    </span>
                  </span>
                </div>
              </div>

              <form onSubmit={handleSaveApiConfig} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                <div className="md:col-span-6">
                  <label className="block text-xs font-medium text-[#1C1C1E] mb-1.5">
                    Backend REST API Base URL
                  </label>
                  <input
                    type="text"
                    value={apiConfig.baseUrl}
                    onChange={(e) => setApiConfig({ ...apiConfig, baseUrl: e.target.value })}
                    placeholder="http://localhost:4000/api"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 bg-[#FAF9F6] text-xs font-mono text-[#1C1C1E] focus:bg-white focus:outline-none focus:border-[#C5A059]"
                  />
                </div>
                <div className="md:col-span-3">
                  <label className="block text-xs font-medium text-[#1C1C1E] mb-1.5">Persistence Mode</label>
                  <select
                    value={apiConfig.mode}
                    onChange={(e) => setApiConfig({ ...apiConfig, mode: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 bg-[#FAF9F6] text-xs text-[#1C1C1E] focus:bg-white focus:outline-none focus:border-[#C5A059]"
                  >
                    <option value="auto">Auto (PostgreSQL + Local Fallback)</option>
                    <option value="postgres">PostgreSQL API Only</option>
                    <option value="local">Local Browser Cache Only</option>
                  </select>
                </div>
                <div className="md:col-span-3">
                  <button
                    type="submit"
                    className="w-full py-2.5 px-4 rounded-xl bg-[#1C1C1E] hover:bg-stone-800 text-[#FAF9F6] text-xs font-medium transition-colors"
                  >
                    Save &amp; Test Connection
                  </button>
                </div>
              </form>

              {!pgConnected && pgLastError && (
                <div className="p-3.5 rounded-xl bg-[#F3F1EC]/80 border border-stone-200 text-xs text-[#52525B]">
                  <strong>Connection Note:</strong> Could not reach{' '}
                  <code className="font-mono text-[#1C1C1E]">{apiConfig.baseUrl}/certificates</code> ({pgLastError}).
                  Your changes are safely mirrored in local storage until your PostgreSQL server is running.
                </div>
              )}
            </div>

            {/* Vite + React Project Setup Card */}
            <div className="bg-white rounded-2xl border border-stone-200/80 shadow-xs overflow-hidden flex flex-col">
              <div className="px-5 py-3.5 bg-[#F3F1EC]/70 border-b border-stone-200/80 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#A8843E]" />
                  <span className="text-xs font-semibold text-[#1C1C1E]">
                    Vite + React Project Structure (vite.config.js, .env, src/main.jsx)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    copyTextToClipboard(VITE_PROJECT_FILES_SNIPPET, 'Vite project setup copied.');
                    setCopiedCodeBlock('vite');
                    setTimeout(() => setCopiedCodeBlock(''), 2000);
                  }}
                  className="px-2.5 py-1 rounded-lg border border-stone-200 bg-white hover:bg-[#FAF9F6] text-[11px] font-medium text-[#1C1C1E] flex items-center gap-1"
                >
                  {copiedCodeBlock === 'vite' ? (
                    <Check className="w-3 h-3 text-emerald-600" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  <span>{copiedCodeBlock === 'vite' ? 'Copied' : 'Copy Vite Setup'}</span>
                </button>
              </div>
              <pre className="p-4 text-[11px] font-mono text-stone-800 bg-[#FAF9F6] overflow-x-auto leading-relaxed max-h-[300px]">
                {VITE_PROJECT_FILES_SNIPPET}
              </pre>
            </div>

            {/* Two-Column SQL Schema & Express Server Code */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* PostgreSQL DDL Schema */}
              <div className="bg-white rounded-2xl border border-stone-200/80 shadow-xs overflow-hidden flex flex-col">
                <div className="px-5 py-3.5 bg-[#F3F1EC]/70 border-b border-stone-200/80 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-[#A8843E]" />
                    <span className="text-xs font-semibold text-[#1C1C1E]">schema.sql (PostgreSQL 15+)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      copyTextToClipboard(POSTGRES_SCHEMA_SQL, 'PostgreSQL schema copied.');
                      setCopiedCodeBlock('sql');
                      setTimeout(() => setCopiedCodeBlock(''), 2000);
                    }}
                    className="px-2.5 py-1 rounded-lg border border-stone-200 bg-white hover:bg-[#FAF9F6] text-[11px] font-medium text-[#1C1C1E] flex items-center gap-1"
                  >
                    {copiedCodeBlock === 'sql' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedCodeBlock === 'sql' ? 'Copied' : 'Copy SQL'}</span>
                  </button>
                </div>
                <pre className="p-4 text-[11px] font-mono text-stone-800 bg-[#FAF9F6] overflow-x-auto leading-relaxed flex-1 max-h-[420px]">
                  {POSTGRES_SCHEMA_SQL}
                </pre>
              </div>

              {/* Express + node-postgres Server */}
              <div className="bg-white rounded-2xl border border-stone-200/80 shadow-xs overflow-hidden flex flex-col">
                <div className="px-5 py-3.5 bg-[#F3F1EC]/70 border-b border-stone-200/80 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-[#A8843E]" />
                    <span className="text-xs font-semibold text-[#1C1C1E]">server.js (Node.js + Express + pg)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      copyTextToClipboard(EXPRESS_BACKEND_SNIPPET, 'Express API server code copied.');
                      setCopiedCodeBlock('js');
                      setTimeout(() => setCopiedCodeBlock(''), 2000);
                    }}
                    className="px-2.5 py-1 rounded-lg border border-stone-200 bg-white hover:bg-[#FAF9F6] text-[11px] font-medium text-[#1C1C1E] flex items-center gap-1"
                  >
                    {copiedCodeBlock === 'js' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedCodeBlock === 'js' ? 'Copied' : 'Copy Server'}</span>
                  </button>
                </div>
                <pre className="p-4 text-[11px] font-mono text-stone-800 bg-[#FAF9F6] overflow-x-auto leading-relaxed flex-1 max-h-[420px]">
                  {EXPRESS_BACKEND_SNIPPET}
                </pre>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* =====================================================================
          SLIDE-OVER DRAWER: CERTIFICATE LIFECYCLE & REDEMPTION MANAGER
      ===================================================================== */}
      {selectedCert && (
        <div className="fixed inset-0 z-40" aria-modal="true" role="dialog">
          <div
            onClick={() => setSelectedCertId(null)}
            className="fixed inset-0 bg-[#1C1C1E]/50 backdrop-blur-xs transition-opacity"
          />

          <div className="fixed inset-y-0 right-0 max-w-2xl w-full bg-[#FAF9F6] shadow-2xl border-l border-stone-200 flex flex-col overflow-hidden">
            {/* Drawer Header */}
            <div className="px-6 py-4 bg-white border-b border-stone-200 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded-lg bg-[#F3F1EC] text-[#1C1C1E] border border-stone-200">
                  {selectedCert.code}
                </span>
                <StatusBadge status={computeStatus(selectedCert)} />
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyVoucherDetails}
                  className="px-3 py-1.5 rounded-xl border border-stone-200 hover:bg-[#F3F1EC] text-xs font-medium text-[#1C1C1E] flex items-center gap-1.5 transition-colors"
                >
                  <Copy className="w-3.5 h-3.5 text-[#C5A059]" />
                  <span>Copy</span>
                </button>
                <button
                  onClick={handlePrintCertificate}
                  className="px-3 py-1.5 rounded-xl bg-[#1C1C1E] hover:bg-stone-800 text-[#FAF9F6] text-xs font-medium flex items-center gap-1.5 transition-colors"
                >
                  <Printer className="w-3.5 h-3.5 text-[#C5A059]" />
                  <span>Print / PDF</span>
                </button>
                <button
                  onClick={() => setSelectedCertId(null)}
                  className="p-1.5 rounded-xl text-[#52525B] hover:text-[#1C1C1E] hover:bg-[#F3F1EC] transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Drawer Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <GiftCertificateProof cert={selectedCert} />

              {/* Financial Strip */}
              <div className="grid grid-cols-3 gap-3 bg-white p-4 rounded-2xl border border-stone-200/80">
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-[#52525B] block">Original Value</span>
                  <span className="font-serif text-xl font-semibold text-[#1C1C1E]">
                    {formatCurrency(selectedCert.originalAmount)}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-[#52525B] block">Redeemed</span>
                  <span className="font-serif text-xl font-semibold text-sky-700">
                    {formatCurrency(
                      Math.max(0, (Number(selectedCert.originalAmount) || 0) - (Number(selectedCert.remainingBalance) || 0))
                    )}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-[#52525B] block">Remaining Credit</span>
                  <span className="font-serif text-xl font-semibold text-emerald-700">
                    {formatCurrency(selectedCert.remainingBalance)}
                  </span>
                </div>
              </div>

              {/* Lifecycle Controls */}
              {(() => {
                const status = computeStatus(selectedCert);
                const canRedeem = status === 'Active' || status === 'Partially Redeemed';
                return (
                  <div className="space-y-4">
                    <div
                      className={`bg-white p-5 rounded-2xl border border-stone-200/80 space-y-3 ${
                        !canRedeem ? 'opacity-50 pointer-events-none' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <h4 className="font-serif text-lg font-semibold text-[#1C1C1E] flex items-center gap-2">
                          <CreditCard className="w-4 h-4 text-[#C5A059]" />
                          <span>Record Session Redemption</span>
                        </h4>
                        <button
                          type="button"
                          onClick={() => setRedeemAmount(String(selectedCert.remainingBalance || 0))}
                          className="text-xs font-medium text-[#A8843E] hover:underline"
                        >
                          Use Full Balance
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[11px] font-medium text-[#52525B] mb-1">Amount ($)</label>
                          <input
                            type="number"
                            min="1"
                            step="0.01"
                            value={redeemAmount}
                            onChange={(e) => setRedeemAmount(e.target.value)}
                            placeholder="0.00"
                            className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-[#FAF9F6] text-sm text-[#1C1C1E] focus:bg-white focus:outline-none focus:border-[#C5A059]"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-medium text-[#52525B] mb-1">
                            Session / Booking Reference
                          </label>
                          <input
                            type="text"
                            value={redeemNote}
                            onChange={(e) => setRedeemNote(e.target.value)}
                            placeholder="e.g. Autumn Portrait Session at Webb Mountain"
                            className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-[#FAF9F6] text-sm text-[#1C1C1E] focus:bg-white focus:outline-none focus:border-[#C5A059]"
                          />
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleApplyRedemption}
                        className="w-full py-2.5 px-4 rounded-xl bg-[#C5A059] hover:bg-[#A8843E] text-white text-xs font-semibold tracking-wide uppercase transition-colors"
                      >
                        Apply Redemption
                      </button>
                    </div>

                    {/* Extend Expiration & Void / Reactivate */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="bg-white p-4 rounded-2xl border border-stone-200/80 space-y-2.5">
                        <h5 className="text-xs font-semibold uppercase tracking-wider text-[#1C1C1E] flex items-center gap-1.5">
                          <CalendarPlus className="w-3.5 h-3.5 text-[#C5A059]" />
                          <span>Extend Expiration</span>
                        </h5>
                        <div className="flex gap-2">
                          <input
                            type="date"
                            value={extendDate}
                            onChange={(e) => setExtendDate(e.target.value)}
                            className="flex-1 px-3 py-1.5 rounded-xl border border-stone-200 bg-[#FAF9F6] text-xs text-[#1C1C1E] focus:bg-white focus:outline-none focus:border-[#C5A059]"
                          />
                          <button
                            type="button"
                            onClick={handleUpdateExpiration}
                            className="px-3 py-1.5 rounded-xl border border-stone-200 hover:bg-[#F3F1EC] text-xs font-medium text-[#1C1C1E] transition-colors"
                          >
                            Save
                          </button>
                        </div>
                      </div>

                      <div className="bg-white p-4 rounded-2xl border border-stone-200/80 space-y-2.5">
                        <h5 className="text-xs font-semibold uppercase tracking-wider text-[#1C1C1E] flex items-center gap-1.5">
                          <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
                          <span>Administrative Status</span>
                        </h5>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={voidReason}
                            onChange={(e) => setVoidReason(e.target.value)}
                            placeholder="Reason (optional)"
                            className="flex-1 px-3 py-1.5 rounded-xl border border-stone-200 bg-[#FAF9F6] text-xs text-[#1C1C1E] focus:bg-white focus:outline-none focus:border-[#C5A059]"
                          />
                          {status === 'Voided' ? (
                            <button
                              type="button"
                              onClick={() => handleToggleVoid(false)}
                              className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-medium transition-colors"
                            >
                              Reactivate
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleToggleVoid(true)}
                              className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-medium transition-colors"
                            >
                              Void
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Audit Trail */}
              <div className="bg-white p-5 rounded-2xl border border-stone-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-serif text-lg font-semibold text-[#1C1C1E]">Lifecycle Audit Trail</h4>
                  <span className="text-xs text-[#52525B]">
                    {(selectedCert.auditHistory || []).length} entr
                    {(selectedCert.auditHistory || []).length === 1 ? 'y' : 'ies'}
                  </span>
                </div>
                <div className="space-y-3 pt-1">
                  {(selectedCert.auditHistory || [])
                    .slice()
                    .reverse()
                    .map((item, idx) => (
                      <div
                        key={idx}
                        className="flex items-start justify-between gap-3 p-3 rounded-xl bg-[#F3F1EC]/70 border border-stone-200/70 text-xs"
                      >
                        <div>
                          <span className="font-semibold text-[#1C1C1E]">{item.action}</span>
                          <p className="text-[#52525B] mt-0.5">{item.note}</p>
                        </div>
                        <div className="text-right shrink-0">
                          {item.amount > 0 && (
                            <span className="font-semibold text-[#1C1C1E] block">
                              {formatCurrency(item.amount)}
                            </span>
                          )}
                          <span className="text-[11px] text-[#52525B]">
                            {new Date(item.timestamp).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Studio Settings Modal */}
      {showStudioModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1C1C1E]/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 border border-stone-200 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-serif text-xl font-semibold text-[#1C1C1E]">Studio Identity Settings</h3>
              <button
                onClick={() => setShowStudioModal(false)}
                className="p-1.5 rounded-xl text-[#52525B] hover:text-[#1C1C1E] hover:bg-[#F3F1EC]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-[#52525B] mb-1.5">
                Photography Studio Name
              </label>
              <input
                type="text"
                value={studioNameDraft}
                onChange={(e) => setStudioNameDraft(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 bg-[#FAF9F6] text-sm text-[#1C1C1E] focus:bg-white focus:outline-none focus:border-[#C5A059]"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowStudioModal(false)}
                className="px-4 py-2 rounded-xl border border-stone-200 text-xs font-medium text-[#52525B] hover:text-[#1C1C1E]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const trimmed = studioNameDraft.trim();
                  if (!trimmed) return;
                  setStudioName(trimmed);
                  localStorage.setItem(STUDIO_NAME_KEY, trimmed);
                  setShowStudioModal(false);
                  notify('Studio name updated.');
                }}
                className="px-4 py-2 rounded-xl bg-[#1C1C1E] text-[#FAF9F6] text-xs font-medium hover:bg-stone-800"
              >
                Save Studio Name
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Demo Data Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1C1C1E]/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 border border-stone-200 shadow-xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#F4EDE0] flex items-center justify-center text-[#A8843E]">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-serif text-xl font-semibold text-[#1C1C1E]">Restore Studio Demo Data?</h3>
                <p className="text-xs text-[#52525B]">This will replace local cached records with sample certificates.</p>
              </div>
            </div>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                onClick={() => setShowResetModal(false)}
                className="px-4 py-2 rounded-xl border border-stone-200 text-xs font-medium text-[#52525B] hover:text-[#1C1C1E]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  persistLocalMirror(getSeedCertificates());
                  setShowResetModal(false);
                  notify('Studio demo records restored.');
                }}
                className="px-4 py-2 rounded-xl bg-[#1C1C1E] text-[#FAF9F6] text-xs font-medium hover:bg-stone-800"
              >
                Reset Ledger
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const express = require("express");
const cors    = require("cors");
const { Pool } = require("pg");
const path    = require("path");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// ── Serve the HTML frontend from  ./public/index.html ──────────────
app.use((req, res, next) => {
  console.log("➡️ REQUEST:", req.method, req.url);
  next();
});
app.use(express.static(path.join(__dirname, "public")));

// ── Database connection ─────────────────────────────────────────────
const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl:      { rejectUnauthorized: false }
});

async function ensureSalesStatusColumns() {
  try {
    await pool.query(`
      ALTER TABLE bikes ADD COLUMN IF NOT EXISTS new_status VARCHAR(50);
      ALTER TABLE batteries ADD COLUMN IF NOT EXISTS new_status VARCHAR(50);
      ALTER TABLE chargers ADD COLUMN IF NOT EXISTS new_status VARCHAR(50);
    `);
    console.log("✅ Sales status columns ready");
  } catch (err) {
    console.error("❌ Sales status migration failed:", err.message);
  }
}

// // ── Auto-create tables on startup ───────────────────────────────────
// async function initSchema() {
//   try {
//     await pool.query(`
//       CREATE TABLE IF NOT EXISTS bikes (
//         id              SERIAL PRIMARY KEY,
//         date_in         DATE,
//         bike_type       VARCHAR(50),
//         chassis_no      VARCHAR(100) UNIQUE NOT NULL,
//         number_plate    VARCHAR(50),
//         status          VARCHAR(50)  DEFAULT 'Unassembled',
//         dispatch_status VARCHAR(50),
//         sold_type       VARCHAR(50),
//         finance_company VARCHAR(100),
//         lease_type      VARCHAR(50),
//         client          VARCHAR(200),
//         office_location VARCHAR(100),
//         office_purpose  VARCHAR(100),
//         technician      VARCHAR(200),
//         date_assembled  DATE,
//         assembly_notes  TEXT,
//         date_dispatched DATE,
//         return_reason   VARCHAR(100),
//         created_at      TIMESTAMP DEFAULT NOW(),
//         updated_at      TIMESTAMP DEFAULT NOW()
//       );

//       CREATE TABLE IF NOT EXISTS batteries (
//         id                SERIAL PRIMARY KEY,
//         battery_type      VARCHAR(50),
//         battery_number    VARCHAR(100) UNIQUE NOT NULL,
//         status            VARCHAR(50) DEFAULT 'New',
//         assessment_statusVARCHAR(50),
//         return_reason     VARCHAR(100),
//         date_in           DATE,
//         date_dispatched   DATE,
//         client            VARCHAR(200),
//         dispatch_status   VARCHAR(50),
//         created_at        TIMESTAMP DEFAULT NOW(),
//         updated_at        TIMESTAMP DEFAULT NOW()
//       );

//       CREATE TABLE IF NOT EXISTS chargers (
//         id                SERIAL PRIMARY KEY,
//         charger_type      VARCHAR(50),
//         charger_number    VARCHAR(100) UNIQUE NOT NULL,
//         status            VARCHAR(50) DEFAULT 'New',
//         inspection_status VARCHAR(50),
//         return_reason     VARCHAR(100),
//         date_in           DATE,
//         date_dispatched   DATE,
//         client            VARCHAR(200),
//         dispatch_status   VARCHAR(50),
//         created_at        TIMESTAMP DEFAULT NOW(),
//         updated_at        TIMESTAMP DEFAULT NOW()
//       );
//     `);
//     console.log("✅  Schema ready (tables exist or were created)");
//   } catch (err) {
//     console.error("❌  Schema init failed:"); console.error(err);
//   }
// }

// ══════════════════════════════════════════════════════════════════
//  HEALTH CHECK  — this is what the frontend polls to detect DB
// ══════════════════════════════════════════════════════════════════
app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "OK", db: "connected", time: new Date() });
  } catch (err) {
    // Return 200 so the server itself is reachable, but flag DB issue
    res.status(503).json({ status: "error", db: err.message });
  }
});

// Credentials stay on the server and are loaded from .env.
app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body || {};
  const users = [
    {
      username: process.env.ADMIN_USERNAME,
      password: process.env.ADMIN_PASSWORD,
      name: process.env.ADMIN_NAME || "Admin User",
      role: "Admin"
    },
    {
      username: process.env.STAFF_USERNAME,
      password: process.env.STAFF_PASSWORD,
      name: process.env.STAFF_NAME || "Inventory Staff",
      role: "Staff"
    }
  ];
  const user = users.find(account =>
    account.username && account.password &&
    account.username === username && account.password === password
  );
  if (!user) return res.status(401).json({ error: "Invalid username or password" });
  res.json({ username: user.username, name: user.name, role: user.role });
});

// ══════════════════════════════════════════════════════════════════
//  BIKES
// ══════════════════════════════════════════════════════════════════
app.get("/api/bikes", async (req, res) => {
  try {
    const r = await pool.query(
      "SELECT * FROM bikes ORDER BY COALESCE(date_in, created_at::date) DESC, created_at DESC"
    );
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/bikes", async (req, res) => {
  const b = req.body;
  try {
    const r = await pool.query(
      `INSERT INTO bikes
         (date_in, bike_type, new_stock, new_status, chassis_no, number_plate, status, dispatch_status,
          sold_type, finance_company, lease_type, client, office_location, office_purpose,
          technician, date_assembled, assembly_notes, date_dispatched, return_reason,country,town,requested_by_team,requested_by_person)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
       ON CONFLICT (chassis_no) DO UPDATE SET
         status        = EXCLUDED.status,
         new_status    = EXCLUDED.new_status,
         date_in       = EXCLUDED.date_in,
         number_plate  = EXCLUDED.number_plate,
         return_reason = EXCLUDED.return_reason,
         updated_at    = NOW()
       RETURNING *`,
      [
        b.date_in        || null,
        b.bike_type,
        b.new_stock      || 0,
        b.new_status     || "",
        b.chassis_no,
        b.number_plate   || "",
        b.status         || "Unassembled",
        b.dispatch_status|| "",
        b.sold_type      || "",
        b.finance_company|| "",
        b.lease_type     || "",
        b.client         || "",
        b.office_location|| "",
        b.office_purpose || "",
        b.technician     || "",
        b.date_assembled || null,
        b.assembly_notes || "",
        b.date_dispatched|| null,
        b.return_reason  || "",
        b.country        || "",
        b.town           || "",
        b.requested_by_team   || "",
        b.requested_by_person || ""
      ]
    );
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put("/api/bikes/:chassis", async (req, res) => {
  const b = req.body;
  const chassis = req.params.chassis;

  console.log("\n==============================");
  console.log("🔧 BIKE UPDATE REQUEST");
  console.log("Chassis:", chassis);
  console.log("Payload:", JSON.stringify(b, null, 2));
  console.log("==============================\n");
  try {
    const r = await pool.query(
      `UPDATE bikes SET
         status          = $1,
         new_status      = $2,
         dispatch_status = $3,
         sold_type       = $4,
         finance_company = $5,
         lease_type      = $6,
         client          = $7,
         office_location = $8,
         office_purpose  = $9,
         technician      = $10,
         date_assembled  = $11,
         assembly_notes  = $12,
         date_dispatched = $13,
         return_reason   = $14,
         number_plate    = $15,
         country         = $16,
         town            = $17,
         requested_by_team   = $18,
         requested_by_person = $19,
         new_stock           = $20,
         updated_at      = NOW()
       WHERE chassis_no = $21
       RETURNING *`,
      [
        b.status,
        b.new_status     || "",
        b.dispatch_status|| "",
        b.sold_type      || "",
        b.finance_company|| "",
        b.lease_type     || "",
        b.client         || "",
        b.office_location|| "",
        b.office_purpose || "",
        b.technician     || "",
        b.date_assembled || null,
        b.assembly_notes || "",
        b.date_dispatched|| null,
        b.return_reason  || "",
        b.number_plate   || "",
        b.country        || "",
        b.town           || "",
        b.requested_by_team   || "",
        b.requested_by_person || "",
        b.new_stock           || 0,
        req.params.chassis
      ]
    );
    console.log("📦 Rows affected:", r.rowCount);
    if (!r.rows.length) {console.log("❌ No bike found with chassis:", chassis);
        return res.status(404).json({ error: "Bike not found" });
    }
    console.log("✅ Updated bike:", r.rows[0]);
    res.json(r.rows[0]);
  } catch (err) {
    console.error("❌ DB ERROR:", err.message);
     res.status(500).json({ error: err.message }); 
    }
});

// ══════════════════════════════════════════════════════════════════
//  BATTERIES
// ══════════════════════════════════════════════════════════════════
app.get("/api/batteries", async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM batteries ORDER BY date_in DESC, created_at DESC");
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/batteries", async (req, res) => {
  const b = req.body;
  try {
    const r = await pool.query(
      `INSERT INTO batteries
         (battery_type, battery_number, status, new_status, assessment_status, return_reason, date_in, date_dispatched, client, dispatch_status, office_location, office_purpose, finance_company, sold_type, country, town, requested_by_team, requested_by_person)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       ON CONFLICT (battery_number) DO UPDATE SET
         status            = EXCLUDED.status,
         new_status        = EXCLUDED.new_status,
         date_in           = EXCLUDED.date_in,
         assessment_status = EXCLUDED.assessment_status,
         return_reason     = EXCLUDED.return_reason,
         battery_option    = EXCLUDED.battery_option,
         updated_at        = NOW()
       RETURNING *`,
      [b.battery_type, b.battery_number, b.status||"New", b.new_status||"",
       b.assessment_status||"", b.return_reason||"", b.date_in||null, b.date_dispatched||null, b.client||"", b.dispatch_status||"", b.office_location||"", b.office_purpose||"", b.finance_company||"", b.sold_type||"", b.country||"", b.town||"", b.requested_by_team||"", b.requested_by_person||""]
    );
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put("/api/batteries/:number", async (req, res) => {
  const b = req.body;
  try {
    const r = await pool.query(
      `UPDATE batteries SET
         status            = $1,
         new_status        = $2,
         dispatch_status   = $3,
         client            = $4,
         date_dispatched   = $5,
         assessment_status = $6,
         return_reason     = $7,
         battery_option    = $8,
         office_location   = $9,
         office_purpose    = $10,
         finance_company   = $11,
         sold_type         = $12,
         country           = $13,
         town              = $14,
         requested_by_team = $15,
         requested_by_person = $16,
         updated_at        = NOW()
      WHERE battery_number = $17
       RETURNING *`,
      [b.status, b.new_status||"", b.dispatch_status||"", b.client||"",
       b.date_dispatched||null, b.assessment_status||"",
       b.return_reason||"", b.battery_option||"", b.office_location||"", b.office_purpose||"", b.finance_company||"", b.sold_type||"", b.country||"", b.town||"", b.requested_by_team||"", b.requested_by_person||"", req.params.number]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Battery not found" });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ══════════════════════════════════════════════════════════════════
//  CHARGERS
// ══════════════════════════════════════════════════════════════════
app.get("/api/chargers", async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM chargers ORDER BY date_in DESC, created_at DESC");
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/chargers", async (req, res) => {
  const c = req.body;
  try {
    const r = await pool.query(
      `INSERT INTO chargers
         (charger_type, charger_number, status, new_status, inspection_status, return_reason, date_in,date_dispatched, client, dispatch_status, office_location, office_purpose, finance_company, sold_type, country, town, requested_by_team, requested_by_person)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       ON CONFLICT (charger_number) DO UPDATE SET
         status            = EXCLUDED.status,
         new_status        = EXCLUDED.new_status,
         date_in           = EXCLUDED.date_in,
         inspection_status = EXCLUDED.inspection_status,
         return_reason     = EXCLUDED.return_reason,
         updated_at        = NOW()
       RETURNING *`,
      [c.charger_type, c.charger_number, c.status||"New", c.new_status||"",
       c.inspection_status||"", c.return_reason||"", c.date_in||null, c.date_dispatched||null, c.client||"", c.dispatch_status||"", c.office_location||"", c.office_purpose||"", c.finance_company||"", c.sold_type||"", c.country||"", c.town||"", c.requested_by_team||"", c.requested_by_person||""]
    );
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put("/api/chargers/:number", async (req, res) => {
  const c = req.body;
  try {
    const r = await pool.query(
      `UPDATE chargers SET
         status            = $1,
         new_status        = $2,
         dispatch_status   = $3,
         client            = $4,
         date_dispatched   = $5,
         inspection_status = $6,
         return_reason     = $7,
         office_location   = $8,
         office_purpose    = $9,
         finance_company   = $10,
         country           = $11,
         town              = $12,
         requested_by_team = $13,
         requested_by_person = $14,
         sold_type         = $15,
         updated_at        = NOW()
      WHERE charger_number = $16
       RETURNING *`,
      [c.status, c.new_status||"", c.dispatch_status||"", c.client||"",
       c.date_dispatched||null, c.inspection_status||"",
      c.return_reason||"", c.office_location||"", c.office_purpose||"", c.finance_company||"", c.country||"", c.town||"", c.requested_by_team||"", c.requested_by_person||"", c.sold_type||"", req.params.number]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Charger not found" });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Catch-all: send the frontend for any unmatched route ────────────
app.get("/ip.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ── Start ────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
  console.log(`🚀  eWAKA Track running → http://localhost:${PORT}`);
  await ensureSalesStatusColumns();
});

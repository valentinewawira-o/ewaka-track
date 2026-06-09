
const express = require("express");
const cors    = require("cors");
const { Pool } = require("pg");
const path    = require("path");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// ── Serve the HTML frontend from  ./public/index.html ──────────────
app.use(express.static(path.join(__dirname, "public")));
app.use((req, res, next) => {
  console.log("➡️ REQUEST:", req.method, req.url);
  next();
});

// ── Database connection ─────────────────────────────────────────────
const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl:      { rejectUnauthorized: false }
});

// ── Auto-create tables on startup ───────────────────────────────────
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

//       // CREATE TABLE IF NOT EXISTS batteries (
//       //   id                SERIAL PRIMARY KEY,
//       //   battery_type      VARCHAR(50),
//       //   battery_number    VARCHAR(100) UNIQUE NOT NULL,
//       //   status            VARCHAR(50) DEFAULT 'New',
//       //   assessment_statusVARCHAR(50),
//       //   return_reason     VARCHAR(100),
//       //   date_in           DATE,
//       //   battery_option    VARCHAR(50),
//       //   date_dispatched   DATE,
//       //   client            VARCHAR(200),
//       //   dispatch_status   VARCHAR(50),
//       //   created_at        TIMESTAMP DEFAULT NOW(),
//       //   updated_at        TIMESTAMP DEFAULT NOW()
//       // );

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
         (date_in, bike_type, chassis_no, number_plate, status, dispatch_status,
          sold_type, finance_company, lease_type, client, office_location, office_purpose,
          technician, date_assembled, assembly_notes, date_dispatched, return_reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       ON CONFLICT (chassis_no) DO UPDATE SET
         status        = EXCLUDED.status,
         date_in       = EXCLUDED.date_in,
         number_plate  = EXCLUDED.number_plate,
         return_reason = EXCLUDED.return_reason,
         updated_at    = NOW()
       RETURNING *`,
      [
        b.date_in        || null,
        b.bike_type,
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
        b.return_reason  || ""
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
         dispatch_status = $2,
         sold_type       = $3,
         finance_company = $4,
         lease_type      = $5,
         client          = $6,
         office_location = $7,
         office_purpose  = $8,
         technician      = $9,
         date_assembled  = $10,
         assembly_notes  = $11,
         date_dispatched = $12,
         return_reason   = $13,
         number_plate    = $14,
         updated_at      = NOW()
       WHERE chassis_no = $15
       RETURNING *`,
      [
        b.status,
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
         (battery_type, battery_number, status, assessment_status, return_reason, date_in, battery_option)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (battery_number) DO UPDATE SET
         status            = EXCLUDED.status,
         date_in           = EXCLUDED.date_in,
         assessment_status = EXCLUDED.assessment_status,
         return_reason     = EXCLUDED.return_reason,
         battery_option    = EXCLUDED.battery_option,
         updated_at        = NOW()
       RETURNING *`,
      [b.battery_type, b.battery_number, b.status||"New",
       b.assessment_status||"", b.return_reason||"", b.date_in||null, b.battery_option||""]
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
         dispatch_status   = $2,
         client            = $3,
         date_dispatched   = $4,
         assessment_status = $5,
         return_reason     = $6,
         updated_at        = NOW()
       WHERE battery_number = $7
       RETURNING *`,
      [b.status, b.dispatch_status||"", b.client||"",
       b.date_dispatched||null, b.assessment_status||"",
       b.return_reason||"", req.params.number]
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
         (charger_type, charger_number, status, inspection_status, return_reason, date_in)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (charger_number) DO UPDATE SET
         status            = EXCLUDED.status,
         date_in           = EXCLUDED.date_in,
         inspection_status = EXCLUDED.inspection_status,
         return_reason     = EXCLUDED.return_reason,
         updated_at        = NOW()
       RETURNING *`,
      [c.charger_type, c.charger_number, c.status||"New",
       c.inspection_status||"", c.return_reason||"", c.date_in||null]
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
         dispatch_status   = $2,
         client            = $3,
         date_dispatched   = $4,
         inspection_status = $5,
         return_reason     = $6,
         updated_at        = NOW()
       WHERE charger_number = $7
       RETURNING *`,
      [c.status, c.dispatch_status||"", c.client||"",
       c.date_dispatched||null, c.inspection_status||"",
       c.return_reason||"", req.params.number]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Charger not found" });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Catch-all: send the frontend for any unmatched route ────────────
app.get("/ip.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "ip.html"));
});

// ── Start ────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🚀  eWAKA Track running → http://localhost:${PORT}`);
  await initSchema();
});

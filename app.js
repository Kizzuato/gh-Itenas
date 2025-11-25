const express = require("express");
const cors = require("cors");
const db = require("./db");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// ===============================
//  Realtime aggregation config
// ===============================
const REALTIME_WINDOW_MS = 15 * 60 * 1000;

function nowGmt7String() {
  const now = new Date();
  const utcMs = now.getTime();
  const gmt7Ms = utcMs + 7 * 60 * 60 * 1000;
  const gmt7 = new Date(gmt7Ms);
  return gmt7.toISOString().slice(0, 19).replace("T", " ");
}

function toGmt7Ms(dateLike) {
  const d = new Date(dateLike);
  const utcMs = d.getTime();
  return utcMs + 7 * 60 * 60 * 1000;
}

function isNumber(value) {
  return value !== undefined && value !== "" && !isNaN(value);
}

function asyncHandler(fn) {
  return function (req, res) {
    Promise.resolve(fn(req, res)).catch((err) => {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    });
  };
}

// ===============================
//  ROUTES
// ===============================

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

app.post(
  "/api/sensor/:greenhouse_id",
  asyncHandler(async (req, res) => {
    const greenhouse_id = req.params.greenhouse_id;
    const { dht_temp, dht_hum, turbidity, water_temp } = req.body;

    if (!isNumber(greenhouse_id)) return res.status(400).json({ error: "Invalid ID" });

    const sql = `
      INSERT INTO historical_data 
      (greenhouse_id, dht_temp, dht_hum, turbidity, water_temp)
      VALUES (?, ?, ?, ?, ?)
    `;

    db.query(sql, [greenhouse_id, dht_temp, dht_hum, turbidity, water_temp], (err, result) => {
      if (err) return res.status(500).json({ error: "DB Error" });
      res.json({ success: true, inserted_id: result.insertId });
    });
  })
);

app.post(
  "/api/realtime/:greenhouse_id",
  asyncHandler(async (req, res) => {
    const greenhouse_id = req.params.greenhouse_id;
    const { dht_temp, dht_hum, turbidity, water_temp } = req.body;
    const ts = nowGmt7String();

    if (!isNumber(greenhouse_id)) return res.status(400).json({ error: "Invalid ID" });

    const insertSql = `
      INSERT INTO realtime_data
      (greenhouse_id, dht_temp, dht_hum, turbidity, water_temp, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    await new Promise((resolve, reject) => {
      db.query(insertSql, [greenhouse_id, dht_temp, dht_hum, turbidity, water_temp, ts], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Check Window
    const windowSql = `SELECT MIN(created_at) AS startedAt FROM realtime_data WHERE greenhouse_id = ?`;
    const startedRow = await new Promise((resolve, reject) => {
      db.query(windowSql, [greenhouse_id], (err, rows) => {
        if (err) reject(err);
        else resolve(rows[0]);
      });
    });

    if (!startedRow || !startedRow.startedAt) return res.json({ success: true, aggregated: false });

    const diff = toGmt7Ms(new Date()) - toGmt7Ms(startedRow.startedAt);

    if (diff < REALTIME_WINDOW_MS) return res.json({ success: true, aggregated: false });

    // Aggregate
    const aggSql = `
      SELECT AVG(dht_temp) as avgTemp, AVG(dht_hum) as avgHum, 
             AVG(turbidity) as avgTurb, AVG(water_temp) as avgWater
      FROM realtime_data WHERE greenhouse_id = ?
    `;
    const aggRow = await new Promise((resolve, reject) => {
      db.query(aggSql, [greenhouse_id], (err, rows) => {
        if (err) reject(err);
        else resolve(rows[0]);
      });
    });

    if (aggRow) {
      const insertHist = `INSERT INTO historical_data (greenhouse_id, dht_temp, dht_hum, turbidity, water_temp) VALUES (?,?,?,?,?)`;
      await new Promise((resolve, reject) => {
        db.query(insertHist, [greenhouse_id, aggRow.avgTemp, aggRow.avgHum, aggRow.avgTurb, aggRow.avgWater], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      db.query(`DELETE FROM realtime_data WHERE greenhouse_id = ?`, [greenhouse_id]);
    }

    res.json({ success: true, aggregated: true });
  })
);

// Helper for local date string
const getLocalMySQLDate = (dateVal) => {
  const date = dateVal ? new Date(dateVal) : new Date();
  const offset = date.getTimezoneOffset() * 60000;
  const localDate = new Date(date.getTime() - offset);
  return localDate.toISOString().slice(0, 10); // YYYY-MM-DD
};

app.get(
  "/api/greenhouses/history/latest",
  asyncHandler(async (req, res) => {
    const greenhouse_id = req.query.gh;

    // Validate greenhouse_id similarly to /api/greenhouses/history
    if (!isNumber(greenhouse_id)) {
      return res.status(400).json({ error: "Invalid greenhouse ID" });
    }

    const sql = `SELECT * FROM historical_data WHERE greenhouse_id = ? ORDER BY created_at DESC LIMIT 1`;
    db.query(sql, [Number(greenhouse_id)], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows.length > 0 ? rows[0] : null);
    });
  })
);

app.get(
  "/api/greenhouses/history",
  asyncHandler(async (req, res) => {
    const greenhouse_id = req.query.gh;
    if (!isNumber(greenhouse_id)) return res.status(400).json({ error: "Parameter gh harus angka" });

    // 1. Setup Dates
    const monthAgoDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const monthAgoStr = getLocalMySQLDate(monthAgoDate);
    const nowStr = getLocalMySQLDate(new Date());

    let date_from = req.query.date_from || monthAgoStr;
    let date_to = req.query.date_to || nowStr;

    // Append time to make full DATETIME
    if (date_from.length === 10) date_from += ' 00:00:00';
    if (date_to.length === 10) date_to += ' 23:59:59';

    // 2. Calculate Difference in Days
    const start = new Date(date_from);
    const end = new Date(date_to);
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // Base Select for Averages
    const selectAggregates = `
      ROUND(AVG(dht_temp), 2) as dht_temp,
      ROUND(AVG(dht_hum), 2) as dht_hum,
      ROUND(AVG(water_temp), 2) as water_temp,
      ROUND(AVG(turbidity), 2) as turbidity
    `;

    let sql = "";

    // 3. Dynamic Grouping
    if (diffDays > 3) {
      // > 3 Days: Group by DAY
      sql = `
        SELECT DATE(created_at) as created_at, ${selectAggregates}
        FROM historical_data
        WHERE greenhouse_id = ? AND created_at BETWEEN ? AND ?
        GROUP BY DATE(created_at)
        ORDER BY created_at ASC
      `;
    } else if (diffDays > 1) {
      // 1-3 Days: Group by 6 Hours
      sql = `
        SELECT MAX(created_at) as created_at, ${selectAggregates}
        FROM historical_data
        WHERE greenhouse_id = ? AND created_at BETWEEN ? AND ?
        GROUP BY DATE(created_at), FLOOR(HOUR(created_at) / 6)
        ORDER BY created_at ASC
      `;
    } else {
      // <= 1 Day: Group by Hour (Default)
      sql = `
        SELECT MAX(created_at) as created_at, ${selectAggregates}
        FROM historical_data
        WHERE greenhouse_id = ? AND created_at BETWEEN ? AND ?
        GROUP BY DATE(created_at), HOUR(created_at)
        ORDER BY created_at ASC
      `;
    }

    db.query(sql, [greenhouse_id, date_from, date_to], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  })
);

app.get("/api/greenhouses", (req, res) => {
  db.query("SELECT * FROM greenhouses", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.listen(3000, () => console.log("Server running on port 3000"));
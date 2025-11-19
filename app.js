const express = require("express");
const cors = require("cors");
const db = require("./db");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// ===============================
//  Helper: Validasi angka
// ===============================
function isNumber(value) {
  return value !== undefined && value !== "" && !isNaN(value);
}

// ===============================
//  Middleware: Async Handler
// ===============================
function asyncHandler(fn) {
  return function (req, res) {
    Promise.resolve(fn(req, res)).catch((err) => {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    });
  };
}

// ===============================
//  TEST API
// ===============================
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

// ===============================
//  POST DATA SENSOR
// ===============================
app.post(
  "/api/sensor/:greenhouse_id",
  asyncHandler(async (req, res) => {
    const greenhouse_id = req.params.greenhouse_id;
    const { dht_temp, dht_hum, turbidity, water_temp } = req.body;

    // -----------------------------
    // VALIDASI GREENHOUSE ID
    // -----------------------------
    if (!isNumber(greenhouse_id)) {
      return res.status(400).json({
        error: "greenhouse_id harus berupa angka",
      });
    }

    // -----------------------------
    // VALIDASI FIELD SENSOR
    // (null boleh, tapi jika ada harus angka)
    // -----------------------------
    const fields = { dht_temp, dht_hum, turbidity, water_temp };
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined && value !== null && !isNumber(value)) {
        return res.status(400).json({
          error: `Field ${key} harus berupa angka`,
          received: value,
        });
      }
    }

    // -----------------------------
    // CEK FOREIGN KEY (greenhouse)
    // -----------------------------
    const checkFk = await new Promise((resolve, reject) => {
      db.query(
        "SELECT id FROM greenhouses WHERE id = ?",
        [greenhouse_id],
        (err, rows) => {
          if (err) reject(err);
          resolve(rows.length > 0);
        }
      );
    });

    if (!checkFk) {
      return res.status(400).json({
        error: "Greenhouse tidak ditemukan (FK mismatch)",
        greenhouse_id,
      });
    }

    // -----------------------------
    // INSERT DATA
    // -----------------------------
    const sql = `
      INSERT INTO sensor_data 
      (greenhouse_id, dht_temp, dht_hum, turbidity, water_temp)
      VALUES (?, ?, ?, ?, ?)
    `;

    db.query(
      sql,
      [greenhouse_id, dht_temp, dht_hum, turbidity, water_temp],
      (err, result) => {
        if (err) {
          console.error("SQL Insert Error:", err);
          return res.status(500).json({ error: "Gagal menyimpan data sensor" });
        }

        res.json({
          success: true,
          inserted_id: result.insertId,
        });
      }
    );
  })
);

// ===============================
//  HISTORY SENSOR
// ===============================
app.get(
  "/api/greenhouses/history",
  asyncHandler(async (req, res) => {
    const greenhouse_id = req.query.gh;

    if (!isNumber(greenhouse_id)) {
      return res.status(400).json({ error: "Parameter gh harus angka" });
    }

    const weekAgo = new Date(Date.now() - 7 * 86400000)
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");

    const date_from = req.query.date_from || weekAgo;
    const date_to = new Date().toISOString().slice(0, 19).replace("T", " ");

    const sql = `
      SELECT * FROM sensor_data
      WHERE greenhouse_id = ?
      AND created_at BETWEEN ? AND ?
      ORDER BY created_at DESC
    `;

    db.query(sql, [greenhouse_id, date_from, date_to], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });

      res.json(rows);
    });
  })
);

// ===============================
// LIST GREENHOUSE
// ===============================
app.get("/api/greenhouses", (req, res) => {
  const sql = `SELECT * FROM greenhouses`;

  db.query(sql, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// ===============================
// PENTING UNTUK CPANEL
// ===============================
app.listen(3000, () => console.log("Server running on port 3000"));

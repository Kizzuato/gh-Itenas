const e = require("express");
const mysql = require("mysql2");

const db = mysql.createPool({
  host: env.HOST,
  user: env.USER,
  password: env.PASSWORD,
  database: env.DB_NAME,
});

module.exports = db;

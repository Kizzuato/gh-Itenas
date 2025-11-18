require('dotenv').config();
const mysql = require("mysql2");

const db = mysql.createPool({
  // host: "localhost",
  // user: "root",
  // password: "",
  // database: "gh-itenas"
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

module.exports = db;

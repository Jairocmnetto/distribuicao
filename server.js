// server.js
require('dotenv').config();
const express = require('express');
const mysql   = require('mysql2/promise');
const cors    = require('cors');
const path    = require('path');
const app     = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Pool de conexões MySQL
const pool = mysql.createPool({
  host:     process.env.DB_HOST,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10
});

// GET /get_volume
app.get('/get_volume', async (req, res) => {
  const vol = req.query.volume;
  if (!vol) return res.json({ success:false, error:'Volume não informado' });
  try {
    const [rows] = await pool.query(
      'SELECT semana, modelo, tamanho, quantidade, marca FROM T_VOLUMES WHERE volume = ?',
      [vol]
    );
    if (rows.length) return res.json({ success:true, data:rows[0] });
    return res.json({ success:false });
  } catch (err) {
    console.error('Erro em GET /get_volume:', err);
    res.status(500).json({ success:false, error: err.message });
  }
});

// GET /fornecedores
app.get('/fornecedores', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT DISTINCT fornecedor FROM t_defeito ORDER BY fornecedor'
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Erro em GET /fornecedores:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /defeitos?fornecedor=...
app.get('/defeitos', async (req, res) => {
  const forn = req.query.fornecedor;
  if (!forn) return res.json({ success: false, error: 'Fornecedor não informado' });
  try {
    const [rows] = await pool.query(
      'SELECT defeito FROM t_defeito WHERE fornecedor = ? ORDER BY defeito',
      [forn]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Erro em GET /defeitos:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /save_caixa
app.post('/save_caixa', async (req, res) => {
  const { volume, fornecedor, defeito } = req.body;
  if (!volume || !fornecedor || !defeito) {
    return res.json({ success:false, error:'Dados incompletos' });
  }

  // define todos os possíveis campos
  const camposPossiveis = [
    'volume','semana','modelo','tamanho',
    'fornecedor','defeito','qtd_pares',
    'qtd_esquerdo','qtd_direito','marca'
  ];

  const cols = [];
  const values = [];

  camposPossiveis.forEach(campo => {
    const val = req.body[campo];
    // só inclui se não for undefined e não for string vazia
    if (val !== undefined && val !== '') {
      cols.push(campo);
      values.push(val);
    }
  });

  try {
    const placeholders = cols.map(_ => '?').join(', ');
    const sql = `INSERT INTO T_CAIXA (${cols.join(', ')}) VALUES (${placeholders})`;
    await pool.query(sql, values);
    res.json({ success:true });
  } catch (err) {
    console.error('Erro em POST /save_caixa:', err);
    res.json({ success:false, error: err.message });
  }
});



// === ENDPOINTS PARA DASHBOARD ===

// 1) defeitos por fornecedor
app.get('/api/defeitos-por-fornecedor', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT fornecedor, COUNT(*) AS total
         FROM T_CAIXA
        GROUP BY fornecedor
        ORDER BY total DESC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Erro em GET /api/defeitos-por-fornecedor:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2) top 5 defeitos
app.get('/api/top-defeitos', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT defeito, COUNT(*) AS total
         FROM T_CAIXA
        GROUP BY defeito
        ORDER BY total DESC
        LIMIT 5`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Erro em GET /api/top-defeitos:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});
// 3. Caixas Paradas por Marcas
app.get('/api/caixas-por-marca', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT marca, COUNT(*) AS total
         FROM T_CAIXA
        GROUP BY marca
        ORDER BY total DESC`
    );
    res.json({ 
      success: true, 
      data: rows.map(item => ({
        marca: item.marca,
        total: item.total
      }))
    });
  } catch (err) {
    console.error('Erro em GET /api/caixas-por-marca:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Erro ao buscar dados de caixas por marca',
      details: err.message
    });
  }
});

// 4) Relatório Dinâmico de T_CAIXA
app.get('/api/t_caixa', async (req, res) => {
  const { dataInicial, dataFinal, marca, fornecedor, semana, modelo } = req.query;
  if (!dataInicial || !dataFinal) {
    return res.status(400).json({ success: false, error: 'Data Inicial e Data Final são obrigatórias' });
  }
  try {
    let sql = 'SELECT * FROM T_CAIXA WHERE criado_em >= ? AND criado_em <= ?';
    const params = [dataInicial, dataFinal];

    if (marca)      { sql += ' AND marca = ?';      params.push(marca); }
    if (fornecedor) { sql += ' AND fornecedor = ?'; params.push(fornecedor); }
    if (semana)     { sql += ' AND semana = ?';     params.push(semana); }
    if (modelo)     { sql += ' AND modelo = ?';     params.push(modelo); }

    sql += ' ORDER BY criado_em ASC';

    const [rows] = await pool.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Erro em GET /api/t_caixa:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Inicia o servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

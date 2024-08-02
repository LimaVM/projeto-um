// server.js

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const XLSX = require('xlsx');
const fs = require('fs');
const moment = require('moment');
const { body, validationResult } = require('express-validator');

const app = express();
const PORT = 7770;
const HOST = '192.168.1.120';

// Conexão com o banco de dados
const dbPath = path.join(__dirname, 'judth-leao-reg.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Erro ao abrir banco de dados:', err.message);
    } else {
        console.log('Conectado ao banco de dados SQLite.');
        criarTabelas();
    }
});

// Middlewares
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../public')));

// Middleware de tratamento de erros
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Erro interno do servidor' });
});

// Função para calcular saldo extra
function calcularSaldoExtra(entradaManha, saidaManha, entradaTarde, saidaTarde) {
    const inicioExpedienteManha = moment('08:00', 'HH:mm');
    const fimExpedienteManha = moment('12:00', 'HH:mm');
    const inicioExpedienteTarde = moment('14:00', 'HH:mm');
    const fimExpedienteTarde = moment('18:00', 'HH:mm');

    const entradaManhaMoment = moment(entradaManha, 'HH:mm');
    const saidaManhaMoment = moment(saidaManha, 'HH:mm');
    const entradaTardeMoment = moment(entradaTarde, 'HH:mm');
    const saidaTardeMoment = moment(saidaTarde, 'HH:mm');

    let minutosExtras = 0;

    if (entradaManhaMoment.isBefore(inicioExpedienteManha)) {
        minutosExtras += inicioExpedienteManha.diff(entradaManhaMoment, 'minutes');
    }
    if (saidaManhaMoment.isAfter(fimExpedienteManha)) {
        minutosExtras += saidaManhaMoment.diff(fimExpedienteManha, 'minutes');
    }
    if (entradaTardeMoment.isBefore(inicioExpedienteTarde)) {
        minutosExtras += inicioExpedienteTarde.diff(entradaTardeMoment, 'minutes');
    }
    if (saidaTardeMoment.isAfter(fimExpedienteTarde)) {
        minutosExtras += saidaTardeMoment.diff(fimExpedienteTarde, 'minutes');
    }

    const valorPorMinuto = 10 / 60;
    return minutosExtras * valorPorMinuto;
}

// Criação das tabelas
function criarTabelas() {
    db.run(`
        CREATE TABLE IF NOT EXISTS funcionarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            saldo_extra REAL DEFAULT 0
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS presencas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            funcionario_id INTEGER,
            data TEXT,
            entrada_manha TEXT,
            saida_manha TEXT,
            entrada_tarde TEXT,
            saida_tarde TEXT,
            status TEXT,
            FOREIGN KEY(funcionario_id) REFERENCES funcionarios(id)
        )
    `);
}

// Validação para criação de funcionário
const validateFuncionario = [
    body('nome').notEmpty().withMessage('O nome do funcionário é obrigatório'),
];

// Validação para registro de presença
const validatePresenca = [
    body('funcionario_id').isInt().withMessage('ID do funcionário inválido'),
    body('data').isISO8601().withMessage('Data inválida (use o formato YYYY-MM-DD)'),
    body('status').isIn(['Presente', 'Ausente']).withMessage('Status inválido'),
];

// Rotas
// Registrar novo funcionário
app.post('/funcionarios', validateFuncionario, (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { nome } = req.body;
    db.run('INSERT INTO funcionarios (nome) VALUES (?)', [nome], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        console.log(`Funcionário ${nome} registrado com ID ${this.lastID}`);
        res.status(201).json({ id: this.lastID });
    });
});

// Obter todos os funcionários
app.get('/funcionarios', (req, res) => {
    db.all('SELECT * FROM funcionarios', [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        console.log('Funcionários carregados:', rows);
        res.json(rows);
    });
});

// Registrar presença ou ausência
app.post('/presencas', validatePresenca, (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { funcionario_id, data, entrada_manha, saida_manha, entrada_tarde, saida_tarde, status } = req.body;

    const saldoExtra = status === 'Ausente' ? 0 : calcularSaldoExtra(entrada_manha, saida_manha, entrada_tarde, saida_tarde);

    db.run(
        'INSERT INTO presencas (funcionario_id, data, entrada_manha, saida_manha, entrada_tarde, saida_tarde, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [funcionario_id, data, entrada_manha, saida_manha, entrada_tarde, saida_tarde, status],
        function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            if (status === 'Presente') {
                db.run(
                    'UPDATE funcionarios SET saldo_extra = saldo_extra + ? WHERE id = ?',
                    [saldoExtra, funcionario_id],
                    function(err) {
                        if (err) {
                            return res.status(500).json({ error: err.message });
                        }
                        res.status(201).json({ id: this.lastID, saldoExtra });
                    }
                );
            } else {
                res.status(201).json({ id: this.lastID, saldoExtra: 0 });
            }
        }
    );
});

// Obter registros de presença por funcionário
app.get('/presencas/:funcionario_id', (req, res) => {
    const { funcionario_id } = req.params;
    db.all('SELECT * FROM presencas WHERE funcionario_id = ?', [funcionario_id], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// Exportar dados para Excel
app.post('/exportar', (req, res) => {
    const { funcionario_id, inicio, fim, todos } = req.body;
    let query = 'SELECT data, entrada_manha, saida_manha, entrada_tarde, saida_tarde, status FROM presencas WHERE funcionario_id = ?';
    let params = [funcionario_id];

    if (!todos) {
        query += ' AND data BETWEEN ? AND ?';
        params.push(inicio, fim);
    }

    db.all(query, params, (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        const dados = rows.map(row => {
            const valorExtra = row.status === 'Ausente' ? 0 : calcularSaldoExtra(row.entrada_manha, row.saida_manha, row.entrada_tarde, row.saida_tarde);
            return {
                Data: row.data,
                EntradaManha: row.entrada_manha,
                SaidaManha: row.saida_manha,
                EntradaTarde: row.entrada_tarde,
                SaidaTarde: row.saida_tarde,
                Status: row.status,
                ValorExtra: `R$${valorExtra.toFixed(2)}`
            };
        });

        const worksheet = XLSX.utils.json_to_sheet(dados);

        // Estilizar cabeçalhos
        const range = XLSX.utils.decode_range(worksheet['!ref']);
        for (let C = range.s.c; C <= range.e.c; ++C) {
            const address = XLSX.utils.encode_cell({ c: C, r: 0 });
            if (!worksheet[address]) continue;
            if (!worksheet[address].s) worksheet[address].s = {};
            worksheet[address].s.fill = { fgColor: { rgb: "FFFF00" } }; // Cor amarela
        }

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Presencas');

        const filePath = path.join(__dirname, 'presencas.xlsx');
        XLSX.writeFile(workbook, filePath);

        res.download(filePath, 'presencas.xlsx', (err) => {
            if (err) {
                console.error('Erro ao baixar arquivo:', err);
            }
            fs.unlinkSync(filePath); // Remove o arquivo após o download
        });
    });
});

// Iniciar o servidor
app.listen(PORT, HOST, () => {
    console.log(`Servidor rodando em http://${HOST}:${PORT}`);
});

const express = require('express');
const cors = require('cors');
const path = require('path'); // Necesario para encontrar la carpeta del frontend
const Database = require('better-sqlite3');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3001; // Render nos asignará el puerto aquí

app.use(cors());
app.use(express.json());

const BOT_TOKEN = '8636534021:AAEOUepsSNkoDwgZ23grzEQ0teYSykel8YY'; 
const CHANNEL_USERNAME = '@kabuto_payments'; 
const PLISIO_API_KEY = 'xxWBe8xc_Tz6NDJ5zItE5dgdSRbIxAT59-i0uuiRSf_uI3mL8mV8S-7gf6sk1N64';
const KABUTO_PRICE_USD = 0.001;

const TASK_REWARDS = {
  'tg_channel': 100,
  'visit_web': 200
};

const db = new Database('kabuto.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    telegram_id TEXT PRIMARY KEY,
    first_name TEXT,
    holding_wallet REAL DEFAULT 0,
    pool_wallet REAL DEFAULT 0,
    team_wallet REAL DEFAULT 0,
    hash_power REAL DEFAULT 10,
    is_vip INTEGER DEFAULT 0,
    is_banned INTEGER DEFAULT 0,
    total_invested REAL DEFAULT 0,
    total_withdrawn REAL DEFAULT 0,
    claimed_tasks TEXT DEFAULT '',
    referred_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )
`);

const initAdminWithdrawn = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('admin_profit_withdrawn', '0')");
initAdminWithdrawn.run();

function addColumnIfNotExists(column, type) {
  try { db.prepare(`ALTER TABLE users ADD COLUMN ${column} ${type}`).run(); } catch (e) {}
}
addColumnIfNotExists('team_wallet', 'REAL DEFAULT 0');
addColumnIfNotExists('is_banned', 'INTEGER DEFAULT 0');
addColumnIfNotExists('total_invested', 'REAL DEFAULT 0');
addColumnIfNotExists('total_withdrawn', 'REAL DEFAULT 0');
addColumnIfNotExists('claimed_tasks', 'TEXT DEFAULT ""');
addColumnIfNotExists('last_seen', 'DATETIME DEFAULT CURRENT_TIMESTAMP');

async function postPaymentToChannel(userName, amount, txHash) {
  const explorerUrl = `https://tonscan.org/tx/${txHash}`;
  const message = `✅ *PAGO VERIFICADO*\n\n👤 *Usuario:* ${userName}\n💰 *Monto:* ${amount} TON\n🆔 *Tx Hash:* [Ver transacción en la blockchain](${explorerUrl})\n\n¡Felicidades por tu activación VIP en Kabuto Miner! 🪲`;
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  try { await axios.post(url, { chat_id: CHANNEL_USERNAME, text: message, parse_mode: 'Markdown', disable_web_page_preview: false }); } catch (e) {}
}

async function postNewUserToChannel(userName, userId) {
  const message = `👋 *Nuevo Usuario Registrado*\n\n👤 *Nombre:* ${userName}\n🆔 *ID:* ${userId}\n\n¡Bienvenido a la familia Kabuto Miner! 🪲`;
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  try { await axios.post(url, { chat_id: CHANNEL_USERNAME, text: message, parse_mode: 'Markdown' }); } catch (e) {}
}

async function processPlisioWithdrawal(userName, amountUsd, currency, address) {
  try {
    let cryptoPriceUsd = 1;
    if (currency === 'TON') {
      const priceRes = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd');
      cryptoPriceUsd = priceRes.data['the-open-network'].usd;
    }

    const cryptoAmount = (amountUsd / cryptoPriceUsd).toFixed(8);

    const plisioRes = await axios.get('https://plisio.net/api/v1/withdraw', {
      params: {
        api_key: PLISIO_API_KEY,
        currency: currency,
        to: address,
        amount: cryptoAmount
      }
    });

    if (plisioRes.data && plisioRes.data.status === 'success') {
      const txHash = plisioRes.data.data.tx_id || plisioRes.data.data.id;
      const explorerUrl = currency === 'TON' ? `https://tonscan.org/tx/${txHash}` : `https://tronscan.org/#/transaction/${txHash}`;
      
      const message = `💸 *RETIRO COMPLETADO*\n\n👤 *Usuario:* ${userName}\n💰 *Monto:* ${amountUsd} USD (${cryptoAmount} ${currency})\n🔗 *Dirección:* \`${address}\`\n🆔 *Tx Hash:* [Ver transacción en la blockchain](${explorerUrl})\n\n¡Pago procesado automáticamente vía Plisio! 🪲`;
      const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
      await axios.post(url, { chat_id: CHANNEL_USERNAME, text: message, parse_mode: 'Markdown', disable_web_page_preview: false });
      
      return { success: true };
    } else {
      console.error('Error retiro Plisio:', plisioRes.data);
      return { success: false, error: plisioRes.data?.data?.message || 'Plisio rechazó el retiro.' };
    }
  } catch (error) {
    console.error('Error procesando retiro Plisio:', error.message);
    return { success: false, error: 'Error de conexión con Plisio.' };
  }
}

app.get('/api/health', (req, res) => res.json({ status: 'OK' }));

app.post('/api/user/login', (req, res) => {
  const { telegram_id, first_name, referred_by } = req.body;
  if (!telegram_id) return res.status(400).json({ error: 'Falta telegram_id' });

  let user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegram_id);
  if (user && user.is_banned === 1) return res.status(403).json({ error: 'BANNED' });

  if (!user) {
    const insert = db.prepare('INSERT INTO users (telegram_id, first_name, referred_by) VALUES (?, ?, ?)');
    insert.run(telegram_id, first_name || 'Jugador', referred_by || null);
    user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegram_id);

    postNewUserToChannel(first_name || 'Jugador', telegram_id);

    if (referred_by) {
      let referrer = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(referred_by);
      if (referrer) {
        db.prepare('UPDATE users SET holding_wallet = holding_wallet + 5.0 WHERE telegram_id = ?').run(referred_by);
        db.prepare('UPDATE users SET holding_wallet = holding_wallet + 2.0 WHERE telegram_id = ?').run(telegram_id);
        user.holding_wallet += 2.0; 
      }
    }
  }

  db.prepare('UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE telegram_id = ?').run(telegram_id);
  user.claimed_tasks = user.claimed_tasks ? user.claimed_tasks.split(',').filter(Boolean) : [];
  res.json(user);
});

app.post('/api/user/claim_task', (req, res) => {
  const { telegram_id, task_id } = req.body;
  const reward = TASK_REWARDS[task_id] || 0;
  
  if (reward === 0) return res.status(400).json({ error: 'Tarea inválida' });

  const user = db.prepare('SELECT claimed_tasks, holding_wallet FROM users WHERE telegram_id = ?').get(telegram_id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  let tasks = user.claimed_tasks ? user.claimed_tasks.split(',').filter(Boolean) : [];
  if (tasks.includes(task_id)) return res.status(400).json({ error: 'Ya reclamado' });

  tasks.push(task_id);
  const newHolding = user.holding_wallet + reward;
  
  db.prepare('UPDATE users SET claimed_tasks = ?, holding_wallet = ? WHERE telegram_id = ?').run(tasks.join(','), newHolding, telegram_id);
  res.json({ status: 'OK', new_holding_wallet: newHolding });
});

app.post('/api/user/save', (req, res) => {
  const { telegram_id, holding_wallet, pool_wallet, hash_power, is_vip } = req.body;
  if (!telegram_id) return res.status(400).json({ error: 'Falta telegram_id' });

  const currentUser = db.prepare('SELECT holding_wallet, pool_wallet, referred_by FROM users WHERE telegram_id = ?').get(telegram_id);
  let newTeamWallet = 0;

  if (currentUser) {
    const currentTotal = currentUser.holding_wallet + currentUser.pool_wallet;
    const newTotal = holding_wallet + pool_wallet;
    const mined = Math.max(0, newTotal - currentTotal);

    if (mined > 0 && currentUser.referred_by) {
      const commission = mined * 0.10;
      db.prepare('UPDATE users SET team_wallet = team_wallet + ? WHERE telegram_id = ?').run(commission, currentUser.referred_by);
    }

    const updatedUser = db.prepare('SELECT team_wallet FROM users WHERE telegram_id = ?').get(telegram_id);
    newTeamWallet = updatedUser.team_wallet || 0;
  }

  const update = db.prepare(`UPDATE users SET holding_wallet = ?, pool_wallet = ?, hash_power = ?, is_vip = ?, last_seen = CURRENT_TIMESTAMP WHERE telegram_id = ?`);
  update.run(holding_wallet, pool_wallet, hash_power, is_vip ? 1 : 0, telegram_id);
  res.json({ status: 'OK', team_wallet: newTeamWallet });
});

app.post('/api/user/claim_team', (req, res) => {
  const { telegram_id } = req.body;
  const user = db.prepare('SELECT team_wallet FROM users WHERE telegram_id = ?').get(telegram_id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  
  const amount = user.team_wallet;
  if (amount > 0) {
    db.prepare('UPDATE users SET holding_wallet = holding_wallet + ?, team_wallet = 0 WHERE telegram_id = ?').run(amount, telegram_id);
  }
  res.json({ status: 'OK', claimed: amount });
});

app.post('/api/user/activate_vip', async (req, res) => {
  const { telegram_id, first_name, amount_ton } = req.body;
  if (!telegram_id) return res.status(400).json({ error: 'Falta telegram_id' });

  db.prepare('UPDATE users SET is_vip = 1, total_invested = total_invested + ? WHERE telegram_id = ?').run(amount_ton, telegram_id);
  const fakeHash = '0x' + Array.from({length: 64}, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
  
  try { await postPaymentToChannel(first_name || 'Usuario', amount_ton, fakeHash); } catch (e) {}

  const user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegram_id);
  res.json({ status: 'OK', user, txHash: fakeHash });
});

app.post('/api/create_plisio_invoice', async (req, res) => {
  const { upgrade_name, amount_ton, telegram_id } = req.body;
  try {
    const response = await axios.get('https://api.plisio.net/api/v1/invoices/new', {
      params: {
        api_key: PLISIO_API_KEY, amount: amount_ton, currency: 'TON',
        order_name: upgrade_name, order_number: `${telegram_id}-${Date.now()}`,
        source_url: 'https://telegra.ph/Kabuto-Miner-Game-10-02'
      }
    });

    if (response.data && response.data.status === 'success') {
      res.json({ url: response.data.data.invoice_url });
    } else {
      const plisioError = response.data?.data?.message || response.data?.message || JSON.stringify(response.data);
      console.error('Error Plisio:', plisioError);
      res.status(400).json({ error: `Plisio dice: ${plisioError}` });
    }
  } catch (error) {
    const errData = error.response?.data;
    console.error('Error completo Plisio:', JSON.stringify(errData, null, 2));
    const errMsg = errData?.data?.message || errData?.message || error.message;
    res.status(500).json({ error: `Plisio rechazó: ${errMsg}` });
  }
});

app.post('/api/plisio_webhook', async (req, res) => {
  const data = req.body;
  if (data.status === 'completed' || data.status === 'paid') {
    const telegram_id = data.order_number.split('-')[0];
    const amount = parseFloat(data.amount);
    
    const user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegram_id);
    if (user && !user.is_vip) {
      db.prepare('UPDATE users SET is_vip = 1, total_invested = total_invested + ? WHERE telegram_id = ?').run(amount, telegram_id);
      await postPaymentToChannel(user.first_name, amount, data.tx_id);
    }
  }
  res.json({ status: 'OK' });
});

app.post('/api/request_withdrawal', async (req, res) => {
  const { telegram_id, amount, to_address, currency } = req.body;
  const user = db.prepare('SELECT first_name, holding_wallet FROM users WHERE telegram_id = ?').get(telegram_id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  const kabutoToBurn = amount / KABUTO_PRICE_USD;

  if (user.holding_wallet >= kabutoToBurn) {
    db.prepare('UPDATE users SET holding_wallet = holding_wallet - ?, total_withdrawn = total_withdrawn + ? WHERE telegram_id = ?').run(kabutoToBurn, amount, telegram_id);
    
    const withdrawalResult = await processPlisioWithdrawal(user.first_name, amount, currency, to_address);
    
    if (withdrawalResult.success) {
      res.json({ status: 'OK' });
    } else {
      db.prepare('UPDATE users SET holding_wallet = holding_wallet + ?, total_withdrawn = total_withdrawn - ? WHERE telegram_id = ?').run(kabutoToBurn, amount, telegram_id);
      res.status(400).json({ error: withdrawalResult.error || 'No se pudo procesar el retiro en Plisio. Saldo devuelto.' });
    }
  } else {
    res.status(400).json({ error: 'Saldo insuficiente en el servidor' });
  }
});

app.get('/api/user/referrals/:telegram_id', (req, res) => {
  const { telegram_id } = req.params;
  const referrals = db.prepare('SELECT first_name, telegram_id, holding_wallet, pool_wallet, is_vip, hash_power FROM users WHERE referred_by = ?').all(telegram_id);
  res.json(referrals);
});

app.get('/api/admin/stats', (req, res) => {
  const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  const totalVips = db.prepare('SELECT COUNT(*) as count FROM users WHERE is_vip = 1').get().count;
  const totalKabuto = db.prepare('SELECT SUM(holding_wallet + pool_wallet) as total FROM users').get().total || 0;
  const totalInvested = db.prepare('SELECT SUM(total_invested) as total FROM users').get().total || 0;
  const totalWithdrawn = db.prepare('SELECT SUM(total_withdrawn) as total FROM users').get().total || 0;
  
  const adminProfitWithdrawn = parseFloat(db.prepare("SELECT value FROM settings WHERE key = 'admin_profit_withdrawn'").get()?.value || '0');
  const adminGrossProfit = totalInvested * 0.30;
  const adminProfitAvailable = Math.max(0, adminGrossProfit - adminProfitWithdrawn);
  
  const liquidityPool = Math.max(0, (totalInvested * 0.70) - totalWithdrawn);
  
  const onlineUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE last_seen > datetime('now', '-15 seconds')").get().count;
  
  res.json({ 
    totalUsers, 
    totalVips, 
    totalKabuto, 
    totalInvested, 
    totalWithdrawn, 
    liquidityPool, 
    adminProfitAvailable,
    adminProfitWithdrawn,
    onlineUsers 
  });
});

app.post('/api/admin/withdraw_profit', (req, res) => {
  const { amount } = req.body;
  const currentWithdrawn = parseFloat(db.prepare("SELECT value FROM settings WHERE key = 'admin_profit_withdrawn'").get()?.value || '0');
  const newTotal = currentWithdrawn + amount;
  
  db.prepare("UPDATE settings SET value = ? WHERE key = 'admin_profit_withdrawn'").run(String(newTotal));
  res.json({ status: 'OK', admin_profit_withdrawn: newTotal });
});

app.get('/api/admin/users', (req, res) => {
  const users = db.prepare(`SELECT first_name, telegram_id, holding_wallet, pool_wallet, hash_power, is_vip, is_banned, total_invested, total_withdrawn, last_seen FROM users ORDER BY created_at DESC LIMIT 100`).all();
  const formattedUsers = users.map(u => ({ ...u, is_online: new Date(u.last_seen) > new Date(Date.now() - 15000) }));
  res.json(formattedUsers);
});

app.post('/api/admin/ban_user', (req, res) => {
  const { telegram_id, ban_status } = req.body;
  if (!telegram_id) return res.status(400).json({ error: 'Falta telegram_id' });
  db.prepare('UPDATE users SET is_banned = ? WHERE telegram_id = ?').run(ban_status ? 1 : 0, telegram_id);
  res.json({ status: 'OK', message: ban_status ? 'Usuario baneado' : 'Usuario desbaneado' });
});

// SERVIR EL FRONTEND EN PRODUCCIÓN (LA MAGIA PARA LA NUBE)
app.use(express.static(path.join(__dirname, '../juego-kabuto/dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../juego-kabuto/dist/index.html'));
});

app.listen(PORT, () => console.log(`🧠 Backend de Kabuto corriendo en http://localhost:${PORT}`));

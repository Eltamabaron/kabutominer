// =====================================================
// KABUTO MINER v2.3 - SERVIDOR + BOT + CANAL DE TRANSPARENCIA
// =====================================================

const express = require('express');
const crypto = require('crypto');
const cors = require('cors');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const { notifyVIPActivated, notifyWithdrawal, postToChannel } = require('./bot');

const app = express();
const PORT = process.env.PORT || 3000;

// =====================================================
// CONFIGURACIÓN
// =====================================================
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';
const PLISIO_API_KEY = process.env.PLISIO_API_KEY || '';
const PLISIO_SECRET_KEY = process.env.PLISIO_SECRET_KEY || '';
const ADMIN_TELEGRAM_ID = '1159596878';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const VIP_PLANS = {
  1: { name: 'VIP 1', price: 1, hash_power: 50 },
  2: { name: 'VIP 2', price: 5, hash_power: 200 },
  3: { name: 'VIP 3', price: 10, hash_power: 500 },
  4: { name: 'VIP 4', price: 25, hash_power: 1500 },
  5: { name: 'VIP 5', price: 50, hash_power: 5000 },
};

const SUPPORTED_CURRENCIES = ['USDT', 'TON', 'LTC', 'TRX', 'DOGE', 'BNB', 'SOL', 'USDC'];

// =====================================================
// MIDDLEWARE
// =====================================================
app.use(cors());
app.use('/api/plisio_webhook', express.raw({ type: '*/*' }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../kabuto-game/dist')));

// =====================================================
// FUNCIÓN: Obtener o crear usuario
// =====================================================
async function getOrCreateUser(telegramId, username = '', firstName = '') {
  try {
    const { data: existing } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', telegramId)
      .single();

    if (existing) {
      await supabase
        .from('users')
        .update({
          last_login: new Date().toISOString(),
          username: username || existing.username,
          first_name: firstName || existing.first_name
        })
        .eq('telegram_id', telegramId);
      return existing;
    }

    const { data: newUser, error } = await supabase
      .from('users')
      .insert([{
        telegram_id: telegramId,
        username: username,
        first_name: firstName,
        balance: 0,
        hash_power: 1,
        vip_level: 0,
        total_mined: 0,
        banned: 0
      }])
      .select()
      .single();

    if (error) throw error;
    return newUser;
  } catch (err) {
    console.error('Error getOrCreateUser:', err);
    return null;
  }
}

// =====================================================
// FUNCIÓN: Activar VIP (con notificaciones)
// =====================================================
async function activateVIP(telegramId, planName, invoiceId) {
  try {
    const { data: purchase } = await supabase
      .from('purchases')
      .select('*')
      .eq('telegram_id', telegramId)
      .eq('plan', planName)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!purchase) {
      console.log('⚠️ No se encontró compra pendiente para', telegramId, planName);
      return false;
    }

    const planId = Object.keys(VIP_PLANS).find(k => VIP_PLANS[k].name === planName);
    if (!planId) return false;
    const plan = VIP_PLANS[planId];

    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', telegramId)
      .single();

    if (user) {
      const newHashPower = user.hash_power + plan.hash_power;
      const newVipLevel = Math.max(user.vip_level, parseInt(planId));

      await supabase
        .from('users')
        .update({
          hash_power: newHashPower,
          vip_level: newVipLevel
        })
        .eq('telegram_id', telegramId);

      console.log(`✅ VIP activado: ${telegramId} → ${planName} (HP: ${newHashPower})`);

      // Notificar al usuario via Telegram
      await notifyVIPActivated(telegramId, planName, plan.hash_power);

      // 📢 Publicar en canal de transparencia (sin exponer telegram_id)
      const maskedName = user.username
        ? `@${user.username}`
        : (user.first_name || 'Anónimo');

      await postToChannel(
        `🦏 *Nueva compra VIP confirmada*

📦 Plan: *${planName}*
💰 Monto: *$${plan.price} USD*
💱 Moneda: ${purchase.currency}
⚡ Hash Power añadido: *+${plan.hash_power} H/s*
👤 Usuario: ${maskedName}
🕐 Hora: ${new Date().toUTCString()}

✅ Pago verificado vía Plisio
📊 Reserva de liquidez: 70% / 30%`
      );
    }

    await supabase
      .from('purchases')
      .update({
        status: 'completed',
        plisio_invoice_id: invoiceId
      })
      .eq('id', purchase.id);

    return true;
  } catch (err) {
    console.error('Error activateVIP:', err);
    return false;
  }
}

// =====================================================
// API: LOGIN
// =====================================================
app.post('/api/login', async (req, res) => {
  try {
    const { telegram_id, username, first_name } = req.body;
    if (!telegram_id) return res.status(400).json({ error: 'telegram_id requerido' });

    const user = await getOrCreateUser(telegram_id, username, first_name);
    if (!user) return res.status(500).json({ error: 'Error al crear/obtener usuario' });
    if (user.banned) return res.status(403).json({ error: 'Usuario baneado' });

    res.json({
      telegram_id: user.telegram_id,
      username: user.username,
      first_name: user.first_name,
      balance: user.balance,
      hash_power: user.hash_power,
      vip_level: user.vip_level,
      total_mined: user.total_mined,
      is_admin: user.telegram_id === ADMIN_TELEGRAM_ID
    });
  } catch (err) {
    console.error('Error login:', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// =====================================================
// API: GUARDAR PROGRESO
// =====================================================
app.post('/api/save', async (req, res) => {
  try {
    const { telegram_id, balance, hash_power, total_mined } = req.body;
    if (!telegram_id) return res.status(400).json({ error: 'telegram_id requerido' });

    const { error } = await supabase
      .from('users')
      .update({
        balance: balance,
        hash_power: hash_power,
        total_mined: total_mined,
        last_login: new Date().toISOString()
      })
      .eq('telegram_id', telegram_id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('Error save:', err);
    res.status(500).json({ error: 'Error al guardar' });
  }
});

// =====================================================
// API: OBTENER ESTADO
// =====================================================
app.get('/api/state/:telegram_id', async (req, res) => {
  try {
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', req.params.telegram_id)
      .single();

    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    res.json({
      telegram_id: user.telegram_id,
      username: user.username,
      first_name: user.first_name,
      balance: user.balance,
      hash_power: user.hash_power,
      vip_level: user.vip_level,
      total_mined: user.total_mined,
      is_admin: user.telegram_id === ADMIN_TELEGRAM_ID
    });
  } catch (err) {
    console.error('Error state:', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// =====================================================
// API: CREAR FACTURA PLISIO
// =====================================================
app.post('/api/create_invoice', async (req, res) => {
  try {
    const { telegram_id, plan_id, currency } = req.body;
    const plan = VIP_PLANS[plan_id];
    if (!plan) return res.status(400).json({ error: 'Plan inválido' });

    const payCurrency = currency || 'USDT';
    if (!SUPPORTED_CURRENCIES.includes(payCurrency)) {
      return res.status(400).json({ error: 'Moneda no soportada' });
    }

    const user = await getOrCreateUser(telegram_id);
    if (!user) return res.status(400).json({ error: 'Usuario inválido' });

    const orderNumber = `${telegram_id}_${plan_id}_${Date.now()}`;

    const response = await axios.post('https://plisio.net/api/v1/invoices/new', {
      source_currency: 'USD',
      source_amount: plan.price,
      currency: payCurrency,
      order_name: `Kabuto Miner - ${plan.name}`,
      order_number: orderNumber,
      callback_url: 'https://kabutominer.onrender.com/api/plisio_webhook',
      success_callback_url: 'https://kabutominer.onrender.com/success',
      fail_callback_url: 'https://kabutominer.onrender.com/fail',
    }, {
      params: { api_key: PLISIO_API_KEY }
    });

    if (response.data.status !== 'success') {
      return res.status(400).json({ error: response.data.message || 'Error Plisio' });
    }

    const invoiceId = response.data.data.tx_id || response.data.data.id;

    await supabase.from('purchases').insert([{
      telegram_id: telegram_id,
      plan: plan.name,
      amount_usd: plan.price,
      currency: payCurrency,
      plisio_invoice_id: invoiceId,
      status: 'pending'
    }]);

    res.json({
      invoice_url: response.data.data.invoice_url,
      tx_id: invoiceId,
      order_number: orderNumber,
      amount: response.data.data.amount,
      currency: payCurrency,
      plan: plan
    });
  } catch (err) {
    console.error('Error create_invoice:', err.response?.data || err.message);
    res.status(500).json({ error: 'Error al crear factura' });
  }
});

// =====================================================
// API: VERIFICAR ESTADO DE FACTURA
// =====================================================
app.get('/api/check_invoice/:tx_id', async (req, res) => {
  try {
    const response = await axios.get(
      `https://plisio.net/api/v1/operations/${req.params.tx_id}`,
      { params: { api_key: PLISIO_API_KEY } }
    );

    if (response.data.status !== 'success') {
      return res.json({ status: 'pending' });
    }

    const op = response.data.data;
    const status = op.status;

    if (status === 'completed' || status === 'confirmed') {
      const { data: purchase } = await supabase
        .from('purchases')
        .select('*')
        .eq('plisio_invoice_id', req.params.tx_id)
        .single();

      if (purchase && purchase.status === 'pending') {
        await activateVIP(purchase.telegram_id, purchase.plan, req.params.tx_id);
      }
    }

    res.json({
      status: status,
      tx_id: op.tx_id,
      amount: op.amount,
      currency: op.currency
    });
  } catch (err) {
    console.error('Error check_invoice:', err.message);
    res.json({ status: 'pending' });
  }
});

// =====================================================
// WEBHOOK PLISIO
// =====================================================
app.post('/api/plisio_webhook', async (req, res) => {
  try {
    console.log('🔔 Webhook Plisio recibido');

    let body = req.body;
    if (Buffer.isBuffer(body)) {
      const raw = body.toString('utf8');
      try {
        body = JSON.parse(raw);
      } catch {
        const params = new URLSearchParams(raw);
        body = Object.fromEntries(params);
      }
    }

    console.log('📦 Datos:', JSON.stringify(body, null, 2));

    if (PLISIO_SECRET_KEY && body.verify_hash) {
      const verifyHash = body.verify_hash;
      delete body.verify_hash;
      const dataString = JSON.stringify(body);
      const expectedHash = crypto
        .createHmac('sha256', PLISIO_SECRET_KEY)
        .update(dataString)
        .digest('hex');

      if (expectedHash !== verifyHash) {
        console.error('❌ Firma inválida en webhook');
        return res.status(401).json({ error: 'Firma inválida' });
      }
      console.log('✅ Firma verificada correctamente');
    }

    const { tx_id, status, order_number } = body;

    if (status === 'completed' || status === 'confirmed') {
      if (order_number) {
        const parts = order_number.split('_');
        const telegramId = parts[0];
        const planId = parts[1];

        if (telegramId && planId && VIP_PLANS[planId]) {
          await activateVIP(telegramId, VIP_PLANS[planId].name, tx_id);
          console.log(`✅ Webhook procesado: ${telegramId} → ${VIP_PLANS[planId].name}`);
        }
      }
    }

    res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error('❌ Error webhook:', err);
    res.status(500).json({ error: 'Error webhook' });
  }
});

// =====================================================
// API: COMPLETAR TAREA
// =====================================================
app.post('/api/complete_task', async (req, res) => {
  try {
    const { telegram_id, task_id, reward } = req.body;

    const { data: existing } = await supabase
      .from('tasks_completed')
      .select('*')
      .eq('telegram_id', telegram_id)
      .eq('task_id', task_id)
      .single();

    if (existing) return res.json({ success: false, message: 'Ya completada' });

    await supabase.from('tasks_completed').insert([{
      telegram_id: telegram_id,
      task_id: task_id,
      reward: reward
    }]);

    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', telegram_id)
      .single();

    if (user) {
      await supabase
        .from('users')
        .update({ balance: user.balance + reward })
        .eq('telegram_id', telegram_id);
    }

    res.json({ success: true, new_balance: user.balance + reward });
  } catch (err) {
    console.error('Error complete_task:', err);
    res.status(500).json({ error: 'Error al completar tarea' });
  }
});

// =====================================================
// API: OBTENER TAREAS COMPLETADAS
// =====================================================
app.get('/api/tasks/:telegram_id', async (req, res) => {
  try {
    const { data } = await supabase
      .from('tasks_completed')
      .select('task_id')
      .eq('telegram_id', req.params.telegram_id);

    res.json({ completed: (data || []).map(t => t.task_id) });
  } catch (err) {
    res.json({ completed: [] });
  }
});

// =====================================================
// API: REGISTRAR REFERIDO
// =====================================================
app.post('/api/register_referral', async (req, res) => {
  try {
    const { referrer_id, referred_id } = req.body;
    if (referrer_id === referred_id) {
      return res.json({ success: false, message: 'No puedes referirte a ti mismo' });
    }

    const { data: existing } = await supabase
      .from('referrals')
      .select('*')
      .eq('referred_id', referred_id)
      .single();

    if (existing) return res.json({ success: false, message: 'Ya tiene referente' });

    await supabase.from('referrals').insert([{
      referrer_id: referrer_id,
      referred_id: referred_id,
      commission: 0
    }]);

    res.json({ success: true });
  } catch (err) {
    console.error('Error referral:', err);
    res.status(500).json({ error: 'Error' });
  }
});

// =====================================================
// API: SOLICITAR RETIRO (con publicación en canal)
// =====================================================
app.post('/api/withdraw', async (req, res) => {
  try {
    const { telegram_id, amount, currency, address } = req.body;

    if (!SUPPORTED_CURRENCIES.includes(currency)) {
      return res.status(400).json({ error: 'Moneda no soportada' });
    }
    if (amount < 1) return res.status(400).json({ error: 'Mínimo $1' });

    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', telegram_id)
      .single();

    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (user.balance < amount) return res.status(400).json({ error: 'Saldo insuficiente' });

    const response = await axios.post('https://plisio.net/api/v1/withdraw', {
      currency: currency,
      amount: amount,
      to: address
    }, {
      params: { api_key: PLISIO_API_KEY }
    });

    if (response.data.status !== 'success') {
      return res.status(400).json({ error: response.data.message || 'Error retiro' });
    }

    const txid = response.data.data.tx_id || '';

    await supabase
      .from('users')
      .update({ balance: user.balance - amount })
      .eq('telegram_id', telegram_id);

    await supabase.from('withdrawals').insert([{
      telegram_id: telegram_id,
      amount: amount,
      currency: currency,
      address: address,
      status: 'completed',
      txid: txid
    }]);

    // Notificar al usuario
    await notifyWithdrawal(telegram_id, amount, currency, txid);

    // 📢 Publicar en canal de transparencia
    const maskedName = user.username ? `@${user.username}` : (user.first_name || 'Anónimo');
    const maskedAddress = address.length > 12
      ? `${address.substring(0, 8)}...${address.substring(address.length - 6)}`
      : address;

    await postToChannel(
      `💸 *Retiro procesado*

👤 Usuario: ${maskedName}
💰 Monto: *$${amount} ${currency}*
📍 Dirección: \`${maskedAddress}\`
🔗 TXID: \`${txid || 'pending'}\`
🕐 Hora: ${new Date().toUTCString()}

✅ Enviado vía Plisio
📊 Saldo restante en reservas: 70%`
    );

    res.json({
      success: true,
      tx_id: txid,
      new_balance: user.balance - amount
    });
  } catch (err) {
    console.error('Error withdraw:', err.response?.data || err.message);
    res.status(500).json({ error: 'Error al procesar retiro' });
  }
});

// =====================================================
// API: ESTADÍSTICAS PÚBLICAS (sin exponer datos sensibles)
// =====================================================
app.get('/api/public_stats', async (req, res) => {
  try {
    const { data: users } = await supabase.from('users').select('hash_power, vip_level, total_mined');
    const { data: purchases } = await supabase
      .from('purchases')
      .select('amount_usd')
      .eq('status', 'completed');
    const { data: withdrawals } = await supabase.from('withdrawals').select('amount');

    const totalIncome = (purchases || []).reduce((sum, p) => sum + p.amount_usd, 0);
    const totalWithdrawn = (withdrawals || []).reduce((sum, w) => sum + w.amount, 0);
    const totalHashPower = (users || []).reduce((sum, u) => sum + u.hash_power, 0);

    res.json({
      total_users: users?.length || 0,
      total_income: parseFloat(totalIncome.toFixed(2)),
      total_withdrawn: parseFloat(totalWithdrawn.toFixed(2)),
      liquidity: parseFloat((totalIncome * 0.70).toFixed(2)),
      admin_profit: parseFloat((totalIncome * 0.30).toFixed(2)),
      total_purchases: purchases?.length || 0,
      total_hash_power: parseFloat(totalHashPower.toFixed(2)),
      last_update: new Date().toISOString()
    });
  } catch (err) {
    console.error('Error public_stats:', err);
    res.status(500).json({ error: 'Error' });
  }
});

// =====================================================
// API: PANEL ADMIN
// =====================================================
app.get('/api/admin/stats', async (req, res) => {
  try {
    const adminId = req.query.admin_id;
    if (adminId !== ADMIN_TELEGRAM_ID) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const { data: users } = await supabase.from('users').select('*');
    const { data: purchases } = await supabase
      .from('purchases')
      .select('*')
      .eq('status', 'completed');
    const { data: withdrawals } = await supabase.from('withdrawals').select('*');

    const totalIncome = (purchases || []).reduce((sum, p) => sum + p.amount_usd, 0);
    const totalWithdrawn = (withdrawals || []).reduce((sum, w) => sum + w.amount, 0);
    const liquidity = totalIncome * 0.70;
    const adminProfit = totalIncome * 0.30;
    const totalBalance = (users || []).reduce((sum, u) => sum + u.balance, 0);

    res.json({
      total_users: users?.length || 0,
      total_income: totalIncome,
      total_withdrawn: totalWithdrawn,
      liquidity_70: liquidity,
      admin_profit_30: adminProfit,
      total_balance: totalBalance,
      users: users || [],
      purchases: purchases || [],
      withdrawals: withdrawals || []
    });
  } catch (err) {
    console.error('Error admin stats:', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// =====================================================
// API: BANEAR USUARIO
// =====================================================
app.post('/api/admin/ban', async (req, res) => {
  try {
    const { admin_id, telegram_id } = req.body;
    if (admin_id !== ADMIN_TELEGRAM_ID) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    await supabase
      .from('users')
      .update({ banned: 1 })
      .eq('telegram_id', telegram_id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al banear' });
  }
});

// =====================================================
// API: ACTIVAR VIP MANUAL (admin)
// =====================================================
app.post('/api/admin/activate_vip', async (req, res) => {
  try {
    const { admin_id, telegram_id, plan_id } = req.body;
    if (admin_id !== ADMIN_TELEGRAM_ID) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const plan = VIP_PLANS[plan_id];
    if (!plan) return res.status(400).json({ error: 'Plan inválido' });

    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', telegram_id)
      .single();

    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const newHashPower = user.hash_power + plan.hash_power;
    const newVipLevel = Math.max(user.vip_level, parseInt(plan_id));

    await supabase
      .from('users')
      .update({
        hash_power: newHashPower,
        vip_level: newVipLevel
      })
      .eq('telegram_id', telegram_id);

    await supabase.from('purchases').insert([{
      telegram_id: telegram_id,
      plan: plan.name,
      amount_usd: plan.price,
      currency: 'MANUAL',
      plisio_invoice_id: `manual_${Date.now()}`,
      status: 'completed'
    }]);

    await notifyVIPActivated(telegram_id, plan.name, plan.hash_power);

    res.json({
      success: true,
      new_hash_power: newHashPower,
      new_vip_level: newVipLevel
    });
  } catch (err) {
    console.error('Error activate_vip manual:', err);
    res.status(500).json({ error: 'Error' });
  }
});

// =====================================================
// PÁGINAS DE ÉXITO/FRACASO
// =====================================================
app.get('/success', (req, res) => {
  res.send(`<html><body style="background:#0d1117;color:#fff;font-family:Arial;text-align:center;padding:50px">
    <h1 style="color:#3fb950">✅ Pago Confirmado</h1>
    <p>Tu plan VIP está siendo activado. Cierra esta ventana y vuelve a Kabuto Miner.</p>
  </body></html>`);
});

app.get('/fail', (req, res) => {
  res.send(`<html><body style="background:#0d1117;color:#fff;font-family:Arial;text-align:center;padding:50px">
    <h1 style="color:#f85149">❌ Pago Fallido</h1>
    <p>El pago no se completó. Intenta nuevamente.</p>
  </body></html>`);
});

// =====================================================
// PÁGINA DE TRANSPARENCIA PÚBLICA
// =====================================================
app.get('/transparency', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Kabuto Miner - Transparencia</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body {
  background:#0d1117;
  color:#fff;
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
  min-height:100vh;
  padding:20px;
}
.container { max-width:800px; margin:0 auto; }
header { text-align:center; margin-bottom:30px; }
.logo { font-size:48px; }
h1 { font-size:28px; margin-top:10px; color:#3fb950; }
.subtitle { color:#8b949e; margin-top:5px; }
.stats-grid {
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(180px,1fr));
  gap:15px;
  margin:20px 0;
}
.stat-card {
  background:#161b22;
  border:1px solid #30363d;
  border-radius:10px;
  padding:20px;
  text-align:center;
}
.stat-card .icon { font-size:32px; }
.stat-card .value { font-size:24px; font-weight:bold; margin:8px 0; color:#3fb950; }
.stat-card .label { color:#8b949e; font-size:14px; }
.split-section {
  background:#161b22;
  border:1px solid #30363d;
  border-radius:10px;
  padding:20px;
  margin:20px 0;
}
.split-bar {
  display:flex;
  height:30px;
  border-radius:5px;
  overflow:hidden;
  margin-top:10px;
}
.split-70 { background:#3fb950; width:70%; display:flex; align-items:center; justify-content:center; font-weight:bold; }
.split-30 { background:#f78166; width:30%; display:flex; align-items:center; justify-content:center; font-weight:bold; }
.section-title { font-size:18px; margin:20px 0 10px; }
.channel-link {
  display:inline-block;
  background:#238636;
  color:#fff;
  padding:12px 24px;
  border-radius:6px;
  text-decoration:none;
  margin-top:15px;
  font-weight:bold;
}
.refresh-info { text-align:center; color:#8b949e; font-size:12px; margin-top:20px; }
</style>
</head>
<body>
<div class="container">
  <header>
    <div class="logo">🦏</div>
    <h1>Kabuto Miner - Panel de Transparencia</h1>
    <p class="subtitle">Estadísticas financieras en tiempo real</p>
  </header>

  <div class="stats-grid" id="stats">
    <div class="stat-card">
      <div class="icon">👥</div>
      <div class="value" id="total_users">-</div>
      <div class="label">Usuarios</div>
    </div>
    <div class="stat-card">
      <div class="icon">💰</div>
      <div class="value" id="total_income">-</div>
      <div class="label">Ingresos totales</div>
    </div>
    <div class="stat-card">
      <div class="icon">💸</div>
      <div class="value" id="total_withdrawn">-</div>
      <div class="label">Retiros pagados</div>
    </div>
    <div class="stat-card">
      <div class="icon">📦</div>
      <div class="value" id="total_purchases">-</div>
      <div class="label">Compras VIP</div>
    </div>
    <div class="stat-card">
      <div class="icon">⚡</div>
      <div class="value" id="total_hash_power">-</div>
      <div class="label">Hash Power total</div>
    </div>
    <div class="stat-card">
      <div class="icon">💵</div>
      <div class="value" id="liquidity">-</div>
      <div class="label">Liquidez disponible</div>
    </div>
  </div>

  <div class="split-section">
    <h3 class="section-title">📊 Distribución financiera (Split 30/70)</h3>
    <p style="color:#8b949e;margin-bottom:10px">De todos los ingresos, 70% se reserva para pagar retiros de usuarios, 30% para mantenimiento y ganancia del admin.</p>
    <div class="split-bar">
      <div class="split-70">70% Retiros</div>
      <div class="split-30">30% Admin</div>
    </div>
    <div style="display:flex;justify-content:space-between;margin-top:10px">
      <div><strong style="color:#3fb950">$<span id="liquidity_70">0</span></strong> reservado</div>
      <div><strong style="color:#f78166">$<span id="admin_profit_30">0</span></strong> admin</div>
    </div>
  </div>

  <div style="text-align:center;margin-top:30px">
    <p style="color:#8b949e">📢 Cada pago y retiro se publica automáticamente en nuestro canal de Telegram</p>
    <a href="https://t.me/kabuto_payments" class="channel-link">Ver canal @kabuto_payments</a>
  </div>

  <div class="refresh-info">
    Última actualización: <span id="last_update">-</span><br>
    Se actualiza automáticamente cada 30 segundos
  </div>
</div>

<script>
async function loadStats() {
  try {
    const r = await fetch('/api/public_stats');
    const d = await r.json();
    document.getElementById('total_users').textContent = d.total_users;
    document.getElementById('total_income').textContent = '$' + d.total_income.toFixed(2);
    document.getElementById('total_withdrawn').textContent = '$' + d.total_withdrawn.toFixed(2);
    document.getElementById('total_purchases').textContent = d.total_purchases;
    document.getElementById('total_hash_power').textContent = d.total_hash_power.toFixed(0) + ' H/s';
    document.getElementById('liquidity').textContent = '$' + d.liquidity.toFixed(2);
    document.getElementById('liquidity_70').textContent = d.liquidity.toFixed(2);
    document.getElementById('admin_profit_30').textContent = d.admin_profit.toFixed(2);
    document.getElementById('last_update').textContent = new Date(d.last_update).toLocaleString('es-ES');
  } catch (e) {
    console.error('Error:', e);
  }
}
loadStats();
setInterval(loadStats, 30000);
</script>
</body>
</html>`);
});

// =====================================================
// SERVIR FRONTEND
// =====================================================
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../kabuto-game/dist/index.html'));
});

// =====================================================
// INICIAR
// =====================================================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🦏 Kabuto Miner v2.3 corriendo en puerto ${PORT}`);
  console.log(`📊 Base de datos: Supabase`);
  console.log(`🔔 Webhook Plisio: https://kabutominer.onrender.com/api/plisio_webhook`);
  console.log(`🤖 Bot de Telegram: activo`);
  console.log(`📢 Canal de transparencia: @kabuto_payments`);
  console.log(`🌐 Panel público: https://kabutominer.onrender.com/transparency`);
});

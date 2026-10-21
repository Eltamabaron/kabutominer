// =====================================================
// KABUTO MINER v2.1 - SERVIDOR CON SUPABASE + WEBHOOK PLISIO
// =====================================================
// Reemplaza backend/server.js con este archivo
// =====================================================

const express = require('express');
const crypto = require('crypto');
const cors = require('cors');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

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

// Webhook Plisio necesita body crudo para verificar firma
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
// FUNCIÓN: Activar VIP (centralizada)
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
// API: VERIFICAR ESTADO DE FACTURA (frontend cada 5s)
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

    // Si está completada, activar VIP (fallback del webhook)
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
// WEBHOOK PLISIO (con verificación de firma opcional)
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

    // Verificación de firma (opcional, si configuraste PLISIO_SECRET_KEY)
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
// API: SOLICITAR RETIRO
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
      txid: response.data.data.tx_id || ''
    }]);

    res.json({
      success: true,
      tx_id: response.data.data.tx_id,
      new_balance: user.balance - amount
    });
  } catch (err) {
    console.error('Error withdraw:', err.response?.data || err.message);
    res.status(500).json({ error: 'Error al procesar retiro' });
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
// API: ACTIVAR VIP MANUAL (admin fallback)
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
    <p style="color:#8b949e">Si tu VIP no aparece en 30 segundos, vuelve a abrir el juego.</p>
  </body></html>`);
});

app.get('/fail', (req, res) => {
  res.send(`<html><body style="background:#0d1117;color:#fff;font-family:Arial;text-align:center;padding:50px">
    <h1 style="color:#f85149">❌ Pago Fallido</h1>
    <p>El pago no se completó. Intenta nuevamente desde Kabuto Miner.</p>
  </body></html>`);
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
  console.log(`🦏 Kabuto Miner v2.1 corriendo en puerto ${PORT}`);
  console.log(`📊 Base de datos: Supabase`);
  console.log(`🔔 Webhook Plisio: https://kabutominer.onrender.com/api/plisio_webhook`);
});

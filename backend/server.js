// =====================================================
// KABUTO MINER - SERVIDOR CON SUPABASE
// =====================================================
// Reemplaza el server.js anterior con este archivo
// Los datos ahora se guardan en Supabase (PostgreSQL)
// y NUNCA se pierden cuando Render se reinicia.
// =====================================================

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// =====================================================
// CONFIGURACIÓN SUPABASE
// =====================================================
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://TU-PROYECTO.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'TU-CLAVE-ANON';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// =====================================================
// CONFIGURACIÓN PLISIO
// =====================================================
const PLISIO_API_KEY = process.env.PLISIO_API_KEY || 'TU-API-KEY';
const ADMIN_TELEGRAM_ID = '1159596878';

// =====================================================
// CONFIGURACIÓN PLANS VIP
// =====================================================
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
app.use(express.json());
app.use(express.static(path.join(__dirname, '../kabuto-game/dist')));

// =====================================================
// FUNCIÓN: Obtener o crear usuario
// =====================================================
async function getOrCreateUser(telegramId, username = '', firstName = '') {
  try {
    // Buscar usuario existente
    const { data: existing } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', telegramId)
      .single();

    if (existing) {
      // Actualizar último login y nombre si cambió
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

    // Crear nuevo usuario
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
// API: LOGIN
// =====================================================
app.post('/api/login', async (req, res) => {
  try {
    const { telegram_id, username, first_name } = req.body;

    if (!telegram_id) {
      return res.status(400).json({ error: 'telegram_id requerido' });
    }

    const user = await getOrCreateUser(telegram_id, username, first_name);
    if (!user) {
      return res.status(500).json({ error: 'Error al crear/obtener usuario' });
    }

    if (user.banned) {
      return res.status(403).json({ error: 'Usuario baneado' });
    }

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
// API: GUARDAR PROGRESO (cada 10s)
// =====================================================
app.post('/api/save', async (req, res) => {
  try {
    const { telegram_id, balance, hash_power, total_mined } = req.body;

    if (!telegram_id) {
      return res.status(400).json({ error: 'telegram_id requerido' });
    }

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
// API: OBTENER ESTADO DEL JUGADOR
// =====================================================
app.get('/api/state/:telegram_id', async (req, res) => {
  try {
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', req.params.telegram_id)
      .single();

    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

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

    // Crear factura en Plisio
    const response = await axios.post('https://plisio.net/api/v1/invoices/new', {
      source_currency: 'USD',
      source_amount: plan.price,
      currency: payCurrency,
      order_name: `Kabuto Miner - ${plan.name}`,
      order_number: `${telegram_id}_${Date.now()}`,
      callback_url: `https://kabutominer.onrender.com/api/plisio_webhook`,
      success_callback_url: 'https://kabutominer.onrender.com/success',
      fail_callback_url: 'https://kabutominer.onrender.com/fail',
      email: null
    }, {
      params: { api_key: PLISIO_API_KEY }
    });

    if (response.data.status !== 'success') {
      return res.status(400).json({ error: response.data.message || 'Error Plisio' });
    }

    // Guardar compra en BD
    await supabase.from('purchases').insert([{
      telegram_id: telegram_id,
      plan: plan.name,
      amount_usd: plan.price,
      currency: payCurrency,
      plisio_invoice_id: response.data.data.tx_id || response.data.data.id,
      status: 'pending'
    }]);

    res.json({
      invoice_url: response.data.data.invoice_url,
      tx_id: response.data.data.tx_id,
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
    res.json({
      status: op.status,
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
// WEBHOOK PLISIO (activación automática VIP)
// =====================================================
app.post('/api/plisio_webhook', async (req, res) => {
  try {
    console.log('Webhook Plisio:', req.body);
    const { tx_id, status, order_number } = req.body;

    if (status === 'completed' || status === 'confirmed') {
      // Buscar compra por invoice_id
      const { data: purchase } = await supabase
        .from('purchases')
        .select('*')
        .eq('plisio_invoice_id', tx_id)
        .single();

      if (purchase && purchase.status === 'pending') {
        const planId = Object.keys(VIP_PLANS).find(
          k => VIP_PLANS[k].name === purchase.plan
        );
        const plan = VIP_PLANS[planId];

        // Actualizar usuario: sumar hash power y nivel VIP
        const { data: user } = await supabase
          .from('users')
          .select('*')
          .eq('telegram_id', purchase.telegram_id)
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
            .eq('telegram_id', user.telegram_id);
        }

        // Marcar compra como completada
        await supabase
          .from('purchases')
          .update({ status: 'completed' })
          .eq('id', purchase.id);

        console.log(`✅ VIP activado para ${purchase.telegram_id}: ${purchase.plan}`);
      }
    }

    res.json({ status: 'ok' });
  } catch (err) {
    console.error('Error webhook:', err);
    res.status(500).json({ error: 'Error webhook' });
  }
});

// =====================================================
// API: COMPLETAR TAREA
// =====================================================
app.post('/api/complete_task', async (req, res) => {
  try {
    const { telegram_id, task_id, reward } = req.body;

    // Verificar si ya completó la tarea
    const { data: existing } = await supabase
      .from('tasks_completed')
      .select('*')
      .eq('telegram_id', telegram_id)
      .eq('task_id', task_id)
      .single();

    if (existing) {
      return res.json({ success: false, message: 'Ya completada' });
    }

    // Guardar tarea completada
    await supabase.from('tasks_completed').insert([{
      telegram_id: telegram_id,
      task_id: task_id,
      reward: reward
    }]);

    // Sumar recompensa al balance
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

    // Verificar que el referido no tenga ya un referente
    const { data: existing } = await supabase
      .from('referrals')
      .select('*')
      .eq('referred_id', referred_id)
      .single();

    if (existing) {
      return res.json({ success: false, message: 'Ya tiene referente' });
    }

    // Crear referencia
    await supabase.from('referrals').insert([{
      referrer_id: referrer_id,
      referred_id: referred_id,
      commission: 0
    }]);

    // Dar bono de bienvenida al referido (10% del primer depósito cuando haga)
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

    // Validar moneda
    if (!SUPPORTED_CURRENCIES.includes(currency)) {
      return res.status(400).json({ error: 'Moneda no soportada' });
    }

    // Validar monto mínimo
    if (amount < 1) {
      return res.status(400).json({ error: 'Mínimo $1' });
    }

    // Obtener usuario
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', telegram_id)
      .single();

    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (user.balance < amount) {
      return res.status(400).json({ error: 'Saldo insuficiente' });
    }

    // Crear retiro en Plisio
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

    // Restar del balance del usuario
    await supabase
      .from('users')
      .update({ balance: user.balance - amount })
      .eq('telegram_id', telegram_id);

    // Guardar retiro en BD
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

    // Obtener todos los usuarios
    const { data: users } = await supabase.from('users').select('*');

    // Obtener todas las compras completadas
    const { data: purchases } = await supabase
      .from('purchases')
      .select('*')
      .eq('status', 'completed');

    // Obtener todos los retiros
    const { data: withdrawals } = await supabase.from('withdrawals').select('*');

    // Calcular ingresos totales
    const totalIncome = (purchases || []).reduce((sum, p) => sum + p.amount_usd, 0);
    const totalWithdrawn = (withdrawals || []).reduce((sum, w) => sum + w.amount, 0);
    const liquidity = totalIncome * 0.70;
    const adminProfit = totalIncome * 0.30;

    // Total en balances de usuarios
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
// API: BANEAR USUARIO (admin)
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
// PÁGINAS DE ÉXITO/FRACASO PLISIO
// =====================================================
app.get('/success', (req, res) => {
  res.send('<html><body style="background:#0d1117;color:#fff;font-family:Arial;text-align:center;padding:50px"><h1>✅ Pago Confirmado</h1><p>Tu plan VIP ha sido activado. Cierra esta ventana y vuelve a Kabuto Miner.</p></body></html>');
});

app.get('/fail', (req, res) => {
  res.send('<html><body style="background:#0d1117;color:#fff;font-family:Arial;text-align:center;padding:50px"><h1>❌ Pago Fallido</h1><p>El pago no se completó. Intenta nuevamente.</p></body></html>');
});

// =====================================================
// SERVIR FRONTEND (React)
// =====================================================
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../kabuto-game/dist/index.html'));
});

// =====================================================
// INICIAR SERVIDOR
// =====================================================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🦏 Kabuto Miner corriendo en puerto ${PORT}`);
  console.log(`📊 Base de datos: Supabase`);
});

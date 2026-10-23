// =====================================================
// KABUTO MINER v2.5 - SERVER.JS ACTUALIZADO
// =====================================================
// CAMBIOS:
// - Agregado endpoint /api/admin/remove_vip para quitar VIP
// - Mejorado /api/admin/activate_vip con respuesta completa
// - Mejor manejo de errores en create_invoice
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

// 🚀 FIX: Todos los planes ≥ $3 USD (mínimo de Plisio)
const VIP_PLANS = {
  1: { name: 'VIP 1', price: 3, hash_power: 50 },
  2: { name: 'VIP 2', price: 5, hash_power: 200 },
  3: { name: 'VIP 3', price: 10, hash_power: 500 },
  4: { name: 'VIP 4', price: 25, hash_power: 1500 },
  5: { name: 'VIP 5', price: 50, hash_power: 5000 },
};

// 🚀 CÓDIGOS CORRECTOS DE PLISIO (no USDTRC20, sino USDT_TRX, etc.)
const SUPPORTED_CURRENCIES = [
  'USDT',           // Tether ERC-20 (Ethereum)
  'USDT_TRX',       // Tether TRC-20 (Tron) - comisión más baja
  'USDT_BSC',       // Tether BEP-20 (BNB Chain)
  'USDC',           // USD Coin ERC-20 (Ethereum)
  'LTC',            // Litecoin
  'TRX',            // Tron
  'BNB',            // BNB Chain
  'SOL',            // Solana
  'DOGE'            // Dogecoin
];

// =====================================================
// MIDDLEWARE
// =====================================================
app.use(cors());
app.use('/api/plisio_webhook', express.raw({ type: '*/*' }));
app.use(express.json({ limit: '10mb' }));
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
        hash_power: 10, // 🚀 FIX: Empezar con 10 H/s
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

      // Notificar al usuario via Telegram
      if (notifyVIPActivated) {
        await notifyVIPActivated(telegramId, planName, plan.hash_power);
      }

      // Publicar en canal de transparencia
      if (postToChannel) {
        const maskedName = user.username ? `@${user.username}` : (user.first_name || 'Anónimo');
        await postToChannel(
          `🦏 *Nueva compra VIP confirmada*\n\n📦 Plan: *${planName}*\n💰 Monto: *$${plan.price} USD*\n💱 Moneda: ${purchase.currency}\n⚡ Hash Power añadido: *+${plan.hash_power} H/s*\n👤 Usuario: ${maskedName}\n🕐 Hora: ${new Date().toUTCString()}\n\n✅ Pago verificado vía Plisio`
        );
      }
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
// API: CREAR FACTURA PLISIO - MEJORADA
// =====================================================
app.post('/api/create_invoice', async (req, res) => {
  try {
    console.log('🛒 create_invoice - Body recibido:', req.body);

    const { telegram_id, plan_id, currency } = req.body;

    // Validaciones
    if (!telegram_id) {
      console.error('❌ telegram_id faltante');
      return res.status(400).json({ error: 'telegram_id requerido' });
    }

    const plan = VIP_PLANS[plan_id];
    if (!plan) {
      console.error('❌ Plan inválido:', plan_id);
      return res.status(400).json({ error: 'Plan inválido' });
    }

    const payCurrency = currency || 'USDT';
    if (!SUPPORTED_CURRENCIES.includes(payCurrency)) {
      console.error('❌ Moneda no soportada:', payCurrency);
      return res.status(400).json({ error: 'Moneda no soportada' });
    }

    const user = await getOrCreateUser(telegram_id);
    if (!user) {
      console.error('❌ Usuario inválido:', telegram_id);
      return res.status(400).json({ error: 'Usuario inválido' });
    }

    const orderNumber = `${telegram_id}_${plan_id}_${Date.now()}`;
    console.log('🛒 Creando factura en Plisio:', { plan: plan.name, currency: payCurrency, amount: plan.price });

    // 🚀 FIX: Plisio usa GET (no POST) y la URL correcta es api.plisio.net
    const plisioParams = new URLSearchParams({
      source_currency: 'USD',
      source_amount: plan.price,
      currency: payCurrency,
      order_name: `Kabuto Miner - ${plan.name}`,
      order_number: orderNumber,
      callback_url: 'https://kabutominer.onrender.com/api/plisio_webhook',
      success_callback_url: 'https://kabutominer.onrender.com/success',
      fail_callback_url: 'https://kabutominer.onrender.com/fail',
      api_key: PLISIO_API_KEY
    });

    const plisioResponse = await axios.get(
      `https://api.plisio.net/api/v1/invoices/new?${plisioParams.toString()}`,
      { timeout: 30000 }
    );

    console.log('🛒 Respuesta Plisio:', plisioResponse.data.status, plisioResponse.data.message || '');

    if (plisioResponse.data.status !== 'success') {
      console.error('❌ Plisio error:', plisioResponse.data);
      return res.status(400).json({
        error: plisioResponse.data.message || 'Error al crear factura en Plisio'
      });
    }

    const invoiceId = plisioResponse.data.data.tx_id || plisioResponse.data.data.id;

    // Guardar compra pendiente en BD
    const { error: insertError } = await supabase.from('purchases').insert([{
      telegram_id: telegram_id,
      plan: plan.name,
      amount_usd: plan.price,
      currency: payCurrency,
      plisio_invoice_id: invoiceId,
      status: 'pending'
    }]);

    if (insertError) {
      console.error('⚠️ Error guardando compra (no crítico):', insertError);
    }

    console.log('✅ Factura creada:', invoiceId);

    res.json({
      invoice_url: plisioResponse.data.data.invoice_url,
      tx_id: invoiceId,
      order_number: orderNumber,
      amount: plisioResponse.data.data.amount,
      currency: payCurrency,
      plan: plan
    });
  } catch (err) {
    console.error('❌ Error create_invoice:', err.response?.data || err.message);

    // 🚀 FIX: Extraer el mensaje real de Plisio del error
    let errorMsg = 'Error al crear factura';
    if (err.response?.data) {
      const plisioErr = err.response.data;
      if (plisioErr.data?.message) {
        errorMsg = plisioErr.data.message;
      } else if (plisioErr.message) {
        errorMsg = plisioErr.message;
      }
    } else if (err.message) {
      errorMsg = err.message;
    }

    res.status(500).json({
      error: errorMsg
    });
  }
});

// =====================================================
// API: VERIFICAR ESTADO DE FACTURA
// =====================================================
app.get('/api/check_invoice/:tx_id', async (req, res) => {
  try {
    const response = await axios.get(
      `https://api.plisio.net/api/v1/operations/${req.params.tx_id}`,
      { params: { api_key: PLISIO_API_KEY }, timeout: 15000 }
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
      const newBalance = user.balance + reward;
      await supabase
        .from('users')
        .update({ balance: newBalance })
        .eq('telegram_id', telegram_id);

      res.json({ success: true, new_balance: newBalance });
    } else {
      res.json({ success: false, message: 'Usuario no encontrado' });
    }
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

    // 🚀 FIX: Plisio usa GET en todos los endpoints, URL correcta api.plisio.net
    const withdrawParams = new URLSearchParams({
      currency: currency,
      amount: amount,
      to: address,
      api_key: PLISIO_API_KEY
    });

    const response = await axios.get(
      `https://api.plisio.net/api/v1/withdraw?${withdrawParams.toString()}`,
      { timeout: 30000 }
    );

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

    if (notifyWithdrawal) {
      await notifyWithdrawal(telegram_id, amount, currency, txid);
    }

    if (postToChannel) {
      const maskedName = user.username ? `@${user.username}` : (user.first_name || 'Anónimo');
      const maskedAddress = address.length > 12
        ? `${address.substring(0, 8)}...${address.substring(address.length - 6)}`
        : address;

      await postToChannel(
        `💸 *Retiro procesado*\n\n👤 Usuario: ${maskedName}\n💰 Monto: *$${amount} ${currency}*\n📍 Dirección: \`${maskedAddress}\`\n🔗 TXID: \`${txid || 'pending'}\`\n🕐 Hora: ${new Date().toUTCString()}`
      );
    }

    res.json({
      success: true,
      tx_id: txid,
      new_balance: user.balance - amount
    });
  } catch (err) {
    console.error('Error withdraw:', err.response?.data || err.message);
    res.status(500).json({
      error: 'Error al procesar retiro: ' + (err.response?.data?.message || err.message)
    });
  }
});

// =====================================================
// API: ESTADÍSTICAS PÚBLICAS
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

    const { data: user } = await supabase
      .from('users')
      .select('banned')
      .eq('telegram_id', telegram_id)
      .single();

    const newBannedStatus = user?.banned ? 0 : 1;

    await supabase
      .from('users')
      .update({ banned: newBannedStatus })
      .eq('telegram_id', telegram_id);

    res.json({ success: true, banned: newBannedStatus });
  } catch (err) {
    res.status(500).json({ error: 'Error al banear' });
  }
});

// =====================================================
// API: ACTIVAR VIP MANUAL - MEJORADA
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

    const { error: updateError } = await supabase
      .from('users')
      .update({
        hash_power: newHashPower,
        vip_level: newVipLevel
      })
      .eq('telegram_id', telegram_id);

    if (updateError) throw updateError;

    await supabase.from('purchases').insert([{
      telegram_id: telegram_id,
      plan: plan.name,
      amount_usd: plan.price,
      currency: 'MANUAL',
      plisio_invoice_id: `manual_${Date.now()}`,
      status: 'completed'
    }]);

    if (notifyVIPActivated) {
      await notifyVIPActivated(telegram_id, plan.name, plan.hash_power);
    }

    console.log(`✅ VIP manual activado: ${telegram_id} → ${plan.name} (HP: ${newHashPower})`);

    res.json({
      success: true,
      new_hash_power: newHashPower,
      new_vip_level: newVipLevel,
      message: `VIP ${plan_id} activado correctamente`
    });
  } catch (err) {
    console.error('Error activate_vip manual:', err);
    res.status(500).json({ error: 'Error: ' + err.message });
  }
});

// =====================================================
// 🆕 API: REMOVER VIP MANUAL
// =====================================================
app.post('/api/admin/remove_vip', async (req, res) => {
  try {
    const { admin_id, telegram_id } = req.body;
    if (admin_id !== ADMIN_TELEGRAM_ID) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', telegram_id)
      .single();

    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    // Resetear VIP: hash_power a 10 (base), vip_level a 0
    const { error: updateError } = await supabase
      .from('users')
      .update({
        hash_power: 10,
        vip_level: 0
      })
      .eq('telegram_id', telegram_id);

    if (updateError) throw updateError;

    // Registrar en purchases como removido (para histórico)
    await supabase.from('purchases').insert([{
      telegram_id: telegram_id,
      plan: 'REMOVED',
      amount_usd: 0,
      currency: 'MANUAL',
      plisio_invoice_id: `removed_${Date.now()}`,
      status: 'removed'
    }]);

    console.log(`✅ VIP removido: ${telegram_id} (HP reseteado a 10)`);

    res.json({
      success: true,
      new_hash_power: 10,
      new_vip_level: 0,
      message: 'VIP removido correctamente'
    });
  } catch (err) {
    console.error('Error remove_vip:', err);
    res.status(500).json({ error: 'Error: ' + err.message });
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
// PÁGINA DE TRANSPARENCIA
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
body { background:#0d1117; color:#fff; font-family:Arial; padding:20px; }
.container { max-width:800px; margin:0 auto; }
header { text-align:center; margin-bottom:30px; }
.logo { font-size:48px; }
h1 { color:#3fb950; }
.stats-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:15px; margin:20px 0; }
.stat-card { background:#161b22; border:1px solid #30363d; border-radius:10px; padding:20px; text-align:center; }
.stat-card .value { font-size:24px; font-weight:bold; color:#3fb950; margin:8px 0; }
.stat-card .label { color:#8b949e; font-size:14px; }
.split-bar { display:flex; height:30px; border-radius:5px; overflow:hidden; margin-top:10px; }
.split-70 { background:#3fb950; width:70%; display:flex; align-items:center; justify-content:center; font-weight:bold; }
.split-30 { background:#f78166; width:30%; display:flex; align-items:center; justify-content:center; font-weight:bold; }
</style>
</head>
<body>
<div class="container">
  <header>
    <div class="logo">🦏</div>
    <h1>Kabuto Miner - Transparencia</h1>
  </header>
  <div class="stats-grid" id="stats"></div>
  <div style="background:#161b22;border:1px solid #30363d;border-radius:10px;padding:20px;margin:20px 0">
    <h3>Distribución 30/70</h3>
    <div class="split-bar">
      <div class="split-70">70% Retiros</div>
      <div class="split-30">30% Admin</div>
    </div>
  </div>
  <div style="text-align:center;margin-top:30px">
    <a href="https://t.me/kabuto_payments" style="background:#238636;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold">Ver canal @kabuto_payments</a>
  </div>
</div>
<script>
async function loadStats() {
  try {
    const r = await fetch('/api/public_stats');
    const d = await r.json();
    document.getElementById('stats').innerHTML = [
      ['👥','Usuarios', d.total_users],
      ['💰','Ingresos', '$'+d.total_income.toFixed(2)],
      ['💸','Retiros', '$'+d.total_withdrawn.toFixed(2)],
      ['📦','Compras VIP', d.total_purchases],
      ['⚡','Hash Power', d.total_hash_power.toFixed(0)+' H/s'],
      ['💵','Liquidez', '$'+d.liquidity.toFixed(2)]
    ].map(([i,l,v]) => '<div class="stat-card"><div style="font-size:32px">'+i+'</div><div class="value">'+v+'</div><div class="label">'+l+'</div></div>').join('');
  } catch(e) { console.error(e); }
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
  console.log(`🦏 Kabuto Miner v2.5 corriendo en puerto ${PORT}`);
  console.log(`📊 Base de datos: Supabase`);
  console.log(`🔔 Webhook: https://kabutominer.onrender.com/api/plisio_webhook`);
  console.log(`🤖 Bot: activo`);
  console.log(`📢 Canal: @kabuto_payments`);
});

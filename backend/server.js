// =====================================================
// KABUTO MINER v3.0 - SERVIDOR COMPLETO
// =====================================================
// Incluye TODAS las funciones:
// - Supabase (base de datos persistente)
// - Bot de Telegram (comandos, notificaciones)
// - Canal de transparencia @kabuto_payments
// - Plisio (pagos en 9 criptomonedas, GET api.plisio.net)
// - Webhook + fallback para activación VIP
// - Sistema de referidos con comisiones (10% compras, 5% minado)
// - Login streak + Ruleta diaria
// - Boosts temporales (4 tipos)
// - Logros (12 medallas) + Ranking Top 10
// - Admin mejorado (búsqueda, gráfico, broadcast)
// - Anti-fraude (multicuentas + límites retiros)
// - Niveles de cuenta (Bronce/Plata/Oro/Diamante)
// - Notificaciones push diarias
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
const BOT_TOKEN_FOR_NOTIFS = process.env.TELEGRAM_BOT_TOKEN || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const VIP_PLANS = {
  1: { name: 'VIP 1', price: 3, hash_power: 50 },
  2: { name: 'VIP 2', price: 5, hash_power: 200 },
  3: { name: 'VIP 3', price: 10, hash_power: 500 },
  4: { name: 'VIP 4', price: 25, hash_power: 1500 },
  5: { name: 'VIP 5', price: 50, hash_power: 5000 },
};

// Códigos correctos de Plisio
const SUPPORTED_CURRENCIES = ['USDT', 'USDT_TRX', 'USDT_BSC', 'USDC', 'LTC', 'TRX', 'BNB', 'SOL', 'DOGE'];

const BOOST_TYPES = {
  '2x_1h':   { name: '2x Minado 1h',  multiplier: 2, duration_hours: 1,  cost: 100 },
  '2x_24h':  { name: '2x Minado 24h', multiplier: 2, duration_hours: 24, cost: 1000 },
  '3x_1h':   { name: '3x Minado 1h',  multiplier: 3, duration_hours: 1,  cost: 250 },
  'auto_24h':{ name: 'Auto-Minero 24h', multiplier: 1, duration_hours: 24, cost: 500 }
};

const MINING_MULTIPLIER = 0.0001;

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
      .from('users').select('*').eq('telegram_id', telegramId).single();

    if (existing) {
      await supabase.from('users').update({
        last_login: new Date().toISOString(),
        username: username || existing.username,
        first_name: firstName || existing.first_name
      }).eq('telegram_id', telegramId);
      return existing;
    }

    const { data: newUser, error } = await supabase.from('users').insert([{
      telegram_id: telegramId, username, first_name: firstName,
      balance: 0, hash_power: 10, vip_level: 0, total_mined: 0, banned: 0
    }]).select().single();

    if (error) throw error;
    return newUser;
  } catch (err) { console.error('Error getOrCreateUser:', err); return null; }
}

// =====================================================
// FUNCIÓN: Detectar multicuentas (anti-fraude)
// =====================================================
async function checkMultiAccount(telegramId, deviceId) {
  try {
    if (!deviceId) return { flagged: false };
    const { data: existingWithDevice } = await supabase
      .from('users').select('telegram_id, first_name')
      .eq('device_id', deviceId).neq('telegram_id', telegramId).limit(5);

    if (existingWithDevice && existingWithDevice.length > 0) {
      console.log(`🚨 Multicuenta detectada: ${telegramId}`);
      await supabase.from('users').update({
        flagged: 1,
        flag_reason: `Multicuenta: comparte dispositivo con ${existingWithDevice.map(u => u.telegram_id).join(', ')}`
      }).eq('telegram_id', telegramId);

      const { data: flaggedDev } = await supabase.from('flagged_devices').select('*').eq('device_id', deviceId).single();
      if (flaggedDev) {
        await supabase.from('flagged_devices').update({
          user_count: (flaggedDev.user_count || 0) + 1, last_seen: new Date().toISOString()
        }).eq('device_id', deviceId);
      } else {
        await supabase.from('flagged_devices').insert([{ device_id: deviceId, user_count: existingWithDevice.length + 1 }]);
      }
      return { flagged: true, reason: `Cuenta compartida con ${existingWithDevice.length} otro(s) usuario(s)` };
    }
    return { flagged: false };
  } catch (err) { console.error('Error checkMultiAccount:', err); return { flagged: false }; }
}

// =====================================================
// FUNCIÓN: Calcular nivel de cuenta
// =====================================================
function getAccountLevel(totalMined) {
  const tm = Number(totalMined) || 0;
  if (tm >= 10000) return { level: 4, name: 'Diamante', icon: '💎', color: '#b9f2ff', next: null, perk: 'Sin comisión de retiro' };
  if (tm >= 1000)  return { level: 3, name: 'Oro',      icon: '🥇', color: '#ffd700', next: 10000, perk: 'Bonus diario x1.5' };
  if (tm >= 100)   return { level: 2, name: 'Plata',    icon: '🥈', color: '#c0c0c0', next: 1000,  perk: 'Bonus diario x1.2' };
  return { level: 1, name: 'Bronce', icon: '🥉', color: '#cd7f32', next: 100, perk: 'Acceso básico' };
}

// =====================================================
// FUNCIÓN: Dar comisión al referente (10% compras)
// =====================================================
async function givePurchaseCommission(referredId, planName, amountUsd) {
  try {
    const { data: referral } = await supabase.from('referrals').select('*').eq('referred_id', referredId).single();
    if (!referral) return false;

    const referrerId = referral.referrer_id;
    const commission = parseFloat((amountUsd * 0.10).toFixed(2));

    await supabase.from('referrals').update({
      commission: (referral.commission || 0) + commission,
      total_commission_earned: (referral.total_commission_earned || 0) + commission,
      last_commission_at: new Date().toISOString()
    }).eq('id', referral.id);

    await supabase.from('referral_commissions').insert([{
      referrer_id: referrerId, referred_id: referredId,
      commission_type: 'purchase', amount: commission,
      source_amount: amountUsd, description: `10% de compra ${planName}`
    }]);

    const { data: referrer } = await supabase.from('users').select('*').eq('telegram_id', referrerId).single();
    if (referrer) {
      await supabase.from('users').update({
        total_referral_earned: (referrer.total_referral_earned || 0) + commission
      }).eq('telegram_id', referrerId);
      console.log(`💰 Comisión 10%: ${referrerId} recibió ${commission}`);
      try {
        const bot = require('./bot');
        if (bot.bot) {
          await bot.bot.sendMessage(referrerId,
            `💰 *¡Comisión de referido!*\n\n✅ Tu referido compró *${planName}*\n💵 Recibiste: *+${commission} $KABUTO*`,
            { parse_mode: 'Markdown' });
        }
      } catch (e) {}
    }
    return true;
  } catch (err) { console.error('Error givePurchaseCommission:', err); return false; }
}

// =====================================================
// FUNCIÓN: Dar comisión de minado (5%)
// =====================================================
async function giveMiningCommission(referredId, minedAmount) {
  try {
    const { data: referral } = await supabase.from('referrals').select('*').eq('referred_id', referredId).single();
    if (!referral) return false;

    const commission = parseFloat((minedAmount * 0.05).toFixed(6));
    if (commission < 0.0001) return false;

    const referrerId = referral.referrer_id;

    await supabase.from('referrals').update({
      commission: (referral.commission || 0) + commission,
      total_commission_earned: (referral.total_commission_earned || 0) + commission,
      last_commission_at: new Date().toISOString()
    }).eq('id', referral.id);

    await supabase.from('referral_commissions').insert([{
      referrer_id: referrerId, referred_id: referredId,
      commission_type: 'mining', amount: commission,
      source_amount: minedAmount, description: '5% de minado'
    }]);

    const { data: referrer } = await supabase.from('users').select('total_referral_earned').eq('telegram_id', referrerId).single();
    if (referrer) {
      await supabase.from('users').update({
        total_referral_earned: (referrer.total_referral_earned || 0) + commission
      }).eq('telegram_id', referrerId);
    }
    return true;
  } catch (err) { console.error('Error giveMiningCommission:', err); return false; }
}

// =====================================================
// FUNCIÓN: Verificar y desbloquear logros
// =====================================================
async function checkAchievements(telegramId) {
  try {
    const { data: user } = await supabase.from('users').select('*').eq('telegram_id', telegramId).single();
    if (!user) return [];

    const { data: existing } = await supabase.from('user_achievements').select('achievement_code').eq('telegram_id', telegramId);
    const existingCodes = (existing || []).map(e => e.achievement_code);

    const { data: referrals } = await supabase.from('referrals').select('referred_id').eq('referrer_id', telegramId);
    const { data: vipReferrals } = await supabase.from('referrals').select('referred_id, users!referrals_referred_id_fkey(vip_level)').eq('referrer_id', telegramId);
    const activeVipCount = (vipReferrals || []).filter(r => r.users?.[0]?.vip_level > 0).length;

    const newAchievements = [];
    const checks = [
      { code: 'first_login', condition: true },
      { code: 'first_vip', condition: user.vip_level > 0 },
      { code: 'vip_max', condition: user.vip_level >= 5 },
      { code: 'first_referral', condition: (referrals?.length || 0) >= 1 },
      { code: 'ten_referrals', condition: (referrals?.length || 0) >= 10 },
      { code: 'six_vip_referrals', condition: activeVipCount >= 6 },
      { code: 'level_5', condition: user.hash_power >= 200 },
      { code: 'level_7', condition: user.hash_power >= 5000 },
      { code: 'big_miner', condition: (user.total_mined || 0) >= 1000 },
      { code: 'streak_7', condition: (user.last_login_streak || 0) >= 7 }
    ];

    for (const check of checks) {
      if (check.condition && !existingCodes.includes(check.code)) {
        const { data: ach } = await supabase.from('achievements').select('*').eq('code', check.code).single();
        if (ach) {
          await supabase.from('user_achievements').insert([{ telegram_id: telegramId, achievement_code: check.code }]);
          const newBalance = (user.balance || 0) + (ach.reward || 0);
          await supabase.from('users').update({ balance: newBalance }).eq('telegram_id', telegramId);
          newAchievements.push({ code: ach.code, name: ach.name, icon: ach.icon, reward: ach.reward });
          console.log(`🏆 Logro: ${telegramId} → ${ach.name}`);
          try {
            const bot = require('./bot');
            if (bot.bot) {
              await bot.bot.sendMessage(telegramId,
                `🏆 *¡Logro Desbloqueado!*\n\n${ach.icon} *${ach.name}*\n${ach.description}\n\n💰 Recompensa: +${ach.reward} $KABUTO`,
                { parse_mode: 'Markdown' });
            }
          } catch (e) {}
        }
      }
    }
    return newAchievements;
  } catch (err) { console.error('Error checkAchievements:', err); return []; }
}

// =====================================================
// FUNCIÓN: Activar VIP (centralizada)
// =====================================================
async function activateVIP(telegramId, planName, invoiceId) {
  try {
    const { data: purchase } = await supabase.from('purchases').select('*')
      .eq('telegram_id', telegramId).eq('plan', planName).eq('status', 'pending')
      .order('created_at', { ascending: false }).limit(1).single();

    if (!purchase) { console.log('⚠️ No compra pendiente:', telegramId, planName); return false; }

    const planId = Object.keys(VIP_PLANS).find(k => VIP_PLANS[k].name === planName);
    if (!planId) return false;
    const plan = VIP_PLANS[planId];

    const { data: user } = await supabase.from('users').select('*').eq('telegram_id', telegramId).single();

    if (user) {
      const newHashPower = user.hash_power + plan.hash_power;
      const newVipLevel = Math.max(user.vip_level, parseInt(planId));
      await supabase.from('users').update({ hash_power: newHashPower, vip_level: newVipLevel }).eq('telegram_id', telegramId);
      console.log(`✅ VIP activado: ${telegramId} → ${planName}`);

      if (notifyVIPActivated) await notifyVIPActivated(telegramId, planName, plan.hash_power);

      if (postToChannel) {
        const maskedName = user.username ? `@${user.username}` : (user.first_name || 'Anónimo');
        await postToChannel(`🦏 *Nueva compra VIP*\n\n📦 Plan: *${planName}*\n💰 Monto: *$${plan.price} USD*\n💱 Moneda: ${purchase.currency}\n⚡ Hash Power: +${plan.hash_power} H/s\n👤 Usuario: ${maskedName}\n🕐 Hora: ${new Date().toUTCString()}`);
      }

      await givePurchaseCommission(telegramId, planName, plan.price);
      await checkAchievements(telegramId);
    }

    await supabase.from('purchases').update({ status: 'completed', plisio_invoice_id: invoiceId }).eq('id', purchase.id);
    return true;
  } catch (err) { console.error('Error activateVIP:', err); return false; }
}

// =====================================================
// API: LOGIN (con anti-fraude)
// =====================================================
app.post('/api/login', async (req, res) => {
  try {
    const { telegram_id, username, first_name, device_id } = req.body;
    if (!telegram_id) return res.status(400).json({ error: 'telegram_id requerido' });

    const user = await getOrCreateUser(telegram_id, username, first_name);
    if (!user) return res.status(500).json({ error: 'Error al crear/obtener usuario' });
    if (user.banned) return res.status(403).json({ error: 'Usuario baneado' });

    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';
    const deviceId = device_id || `${ip}_${userAgent}`.substring(0, 100);

    if (!user.device_id) {
      await supabase.from('users').update({ device_id: deviceId, last_ip: ip, user_agent: userAgent.substring(0, 200) }).eq('telegram_id', telegram_id);
    }

    const fraudCheck = await checkMultiAccount(telegram_id, deviceId);
    const accountLevel = getAccountLevel(user.total_mined || 0);

    res.json({
      telegram_id: user.telegram_id, username: user.username, first_name: user.first_name,
      balance: user.balance, hash_power: user.hash_power, vip_level: user.vip_level,
      total_mined: user.total_mined, is_admin: user.telegram_id === ADMIN_TELEGRAM_ID,
      account_level: accountLevel, flagged: fraudCheck.flagged, flag_reason: fraudCheck.reason || null
    });
  } catch (err) { console.error('Error login:', err); res.status(500).json({ error: 'Error interno' }); }
});

// =====================================================
// API: GUARDAR PROGRESO (con comisión minado 5%)
// =====================================================
app.post('/api/save', async (req, res) => {
  try {
    const { telegram_id, balance, hash_power, total_mined } = req.body;
    if (!telegram_id) return res.status(400).json({ error: 'telegram_id requerido' });

    try {
      const { data: currentUser } = await supabase.from('users').select('balance').eq('telegram_id', telegram_id).single();
      if (currentUser) {
        const balanceIncrease = Math.max(0, (balance || 0) - (currentUser.balance || 0));
        if (balanceIncrease > 0.001) await giveMiningCommission(telegram_id, balanceIncrease);
      }
    } catch (e) { console.error('Comisión minado (no crítico):', e.message); }

    const { error } = await supabase.from('users').update({
      balance, hash_power, total_mined, last_login: new Date().toISOString()
    }).eq('telegram_id', telegram_id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) { console.error('Error save:', err); res.status(500).json({ error: 'Error al guardar' }); }
});

// =====================================================
// API: OBTENER ESTADO
// =====================================================
app.get('/api/state/:telegram_id', async (req, res) => {
  try {
    const { data: user } = await supabase.from('users').select('*').eq('telegram_id', req.params.telegram_id).single();
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({
      telegram_id: user.telegram_id, username: user.username, first_name: user.first_name,
      balance: user.balance, hash_power: user.hash_power, vip_level: user.vip_level,
      total_mined: user.total_mined, is_admin: user.telegram_id === ADMIN_TELEGRAM_ID
    });
  } catch (err) { console.error('Error state:', err); res.status(500).json({ error: 'Error interno' }); }
});

// =====================================================
// API: CREAR FACTURA PLISIO (GET api.plisio.net)
// =====================================================
app.post('/api/create_invoice', async (req, res) => {
  try {
    const { telegram_id, plan_id, currency } = req.body;
    if (!telegram_id) return res.status(400).json({ error: 'telegram_id requerido' });

    const plan = VIP_PLANS[plan_id];
    if (!plan) return res.status(400).json({ error: 'Plan inválido' });

    const payCurrency = currency || 'USDT';
    if (!SUPPORTED_CURRENCIES.includes(payCurrency)) return res.status(400).json({ error: 'Moneda no soportada' });

    const user = await getOrCreateUser(telegram_id);
    if (!user) return res.status(400).json({ error: 'Usuario inválido' });

    const orderNumber = `${telegram_id}_${plan_id}_${Date.now()}`;

    const plisioParams = new URLSearchParams({
      source_currency: 'USD', source_amount: plan.price, currency: payCurrency,
      order_name: `Kabuto Miner - ${plan.name}`, order_number: orderNumber,
      callback_url: 'https://kabutominer.onrender.com/api/plisio_webhook',
      success_callback_url: 'https://kabutominer.onrender.com/success',
      fail_callback_url: 'https://kabutominer.onrender.com/fail',
      api_key: PLISIO_API_KEY
    });

    const plisioResponse = await axios.get(`https://api.plisio.net/api/v1/invoices/new?${plisioParams.toString()}`, { timeout: 30000 });

    if (plisioResponse.data.status !== 'success') {
      return res.status(400).json({ error: plisioResponse.data.message || 'Error Plisio' });
    }

    const invoiceId = plisioResponse.data.data.tx_id || plisioResponse.data.data.id;

    await supabase.from('purchases').insert([{
      telegram_id, plan: plan.name, amount_usd: plan.price, currency: payCurrency,
      plisio_invoice_id: invoiceId, status: 'pending'
    }]);

    res.json({
      invoice_url: plisioResponse.data.data.invoice_url, tx_id: invoiceId,
      order_number: orderNumber, amount: plisioResponse.data.data.amount,
      currency: payCurrency, plan
    });
  } catch (err) {
    console.error('Error create_invoice:', err.response?.data || err.message);
    let errorMsg = 'Error al crear factura';
    if (err.response?.data?.data?.message) errorMsg = err.response.data.data.message;
    else if (err.response?.data?.message) errorMsg = err.response.data.message;
    res.status(500).json({ error: errorMsg });
  }
});

// =====================================================
// API: VERIFICAR ESTADO DE FACTURA (con fallback)
// =====================================================
app.get('/api/check_invoice/:tx_id', async (req, res) => {
  try {
    const response = await axios.get(`https://api.plisio.net/api/v1/operations/${req.params.tx_id}`, { params: { api_key: PLISIO_API_KEY }, timeout: 15000 });
    if (response.data.status !== 'success') return res.json({ status: 'pending' });

    const op = response.data.data;
    if (op.status === 'completed' || op.status === 'confirmed') {
      const { data: purchase } = await supabase.from('purchases').select('*').eq('plisio_invoice_id', req.params.tx_id).single();
      if (purchase && purchase.status === 'pending') await activateVIP(purchase.telegram_id, purchase.plan, req.params.tx_id);
    }
    res.json({ status: op.status, tx_id: op.tx_id, amount: op.amount, currency: op.currency });
  } catch (err) { console.error('Error check_invoice:', err.message); res.json({ status: 'pending' }); }
});

// =====================================================
// WEBHOOK PLISIO
// =====================================================
app.post('/api/plisio_webhook', async (req, res) => {
  try {
    let body = req.body;
    if (Buffer.isBuffer(body)) {
      const raw = body.toString('utf8');
      try { body = JSON.parse(raw); } catch { body = Object.fromEntries(new URLSearchParams(raw)); }
    }

    if (PLISIO_SECRET_KEY && body.verify_hash) {
      const verifyHash = body.verify_hash; delete body.verify_hash;
      const expectedHash = crypto.createHmac('sha256', PLISIO_SECRET_KEY).update(JSON.stringify(body)).digest('hex');
      if (expectedHash !== verifyHash) return res.status(401).json({ error: 'Firma inválida' });
    }

    const { tx_id, status, order_number } = body;
    if (status === 'completed' || status === 'confirmed') {
      if (order_number) {
        const parts = order_number.split('_');
        const telegramId = parts[0]; const planId = parts[1];
        if (telegramId && planId && VIP_PLANS[planId]) await activateVIP(telegramId, VIP_PLANS[planId].name, tx_id);
      }
    }
    res.status(200).json({ status: 'ok' });
  } catch (err) { console.error('Error webhook:', err); res.status(500).json({ error: 'Error webhook' }); }
});

// =====================================================
// API: COMPLETAR TAREA
// =====================================================
app.post('/api/complete_task', async (req, res) => {
  try {
    const { telegram_id, task_id, reward } = req.body;
    const { data: existing } = await supabase.from('tasks_completed').select('*').eq('telegram_id', telegram_id).eq('task_id', task_id).single();
    if (existing) return res.json({ success: false, message: 'Ya completada' });

    await supabase.from('tasks_completed').insert([{ telegram_id, task_id, reward }]);
    const { data: user } = await supabase.from('users').select('*').eq('telegram_id', telegram_id).single();
    if (user) {
      const newBalance = user.balance + reward;
      await supabase.from('users').update({ balance: newBalance }).eq('telegram_id', telegram_id);
      res.json({ success: true, new_balance: newBalance });
    }
  } catch (err) { console.error('Error complete_task:', err); res.status(500).json({ error: 'Error' }); }
});

app.get('/api/tasks/:telegram_id', async (req, res) => {
  try {
    const { data } = await supabase.from('tasks_completed').select('task_id').eq('telegram_id', req.params.telegram_id);
    res.json({ completed: (data || []).map(t => t.task_id) });
  } catch { res.json({ completed: [] }); }
});

// =====================================================
// API: REGISTRAR REFERIDO
// =====================================================
app.post('/api/register_referral', async (req, res) => {
  try {
    const { referrer_id, referred_id } = req.body;
    if (referrer_id === referred_id) return res.json({ success: false, message: 'No puedes referirte a ti mismo' });
    const { data: existing } = await supabase.from('referrals').select('*').eq('referred_id', referred_id).single();
    if (existing) return res.json({ success: false, message: 'Ya tiene referente' });
    await supabase.from('referrals').insert([{ referrer_id, referred_id, commission: 0, total_commission_earned: 0 }]);
    res.json({ success: true });
  } catch (err) { console.error('Error referral:', err); res.status(500).json({ error: 'Error' }); }
});

// =====================================================
// API: OBTENER REFERIDOS CON COMISIONES
// =====================================================
app.get('/api/referrals/:telegram_id', async (req, res) => {
  try {
    const { data: referrals } = await supabase.from('referrals').select('*').eq('referrer_id', req.params.telegram_id);
    if (!referrals || referrals.length === 0) return res.json({ success: true, referrals: [], total_commission: 0, active_vip_count: 0, total_referrals: 0, pending_commission: 0 });

    const referredIds = referrals.map(r => r.referred_id);
    const { data: referredUsers } = await supabase.from('users').select('telegram_id, first_name, username, vip_level, hash_power, banned').in('telegram_id', referredIds);

    const referralsWithInfo = referrals.map(ref => {
      const userInfo = referredUsers?.find(u => u.telegram_id === ref.referred_id) || {};
      return {
        telegram_id: ref.referred_id, first_name: userInfo.first_name || 'Usuario',
        username: userInfo.username || '', is_vip: (userInfo.vip_level || 0) > 0 ? 1 : 0,
        vip_level: userInfo.vip_level || 0, hash_power: userInfo.hash_power || 0,
        banned: userInfo.banned || 0, commission_earned: ref.total_commission_earned || 0
      };
    });

    const totalCommission = referrals.reduce((s, r) => s + (r.total_commission_earned || 0), 0);
    const activeVipCount = referralsWithInfo.filter(r => r.is_vip === 1).length;
    const { data: user } = await supabase.from('users').select('total_referral_earned').eq('telegram_id', req.params.telegram_id).single();

    res.json({ success: true, referrals: referralsWithInfo, total_commission: totalCommission, active_vip_count: activeVipCount, total_referrals: referrals.length, pending_commission: user?.total_referral_earned || 0 });
  } catch (err) { console.error('Error referrals:', err); res.status(500).json({ error: 'Error' }); }
});

// =====================================================
// API: RECLAMAR COMISIONES TEAM WALLET
// =====================================================
app.post('/api/claim_team_wallet', async (req, res) => {
  try {
    const { telegram_id } = req.body;
    const { data: user } = await supabase.from('users').select('*').eq('telegram_id', telegram_id).single();
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const pendingAmount = user.total_referral_earned || 0;
    if (pendingAmount <= 0) return res.json({ success: false, message: 'No hay comisiones pendientes' });

    const newBalance = (user.balance || 0) + pendingAmount;
    await supabase.from('users').update({ balance: newBalance, total_referral_earned: 0 }).eq('telegram_id', telegram_id);
    res.json({ success: true, claimed_amount: pendingAmount, new_balance: newBalance });
  } catch (err) { console.error('Error claim team:', err); res.status(500).json({ error: 'Error' }); }
});

// =====================================================
// API: LOGIN STREAK (bonus diario)
// =====================================================
app.post('/api/daily_login', async (req, res) => {
  try {
    const { telegram_id } = req.body;
    if (!telegram_id) return res.status(400).json({ error: 'telegram_id requerido' });

    const { data: user } = await supabase.from('users').select('*').eq('telegram_id', telegram_id).single();
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const today = new Date().toISOString().split('T')[0];
    if (user.last_login_date === today) return res.json({ success: false, already_claimed: true, streak: user.last_login_streak || 0, message: 'Ya reclamaste hoy' });

    let newStreak = 1;
    if (user.last_login_date) {
      const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
      if (user.last_login_date === yesterday.toISOString().split('T')[0]) newStreak = (user.last_login_streak || 0) + 1;
    }

    const streakBonus = Math.min(newStreak, 7) * 10;
    const newBalance = (user.balance || 0) + streakBonus;
    await supabase.from('users').update({ balance: newBalance, last_login_streak: newStreak, last_login_date: today }).eq('telegram_id', telegram_id);

    await checkAchievements(telegram_id);

    res.json({ success: true, streak: newStreak, bonus: streakBonus, new_balance: newBalance, message: `¡Bonus diario! Día ${newStreak}: +${streakBonus} $KABUTO` });
  } catch (err) { console.error('Error daily_login:', err); res.status(500).json({ error: 'Error' }); }
});

app.get('/api/daily_login/:telegram_id', async (req, res) => {
  try {
    const { data: user } = await supabase.from('users').select('last_login_streak, last_login_date').eq('telegram_id', req.params.telegram_id).single();
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const today = new Date().toISOString().split('T')[0];
    res.json({ success: true, streak: user.last_login_streak || 0, already_claimed: user.last_login_date === today, next_bonus: Math.min((user.last_login_streak || 0) + 1, 7) * 10 });
  } catch (err) { res.status(500).json({ error: 'Error' }); }
});

// =====================================================
// API: RULETA DIARIA
// =====================================================
app.post('/api/roulette_spin', async (req, res) => {
  try {
    const { telegram_id } = req.body;
    if (!telegram_id) return res.status(400).json({ error: 'telegram_id requerido' });

    const today = new Date().toISOString().split('T')[0];
    const { data: todaySpin } = await supabase.from('roulette_spins').select('*').eq('telegram_id', telegram_id).gte('created_at', today + 'T00:00:00').lte('created_at', today + 'T23:59:59').limit(1).single();
    if (todaySpin) return res.json({ success: false, already_spun: true, message: 'Ya giraste hoy' });

    const prizes = [
      { reward: 5, chance: 30 }, { reward: 10, chance: 25 }, { reward: 25, chance: 20 },
      { reward: 50, chance: 12 }, { reward: 100, chance: 8 }, { reward: 250, chance: 4 }, { reward: 500, chance: 1 }
    ];
    const total = prizes.reduce((s, p) => s + p.chance, 0);
    let rand = Math.random() * total;
    let selected = prizes[0];
    for (const p of prizes) { rand -= p.chance; if (rand <= 0) { selected = p; break; } }

    await supabase.from('roulette_spins').insert([{ telegram_id, reward: selected.reward, reward_type: 'kabuto' }]);

    const { data: user } = await supabase.from('users').select('balance').eq('telegram_id', telegram_id).single();
    const newBalance = (user?.balance || 0) + selected.reward;
    await supabase.from('users').update({ balance: newBalance }).eq('telegram_id', telegram_id);

    res.json({ success: true, reward: selected.reward, label: `${selected.reward} $KABUTO`, new_balance: newBalance });
  } catch (err) { console.error('Error roulette:', err); res.status(500).json({ error: 'Error' }); }
});

app.get('/api/roulette_status/:telegram_id', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data: todaySpin } = await supabase.from('roulette_spins').select('*').eq('telegram_id', req.params.telegram_id).gte('created_at', today + 'T00:00:00').lte('created_at', today + 'T23:59:59').limit(1).single();
    const { data: history } = await supabase.from('roulette_spins').select('*').eq('telegram_id', req.params.telegram_id).order('created_at', { ascending: false }).limit(5);
    res.json({ success: true, can_spin: !todaySpin, history: (history || []).map(h => ({ reward: h.reward, date: h.created_at })) });
  } catch { res.json({ success: true, can_spin: true, history: [] }); }
});

// =====================================================
// API: BOOSTS TEMPORALES
// =====================================================
app.post('/api/buy_boost', async (req, res) => {
  try {
    const { telegram_id, boost_type } = req.body;
    const boost = BOOST_TYPES[boost_type];
    if (!boost) return res.status(400).json({ error: 'Boost inválido' });

    const { data: user } = await supabase.from('users').select('*').eq('telegram_id', telegram_id).single();
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    if ((user.balance || 0) < boost.cost) return res.status(400).json({ error: `Necesitas ${boost.cost} $KABUTO` });

    const newBalance = (user.balance || 0) - boost.cost;
    await supabase.from('users').update({ balance: newBalance }).eq('telegram_id', telegram_id);

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + boost.duration_hours);
    await supabase.from('active_boosts').insert([{ telegram_id, boost_type, multiplier: boost.multiplier, expires_at: expiresAt.toISOString() }]);

    res.json({ success: true, boost, expires_at: expiresAt.toISOString(), new_balance: newBalance });
  } catch (err) { console.error('Error buy_boost:', err); res.status(500).json({ error: 'Error' }); }
});

app.get('/api/boosts/:telegram_id', async (req, res) => {
  try {
    const now = new Date().toISOString();
    const { data: boosts } = await supabase.from('active_boosts').select('*').eq('telegram_id', req.params.telegram_id).gt('expires_at', now);
    let totalMultiplier = 1;
    (boosts || []).forEach(b => { totalMultiplier *= (b.multiplier || 1); });
    res.json({ success: true, active_boosts: boosts || [], total_multiplier: totalMultiplier });
  } catch { res.json({ success: true, active_boosts: [], total_multiplier: 1 }); }
});

// =====================================================
// API: LOGROS
// =====================================================
app.get('/api/achievements/:telegram_id', async (req, res) => {
  try {
    const { data: all } = await supabase.from('achievements').select('*');
    const { data: unlocked } = await supabase.from('user_achievements').select('achievement_code, unlocked_at').eq('telegram_id', req.params.telegram_id);
    const unlockedCodes = (unlocked || []).map(u => u.achievement_code);
    res.json({
      success: true,
      achievements: (all || []).map(a => ({ ...a, unlocked: unlockedCodes.includes(a.code), unlocked_at: unlocked?.find(u => u.achievement_code === a.code)?.unlocked_at || null })),
      total: all?.length || 0, unlocked_count: unlockedCodes.length
    });
  } catch (err) { res.status(500).json({ error: 'Error' }); }
});

app.post('/api/check_achievements', async (req, res) => {
  try {
    const { telegram_id } = req.body;
    const newAch = await checkAchievements(telegram_id);
    res.json({ success: true, new_achievements: newAch });
  } catch { res.status(500).json({ error: 'Error' }); }
});

// =====================================================
// API: RANKING
// =====================================================
app.get('/api/leaderboard', async (req, res) => {
  try {
    const type = req.query.type || 'balance';
    if (!['balance', 'hash_power', 'total_mined'].includes(type)) return res.status(400).json({ error: 'Tipo inválido' });
    const { data: top } = await supabase.from('users').select(`telegram_id, first_name, username, ${type}, vip_level, banned`).order(type, { ascending: false }).limit(10);
    res.json({ success: true, type, leaderboard: (top || []).map((u, i) => ({ rank: i + 1, telegram_id: u.telegram_id, name: u.first_name || 'Anónimo', username: u.username || '', value: u[type], vip_level: u.vip_level || 0 })) });
  } catch (err) { console.error('Error leaderboard:', err); res.status(500).json({ error: 'Error' }); }
});

// =====================================================
// API: RETIRO (con límites anti-fraude)
// =====================================================
app.post('/api/withdraw', async (req, res) => {
  try {
    const { telegram_id, amount, currency, address } = req.body;
    if (!SUPPORTED_CURRENCIES.includes(currency)) return res.status(400).json({ error: 'Moneda no soportada' });
    if (amount < 5) return res.status(400).json({ error: 'Mínimo $5' });

    const { data: user } = await supabase.from('users').select('*').eq('telegram_id', telegram_id).single();
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (user.banned) return res.status(403).json({ error: 'Usuario baneado' });
    if (user.flagged) return res.status(403).json({ error: 'Cuenta marcada por fraude. Contacta soporte.' });
    if (user.balance < amount) return res.status(400).json({ error: 'Saldo insuficiente' });

    // Límites anti-fraude
    const today = new Date().toISOString().split('T')[0];
    const MAX_WITHDRAWALS_PER_DAY = 3;
    const MAX_AMOUNT_PER_DAY = 50;

    const { data: todayRecord } = await supabase.from('daily_withdrawals').select('*').eq('telegram_id', telegram_id).eq('withdrawal_date', today).single();
    if (todayRecord) {
      if (todayRecord.count >= MAX_WITHDRAWALS_PER_DAY) return res.status(400).json({ error: `Límite diario: ${MAX_WITHDRAWALS_PER_DAY} retiros/día` });
      if ((todayRecord.total_amount || 0) + amount > MAX_AMOUNT_PER_DAY) {
        const remaining = MAX_AMOUNT_PER_DAY - (todayRecord.total_amount || 0);
        return res.status(400).json({ error: `Límite diario $${MAX_AMOUNT_PER_DAY}. Te quedan $${remaining.toFixed(2)}` });
      }
    }

    const withdrawParams = new URLSearchParams({ currency, amount, to: address, api_key: PLISIO_API_KEY });
    const response = await axios.get(`https://api.plisio.net/api/v1/withdraw?${withdrawParams.toString()}`, { timeout: 30000 });
    if (response.data.status !== 'success') return res.status(400).json({ error: response.data.message || 'Error retiro' });

    const txid = response.data.data.tx_id || '';
    await supabase.from('users').update({ balance: user.balance - amount }).eq('telegram_id', telegram_id);
    await supabase.from('withdrawals').insert([{ telegram_id, amount, currency, address, status: 'completed', txid }]);

    if (todayRecord) {
      await supabase.from('daily_withdrawals').update({ count: (todayRecord.count || 0) + 1, total_amount: (todayRecord.total_amount || 0) + amount }).eq('id', todayRecord.id);
    } else {
      await supabase.from('daily_withdrawals').insert([{ telegram_id, withdrawal_date: today, count: 1, total_amount: amount }]);
    }

    if (notifyWithdrawal) await notifyWithdrawal(telegram_id, amount, currency, txid);
    if (postToChannel) {
      const maskedName = user.username ? `@${user.username}` : (user.first_name || 'Anónimo');
      const maskedAddress = address.length > 12 ? `${address.substring(0, 8)}...${address.substring(address.length - 6)}` : address;
      await postToChannel(`💸 *Retiro procesado*\n\n👤 ${maskedName}\n💰 *$${amount} ${currency}*\n📍 \`${maskedAddress}\`\n🔗 TXID: \`${txid || 'pending'}\``);
    }

    res.json({ success: true, tx_id: txid, new_balance: user.balance - amount });
  } catch (err) {
    console.error('Error withdraw:', err.response?.data || err.message);
    res.status(500).json({ error: 'Error al procesar retiro: ' + (err.response?.data?.message || err.message) });
  }
});

// =====================================================
// API: ESTADÍSTICAS PÚBLICAS
// =====================================================
app.get('/api/public_stats', async (req, res) => {
  try {
    const { data: users } = await supabase.from('users').select('hash_power, vip_level, total_mined');
    const { data: purchases } = await supabase.from('purchases').select('amount_usd').eq('status', 'completed');
    const { data: withdrawals } = await supabase.from('withdrawals').select('amount');
    const totalIncome = (purchases || []).reduce((s, p) => s + p.amount_usd, 0);
    const totalWithdrawn = (withdrawals || []).reduce((s, w) => s + w.amount, 0);
    const totalHashPower = (users || []).reduce((s, u) => s + u.hash_power, 0);
    res.json({
      total_users: users?.length || 0, total_income: parseFloat(totalIncome.toFixed(2)),
      total_withdrawn: parseFloat(totalWithdrawn.toFixed(2)), liquidity: parseFloat((totalIncome * 0.70).toFixed(2)),
      admin_profit: parseFloat((totalIncome * 0.30).toFixed(2)), total_purchases: purchases?.length || 0,
      total_hash_power: parseFloat(totalHashPower.toFixed(2)), last_update: new Date().toISOString()
    });
  } catch (err) { console.error('Error public_stats:', err); res.status(500).json({ error: 'Error' }); }
});

// =====================================================
// APIs ADMIN
// =====================================================
app.get('/api/admin/stats', async (req, res) => {
  try {
    if (req.query.admin_id !== ADMIN_TELEGRAM_ID) return res.status(403).json({ error: 'No autorizado' });
    const { data: users } = await supabase.from('users').select('*');
    const { data: purchases } = await supabase.from('purchases').select('*').eq('status', 'completed');
    const { data: withdrawals } = await supabase.from('withdrawals').select('*');
    const totalIncome = (purchases || []).reduce((s, p) => s + p.amount_usd, 0);
    const totalWithdrawn = (withdrawals || []).reduce((s, w) => s + w.amount, 0);
    const totalBalance = (users || []).reduce((s, u) => s + u.balance, 0);
    res.json({ total_users: users?.length || 0, total_income: totalIncome, total_withdrawn: totalWithdrawn, liquidity_70: totalIncome * 0.70, admin_profit_30: totalIncome * 0.30, total_balance: totalBalance, users: users || [], purchases: purchases || [], withdrawals: withdrawals || [] });
  } catch (err) { console.error('Error admin stats:', err); res.status(500).json({ error: 'Error interno' }); }
});

app.post('/api/admin/ban', async (req, res) => {
  try {
    const { admin_id, telegram_id } = req.body;
    if (admin_id !== ADMIN_TELEGRAM_ID) return res.status(403).json({ error: 'No autorizado' });
    const { data: user } = await supabase.from('users').select('banned').eq('telegram_id', telegram_id).single();
    const newBanned = user?.banned ? 0 : 1;
    await supabase.from('users').update({ banned: newBanned }).eq('telegram_id', telegram_id);
    res.json({ success: true, banned: newBanned });
  } catch { res.status(500).json({ error: 'Error' }); }
});

app.post('/api/admin/activate_vip', async (req, res) => {
  try {
    const { admin_id, telegram_id, plan_id } = req.body;
    if (admin_id !== ADMIN_TELEGRAM_ID) return res.status(403).json({ error: 'No autorizado' });
    const plan = VIP_PLANS[plan_id];
    if (!plan) return res.status(400).json({ error: 'Plan inválido' });
    const { data: user } = await supabase.from('users').select('*').eq('telegram_id', telegram_id).single();
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const newHashPower = user.hash_power + plan.hash_power;
    const newVipLevel = Math.max(user.vip_level, parseInt(plan_id));
    await supabase.from('users').update({ hash_power: newHashPower, vip_level: newVipLevel }).eq('telegram_id', telegram_id);
    await supabase.from('purchases').insert([{ telegram_id, plan: plan.name, amount_usd: plan.price, currency: 'MANUAL', plisio_invoice_id: `manual_${Date.now()}`, status: 'completed' }]);
    if (notifyVIPActivated) await notifyVIPActivated(telegram_id, plan.name, plan.hash_power);
    res.json({ success: true, new_hash_power: newHashPower, new_vip_level: newVipLevel });
  } catch (err) { console.error('Error activate_vip:', err); res.status(500).json({ error: 'Error' }); }
});

app.post('/api/admin/remove_vip', async (req, res) => {
  try {
    const { admin_id, telegram_id } = req.body;
    if (admin_id !== ADMIN_TELEGRAM_ID) return res.status(403).json({ error: 'No autorizado' });
    await supabase.from('users').update({ hash_power: 10, vip_level: 0 }).eq('telegram_id', telegram_id);
    await supabase.from('purchases').insert([{ telegram_id, plan: 'REMOVED', amount_usd: 0, currency: 'MANUAL', plisio_invoice_id: `removed_${Date.now()}`, status: 'removed' }]);
    res.json({ success: true, new_hash_power: 10, new_vip_level: 0 });
  } catch (err) { console.error('Error remove_vip:', err); res.status(500).json({ error: 'Error' }); }
});

app.get('/api/admin/search', async (req, res) => {
  try {
    const { admin_id, q } = req.query;
    if (admin_id !== ADMIN_TELEGRAM_ID) return res.status(403).json({ error: 'No autorizado' });
    if (!q || q.length < 1) return res.json({ success: true, users: [] });
    const { data: users } = await supabase.from('users').select('*').or(`telegram_id.ilike.%${q}%,username.ilike.%${q}%,first_name.ilike.%${q}%`).limit(20);
    res.json({ success: true, users: users || [] });
  } catch (err) { res.status(500).json({ error: 'Error' }); }
});

app.post('/api/admin/broadcast', async (req, res) => {
  try {
    const { admin_id, message } = req.body;
    if (admin_id !== ADMIN_TELEGRAM_ID) return res.status(403).json({ error: 'No autorizado' });
    if (!message) return res.status(400).json({ error: 'Mensaje requerido' });
    if (!BOT_TOKEN_FOR_NOTIFS) return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN no configurado' });

    const { data: users } = await supabase.from('users').select('telegram_id').eq('banned', 0);
    let sent = 0, failed = 0;
    for (const u of (users || [])) {
      try {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN_FOR_NOTIFS}/sendMessage`, {
          chat_id: u.telegram_id, text: `📢 *Mensaje de Kabuto Miner*\n\n${message}`, parse_mode: 'Markdown'
        }, { timeout: 10000 });
        sent++;
        await new Promise(r => setTimeout(r, 50));
      } catch (e) { failed++; }
    }
    res.json({ success: true, sent, failed, total: (users || []).length });
  } catch (err) { console.error('Error broadcast:', err); res.status(500).json({ error: 'Error' }); }
});

app.get('/api/admin/chart_data', async (req, res) => {
  try {
    if (req.query.admin_id !== ADMIN_TELEGRAM_ID) return res.status(403).json({ error: 'No autorizado' });
    const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const { data: purchases } = await supabase.from('purchases').select('amount_usd, created_at').eq('status', 'completed').gte('created_at', sevenDaysAgo.toISOString());
    const { data: withdrawals } = await supabase.from('withdrawals').select('amount, created_at').gte('created_at', sevenDaysAgo.toISOString());
    const days = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      days[d.toISOString().split('T')[0]] = { date: d.toISOString().split('T')[0], income: 0, withdrawals: 0 };
    }
    (purchases || []).forEach(p => { const k = new Date(p.created_at).toISOString().split('T')[0]; if (days[k]) days[k].income += p.amount_usd; });
    (withdrawals || []).forEach(w => { const k = new Date(w.created_at).toISOString().split('T')[0]; if (days[k]) days[k].withdrawals += w.amount; });
    res.json({ success: true, chart_data: Object.values(days) });
  } catch (err) { res.status(500).json({ error: 'Error' }); }
});

app.get('/api/admin/flagged', async (req, res) => {
  try {
    if (req.query.admin_id !== ADMIN_TELEGRAM_ID) return res.status(403).json({ error: 'No autorizado' });
    const { data: flaggedUsers } = await supabase.from('users').select('*').eq('flagged', 1).order('last_login', { ascending: false }).limit(50);
    const { data: flaggedDevices } = await supabase.from('flagged_devices').select('*').order('user_count', { ascending: false }).limit(20);
    res.json({ success: true, flagged_users: flaggedUsers || [], flagged_devices: flaggedDevices || [] });
  } catch { res.status(500).json({ error: 'Error' }); }
});

app.post('/api/admin/unflag', async (req, res) => {
  try {
    const { admin_id, telegram_id } = req.body;
    if (admin_id !== ADMIN_TELEGRAM_ID) return res.status(403).json({ error: 'No autorizado' });
    await supabase.from('users').update({ flagged: 0, flag_reason: null }).eq('telegram_id', telegram_id);
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Error' }); }
});

app.get('/api/account_level/:telegram_id', async (req, res) => {
  try {
    const { data: user } = await supabase.from('users').select('total_mined, flagged, flag_reason').eq('telegram_id', req.params.telegram_id).single();
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const accountLevel = getAccountLevel(user.total_mined || 0);
    res.json({ success: true, account_level: accountLevel, flagged: user.flagged || 0, flag_reason: user.flag_reason || null, progress_to_next: accountLevel.next ? Math.min(100, ((user.total_mined || 0) / accountLevel.next) * 100) : 100 });
  } catch { res.status(500).json({ error: 'Error' }); }
});

// =====================================================
// NOTIFICACIONES PUSH (cron)
// =====================================================
async function sendDailyReminders() {
  if (!BOT_TOKEN_FOR_NOTIFS) return;
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data: users } = await supabase.from('users').select('telegram_id, first_name').eq('banned', 0).eq('flagged', 0).neq('last_login_date', today);
    if (!users || users.length === 0) return;

    let sent = 0, failed = 0;
    for (const u of users) {
      const { data: alreadySent } = await supabase.from('sent_notifications').select('id').eq('telegram_id', u.telegram_id).eq('notification_type', 'daily_reminder').gte('sent_at', today + 'T00:00:00').limit(1).single();
      if (alreadySent) continue;
      try {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN_FOR_NOTIFS}/sendMessage`, {
          chat_id: u.telegram_id,
          text: `🦏 ¡Hola *${u.first_name}*! Tu bonus diario te espera\n\n📅 Bonus de login (hasta +70 $KABUTO)\n🎡 Gira la ruleta (hasta 500 $KABUTO)\n⛏️ Tu Kabuto mina solo`,
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[{ text: '🦏 ABRIR KABUTO MINER', web_app: { url: 'https://kabutominer.onrender.com' } }]] }
        }, { timeout: 10000 });
        await supabase.from('sent_notifications').insert([{ telegram_id: u.telegram_id, notification_type: 'daily_reminder' }]);
        sent++;
        await new Promise(r => setTimeout(r, 50));
      } catch (e) { failed++; }
    }
    console.log(`📅 Notificaciones: ${sent} OK, ${failed} fallidas`);
  } catch (err) { console.error('Error sendDailyReminders:', err); }
}

function scheduleDailyReminders() {
  function getNextNoon() {
    const now = new Date();
    const next = new Date(now);
    next.setUTCDate(now.getUTCDate() + 1);
    next.setUTCHours(12, 0, 0, 0);
    return next;
  }
  const msUntilNext = getNextNoon() - new Date();
  setTimeout(() => { sendDailyReminders(); setInterval(sendDailyReminders, 24 * 60 * 60 * 1000); }, msUntilNext);
  console.log(`📅 Próximas notificaciones push en ${Math.floor(msUntilNext / 3600000)} horas`);
}

app.post('/api/admin/send_reminders', async (req, res) => {
  try {
    if (req.body.admin_id !== ADMIN_TELEGRAM_ID) return res.status(403).json({ error: 'No autorizado' });
    await sendDailyReminders();
    res.json({ success: true, message: 'Notificaciones enviadas' });
  } catch { res.status(500).json({ error: 'Error' }); }
});

// =====================================================
// PÁGINAS
// =====================================================
app.get('/success', (req, res) => {
  res.send(`<html><body style="background:#0d1117;color:#fff;font-family:Arial;text-align:center;padding:50px"><h1 style="color:#3fb950">✅ Pago Confirmado</h1><p>Tu VIP está siendo activado. Vuelve a Kabuto Miner.</p></body></html>`);
});

app.get('/fail', (req, res) => {
  res.send(`<html><body style="background:#0d1117;color:#fff;font-family:Arial;text-align:center;padding:50px"><h1 style="color:#f85149">❌ Pago Fallido</h1></body></html>`);
});

app.get('/transparency', (req, res) => {
  res.send(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Kabuto Miner - Transparencia</title><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#0d1117;color:#fff;font-family:Arial;padding:20px}.container{max-width:800px;margin:0 auto}header{text-align:center;margin-bottom:30px}.logo{font-size:48px}h1{color:#3fb950}.stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:15px;margin:20px 0}.stat-card{background:#161b22;border:1px solid #30363d;border-radius:10px;padding:20px;text-align:center}.stat-card .value{font-size:24px;font-weight:bold;color:#3fb950;margin:8px 0}.stat-card .label{color:#8b949e;font-size:14px}.split-bar{display:flex;height:30px;border-radius:5px;overflow:hidden;margin-top:10px}.split-70{background:#3fb950;width:70%;display:flex;align-items:center;justify-content:center;font-weight:bold}.split-30{background:#f78166;width:30%;display:flex;align-items:center;justify-content:center;font-weight:bold}</style></head><body><div class="container"><header><div class="logo">🦏</div><h1>Kabuto Miner - Transparencia</h1></header><div class="stats-grid" id="stats"></div><div style="background:#161b22;border:1px solid #30363d;border-radius:10px;padding:20px;margin:20px 0"><h3>Distribución 30/70</h3><div class="split-bar"><div class="split-70">70% Retiros</div><div class="split-30">30% Admin</div></div></div><div style="text-align:center;margin-top:30px"><a href="https://t.me/kabuto_payments" style="background:#238636;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold">Ver canal @kabuto_payments</a></div></div><script>async function loadStats(){try{const r=await fetch('/api/public_stats');const d=await r.json();document.getElementById('stats').innerHTML=[['👥','Usuarios',d.total_users],['💰','Ingresos','$'+d.total_income.toFixed(2)],['💸','Retiros','$'+d.total_withdrawn.toFixed(2)],['📦','Compras VIP',d.total_purchases],['⚡','Hash Power',d.total_hash_power.toFixed(0)+' H/s'],['💵','Liquidez','$'+d.liquidity.toFixed(2)]].map(([i,l,v])=>'<div class="stat-card"><div style="font-size:32px">'+i+'</div><div class="value">'+v+'</div><div class="label">'+l+'</div></div>').join('')}catch(e){console.error(e)}}loadStats();setInterval(loadStats,30000)</script></body></html>`);
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../kabuto-game/dist/index.html'));
});

// =====================================================
// INICIAR
// =====================================================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🦏 Kabuto Miner v3.0 corriendo en puerto ${PORT}`);
  console.log(`📊 Base de datos: Supabase`);
  console.log(`🔔 Webhook: https://kabutominer.onrender.com/api/plisio_webhook`);
  console.log(`🤖 Bot: activo`);
  console.log(`📢 Canal: @kabuto_payments`);
  console.log(`🛡️ Anti-fraude: activo (máx 3 retiros/día, máx $50/día)`);
  console.log(`🏅 Niveles de cuenta: Bronce/Plata/Oro/Diamante`);
  console.log(`📅 Notificaciones push: programadas`);
  scheduleDailyReminders();
});

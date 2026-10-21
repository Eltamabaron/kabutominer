// =====================================================
// KABUTO MINER - BOT DE TELEGRAM (v2.4 - FIX 409 CONFLICT)
// =====================================================
// Mejoras vs versión anterior:
// ✅ deleteWebhook() antes de arrancar (limpia webhooks viejos)
// ✅ dropPendingUpdates al iniciar (evita conflictos iniciales)
// ✅ Reconexión automática en caso de error 409
// ✅ Backoff exponencial para no saturar la API
// =====================================================

const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// Configuración
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://kabutominer.onrender.com';
const ADMIN_ID = '1159596878';
const CHANNEL_USERNAME = 'kabuto_payments';
const CHANNEL_URL = `https://t.me/${CHANNEL_USERNAME}`;
const SUPPORT_URL = 'https://t.me/Kabutominer_support';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';

let bot = null;
let notifyVIPActivatedFn = async () => {};
let notifyWithdrawalFn = async () => {};
let postToChannelFn = async () => {};
let getChannelStatsFn = async () => ({});

// =====================================================
// INICIAR BOT CON FIX ANTI-409
// =====================================================
if (!BOT_TOKEN) {
  console.warn('⚠️ TELEGRAM_BOT_TOKEN no configurado. Bot desactivado.');
} else {
  startBotWithRetry();
}

async function startBotWithRetry() {
  try {
    // 🆕 PASO 1: Eliminar cualquier webhook previo (evita 409)
    console.log('🧹 Limpiando webhooks previos...');
    const webhookInfo = await axios.get(
      `https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`
    );
    if (webhookInfo.data.result.url) {
      console.log('⚠️ Webhook detectado, eliminando...');
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook`);
      console.log('✅ Webhook eliminado');
    }

    // 🆕 PASO 2: Eliminar updates pendientes (evita procesar mensajes viejos)
    console.log('🧹 Eliminando updates pendientes...');
    await axios.get(
      `https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=-1`
    );
    console.log('✅ Updates limpios');

    // 🆕 PASO 3: Esperar 2 segundos para que cualquier instancia vieja muera
    await new Promise(resolve => setTimeout(resolve, 2000));

    // PASO 4: Crear bot con polling
    bot = new TelegramBot(BOT_TOKEN, {
      polling: {
        interval: 1500,
        autoStart: false, // 🆕 Arrancamos manualmente
        params: { timeout: 30 }
      }
    });

    // 🆕 PASO 5: Manejar errores de polling con reconexión
    let retryCount = 0;
    let isRestarting = false;

    bot.on('polling_error', async (err) => {
      const errorMsg = err.message || '';
      console.error('❌ Error polling:', errorMsg);

      // Si es 409 Conflict, esperar y reiniciar
      if (errorMsg.includes('409') && !isRestarting) {
        isRestarting = true;
        retryCount++;
        const waitTime = Math.min(5000 * retryCount, 30000); // max 30s
        console.log(`🔄 409 Conflict detectado. Esperando ${waitTime/1000}s antes de reintentar (intento ${retryCount})...`);

        try {
          await bot.stopPolling();
        } catch (e) {}

        await new Promise(resolve => setTimeout(resolve, waitTime));

        try {
          // Limpiar updates nuevamente
          await axios.get(
            `https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=-1`
          );
          await bot.startPolling({ restart: true });
          console.log('✅ Polling reiniciado correctamente');
          // Resetear contador tras éxito
          setTimeout(() => {
            retryCount = 0;
            isRestarting = false;
          }, 60000);
        } catch (e) {
          console.error('❌ Error al reiniciar polling:', e.message);
          // Reintento más largo
          setTimeout(() => {
            isRestarting = false;
          }, 60000);
        }
      }
    });

    bot.on('error', (err) => {
      console.error('❌ Error bot:', err.message);
    });

    // 🆕 PASO 6: Iniciar polling manualmente
    console.log('🤖 Iniciando polling del bot...');
    await bot.startPolling();
    console.log('🤖 Bot de Telegram iniciado correctamente');

    setupBotFeatures();
    setupDailySummary();
  } catch (err) {
    console.error('❌ Error iniciando bot:', err.message);
    console.log('🔄 Reintentando en 10 segundos...');
    setTimeout(startBotWithRetry, 10000);
  }
}

// =====================================================
// FUNCIONES AUXILIARES
// =====================================================
function timeAgo(date) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'hace un momento';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}

// =====================================================
// CONFIGURAR COMANDOS DEL BOT
// =====================================================
function setupBotFeatures() {

  // =====================================================
  // COMANDO /start
  // =====================================================
  bot.onText(/\/start(.*)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = String(msg.from.id);
    const firstName = msg.from.first_name || 'Jugador';
    const referralParam = match[1].trim();

    console.log(`👋 /start de ${firstName} (${telegramId}) - ref: ${referralParam}`);

    let referrerId = null;
    if (referralParam && referralParam.startsWith('ref_')) {
      referrerId = referralParam.replace('ref_', '');

      try {
        if (referrerId !== telegramId) {
          await axios.post(`${WEBAPP_URL}/api/register_referral`, {
            referrer_id: referrerId,
            referred_id: telegramId
          });
        }
      } catch (err) {
        console.error('Error registrando referido:', err.message);
      }
    }

    const welcomeText = `🦏 ¡Hola *${firstName}*! Bienvenido a *Kabuto Miner*

⛏️ *¿Qué es Kabuto Miner?*
Juego de minería ficticia donde minas $KABUTO y los retiras en criptomonedas reales.

💎 *Características:*
• Minado automático en H/s
• Planes VIP que multiplican tu minado
• Retiros en USDT, TON, LTC, TRX y más
• Sistema de referidos con comisiones
• Tareas diarias con recompensas

${referrerId && referrerId !== telegramId ? '🔗 *Entraste por invitación de un amigo. ¡Ambos recibirán bonus!*' : '💡 Usa /help para ver todos los comandos'}

🚀 Toca *JUGAR* para empezar a minar.`;

    const keyboard = {
      inline_keyboard: [
        [{ text: '🦏 JUGAR AHORA', web_app: { url: WEBAPP_URL } }],
        [
          { text: '📢 Canal de Pagos', url: CHANNEL_URL },
          { text: '❓ Ayuda', callback_data: 'help' }
        ]
      ]
    };

    try {
      await bot.sendMessage(chatId, welcomeText, {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
        disable_web_page_preview: true
      });

      if (referrerId && referrerId !== telegramId) {
        try {
          await bot.sendMessage(referrerId,
            `🎉 ¡*Nuevo referido*!\n\n✅ *${firstName}* se unió con tu enlace.\n\n💰 Ganarás comisiones de sus compras y minado.`,
            { parse_mode: 'Markdown' }
          );
        } catch (err) {
          console.log('No se pudo avisar al referente:', err.message);
        }
      }
    } catch (err) {
      console.error('Error enviando /start:', err.message);
    }
  });

  // =====================================================
  // COMANDO /help
  // =====================================================
  bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;

    const helpText = `🦏 *Ayuda de Kabuto Miner*

*Comandos:*
• /start - Iniciar el juego
• /help - Ver esta ayuda
• /play - Abrir Kabuto Miner
• /referral - Tu enlace de referido
• /rules - Reglas del juego
• /support - Contactar soporte
• /stats - Estadísticas públicas

*¿Cómo jugar?*
1️⃣ Toca el botón JUGAR
2️⃣ El minado empieza automáticamente
3️⃣ Compra planes VIP para minar más rápido
4️⃣ Retira tus $KABUTO en criptomonedas reales

*¿Cómo retirar?*
1️⃣ Acumula al menos $1 en balance
2️⃣ Abre el juego → Retirar
3️⃣ Elige moneda y pega tu dirección
4️⃣ Recibe el pago en tu wallet

*¿Cómo invitar amigos?*
1️⃣ Usa /referral para tu enlace
2️⃣ Compártelo con amigos
3️⃣ Gana comisiones de sus compras y minado

💡 *Consejo:* Entra todos los días para bonus de login.`;

    const keyboard = {
      inline_keyboard: [
        [{ text: '🦏 JUGAR', web_app: { url: WEBAPP_URL } }],
        [
          { text: '📢 Canal', url: CHANNEL_URL },
          { text: '🎫 Soporte', url: SUPPORT_URL }
        ]
      ]
    };

    try {
      await bot.sendMessage(chatId, helpText, {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
        disable_web_page_preview: true
      });
    } catch (err) {
      console.error('Error enviando /help:', err.message);
    }
  });

  // =====================================================
  // COMANDO /play
  // =====================================================
  bot.onText(/\/play/, async (msg) => {
    const chatId = msg.chat.id;
    try {
      await bot.sendMessage(chatId,
        '🚀 Toca para abrir Kabuto Miner y empezar a minar $KABUTO:',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🦏 ABRIR KABUTO MINER', web_app: { url: WEBAPP_URL } }]
            ]
          }
        }
      );
    } catch (err) {
      console.error('Error /play:', err.message);
    }
  });

  // =====================================================
  // COMANDO /referral
  // =====================================================
  bot.onText(/\/referral/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = String(msg.from.id);
    const refLink = `https://t.me/Kabutominer_bot?start=ref_${telegramId}`;

    const refText = `🎫 *Tu enlace de referido*

Comparte este enlace con tus amigos:

🔗 \`${refLink}\`

💎 *Comisiones:*
• 10% de cada compra VIP de tus referidos
• 5% de todo lo que minen

📋 *Cómo funciona:*
1️⃣ Comparte tu enlace
2️⃣ Tu amigo entra y juega
3️⃣ Recibes comisiones automáticamente
4️⃣ Van a tu balance de $KABUTO

💡 Compártelo en redes sociales, grupos, o con amigos.`;

    try {
      await bot.sendMessage(chatId, refText, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📤 Compartir', switch_inline_query: refLink }],
            [{ text: '🦏 JUGAR', web_app: { url: WEBAPP_URL } }]
          ]
        },
        disable_web_page_preview: true
      });
    } catch (err) {
      console.error('Error /referral:', err.message);
    }
  });

  // =====================================================
  // COMANDO /rules
  // =====================================================
  bot.onText(/\/rules/, async (msg) => {
    const chatId = msg.chat.id;

    const rulesText = `📜 *Reglas de Kabuto Miner*

1️⃣ *Una cuenta por persona*
Multicuentas serán baneadas.

2️⃣ *No uses bots o scripts*
El minado debe ser natural.

3️⃣ *Pagos reales*
Retiros vía Plisio. Mínimo $1.

4️⃣ *Transparencia*
Todos los pagos y retiros se publican en @${CHANNEL_USERNAME}

5️⃣ *Comisiones de referidos*
10% de compras + 5% de minado.

6️⃣ *Sin spam*
No hagas spam con tu enlace.

7️⃣ *Responsabilidad*
Verifica tu dirección antes de retirar.

💡 *Consejo:* Juega limpio y ganarás más a largo plazo.`;

    try {
      await bot.sendMessage(chatId, rulesText, { parse_mode: 'Markdown' });
    } catch (err) {
      console.error('Error /rules:', err.message);
    }
  });

  // =====================================================
  // COMANDO /support
  // =====================================================
  bot.onText(/\/support/, async (msg) => {
    const chatId = msg.chat.id;
    try {
      await bot.sendMessage(chatId,
        '🎫 *Soporte de Kabuto Miner*\n\nSi tienes algún problema, abre un ticket. Respondemos en menos de 24 horas.',
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🎫 Abrir ticket', url: SUPPORT_URL }],
              [{ text: '📢 Canal de transparencia', url: CHANNEL_URL }]
            ]
          }
        }
      );
    } catch (err) {
      console.error('Error /support:', err.message);
    }
  });

  // =====================================================
  // COMANDO /stats (ESTADÍSTICAS PÚBLICAS)
  // =====================================================
  bot.onText(/\/stats/, async (msg) => {
    const chatId = msg.chat.id;

    try {
      const stats = await getChannelStatsFn();

      const statsText = `📊 *Estadísticas Públicas de Kabuto Miner*

👥 *Usuarios registrados:* ${stats.total_users}
💰 *Ingresos totales:* $${stats.total_income.toFixed(2)}
💸 *Retiros procesados:* $${stats.total_withdrawn.toFixed(2)}
💵 *Liquidez disponible (70%):* $${stats.liquidity.toFixed(2)}
📈 *Pagos VIP completados:* ${stats.total_purchases}
🔧 *Hash Power total de la red:* ${stats.total_hash_power.toFixed(0)} H/s

📊 *Transparencia 30/70:*
• 70% Liquidez para retiros de usuarios
• 30% Mantenimiento y ganancias admin

🔗 Ver más detalles: ${WEBAPP_URL}/transparency`;

      await bot.sendMessage(chatId, statsText, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🦏 JUGAR', web_app: { url: WEBAPP_URL } }],
            [{ text: '📢 Ver canal', url: CHANNEL_URL }]
          ]
        }
      });
    } catch (err) {
      console.error('Error /stats:', err.message);
    }
  });

  // =====================================================
  // CALLBACK QUERIES
  // =====================================================
  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (data === 'help') {
      try {
        await bot.sendMessage(chatId,
          `🦏 *Ayuda rápida*\n\nToca *JUGAR* para empezar.\nComandos:\n• /referral - Tu enlace\n• /rules - Reglas\n• /stats - Estadísticas\n• /support - Soporte`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🦏 JUGAR', web_app: { url: WEBAPP_URL } }]
              ]
            }
          }
        );
      } catch (err) {
        console.error('Error callback:', err.message);
      }
    }

    bot.answerCallbackQuery(query.id).catch(() => {});
  });

  // =====================================================
  // FUNCIONES DE NOTIFICACIÓN
  // =====================================================
  notifyVIPActivatedFn = async (telegramId, planName, hashPowerGained) => {
    try {
      await bot.sendMessage(telegramId,
        `🎉 *¡VIP Activado!*

✅ Tu plan *${planName}* ha sido activado.

💪 Hash Power ganado: *+${hashPowerGained} H/s*

🚀 Ahora minarás mucho más rápido. ¡Ve a jugar!`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🦏 JUGAR', web_app: { url: WEBAPP_URL } }]
            ]
          }
        }
      );
    } catch (err) {
      console.log('No se pudo notificar VIP:', err.message);
    }
  };

  notifyWithdrawalFn = async (telegramId, amount, currency, txid) => {
    try {
      await bot.sendMessage(telegramId,
        `💸 *Retiro procesado*

💰 Monto: *$${amount} ${currency}*
🔗 TXID: \`${txid || 'pending'}\`

✅ Tu retiro ha sido enviado. Verifica en tu wallet en unos minutos.

📊 Publicado en @${CHANNEL_USERNAME} para transparencia.`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      console.log('No se pudo notificar retiro:', err.message);
    }
  };

  postToChannelFn = async (text, options = {}) => {
    try {
      await bot.sendMessage(`@${CHANNEL_USERNAME}`, text, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
        ...options
      });
      return true;
    } catch (err) {
      console.log('No se pudo publicar en canal:', err.message);
      return false;
    }
  };

  getChannelStatsFn = async () => {
    try {
      const response = await axios.get(`${WEBAPP_URL}/api/public_stats`);
      return response.data;
    } catch (err) {
      console.log('Error obteniendo stats:', err.message);
      return {
        total_users: 0,
        total_income: 0,
        total_withdrawn: 0,
        liquidity: 0,
        total_purchases: 0,
        total_hash_power: 0
      };
    }
  };
}

// =====================================================
// RESUMEN DIARIO AUTOMÁTICO
// =====================================================
function setupDailySummary() {
  if (!bot) return;

  function getNextNoon() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(now.getUTCDate() + 1);
    tomorrow.setUTCHours(12, 0, 0, 0);
    return tomorrow;
  }

  async function sendDailySummary() {
    try {
      const stats = await getChannelStatsFn();

      const today = new Date().toLocaleDateString('es-ES', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
      });

      const summary = `📊 *Resumen diario - ${today}*

👥 Usuarios totales: *${stats.total_users}*
💰 Ingresos acumulados: *$${stats.total_income.toFixed(2)}*
💸 Retiros procesados: *$${stats.total_withdrawn.toFixed(2)}*
💵 Liquidez disponible: *$${stats.liquidity.toFixed(2)}*
📦 Compras VIP: *${stats.total_purchases}*
⚡ Hash Power total: *${stats.total_hash_power.toFixed(0)} H/s*

📊 *Split 30/70:*
• 70% para retiros de usuarios
• 30% mantenimiento y admin

🦏 ¡Gracias por confiar en Kabuto Miner!`;

      await postToChannelFn(summary);
      console.log('📊 Resumen diario publicado');

      const msUntilNext = getNextNoon() - new Date();
      setTimeout(sendDailySummary, msUntilNext);
    } catch (err) {
      console.error('Error en resumen diario:', err.message);
    }
  }

  const msUntilNext = getNextNoon() - new Date();
  setTimeout(sendDailySummary, msUntilNext);
  console.log(`📊 Próximo resumen diario en ${Math.floor(msUntilNext / 3600000)} horas`);
}

// =====================================================
// EXPORTAR
// =====================================================
module.exports = {
  bot,
  notifyVIPActivated: notifyVIPActivatedFn,
  notifyWithdrawal: notifyWithdrawalFn,
  postToChannel: postToChannelFn,
  getChannelStats: getChannelStatsFn
};

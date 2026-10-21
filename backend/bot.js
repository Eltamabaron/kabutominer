// =====================================================
// KABUTO MINER - BOT DE TELEGRAM
// =====================================================
// Este archivo maneja TODA la lógica del bot de Telegram
// Se importa desde server.js automáticamente
// =====================================================

const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// Configuración
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://kabutominer.onrender.com';
const ADMIN_ID = '1159596878';
const CHANNEL_URL = 'https://t.me/kabuto_payments';
const SUPPORT_URL = 'https://t.me/Kabutominer_support';

// Variables que se exportan
let bot = null;
let notifyVIPActivatedFn = async () => {};
let notifyWithdrawalFn = async () => {};
let postToChannelFn = async () => {};

// =====================================================
// INICIAR BOT (solo si hay token)
// =====================================================
if (!BOT_TOKEN) {
  console.warn('⚠️ TELEGRAM_BOT_TOKEN no configurado. Bot desactivado.');
} else {
  bot = new TelegramBot(BOT_TOKEN, {
    polling: {
      interval: 1000,
      autoStart: true,
      params: { timeout: 30 }
    }
  });

  console.log('🤖 Bot de Telegram iniciado correctamente');
  setupBotFeatures();
}

// =====================================================
// CONFIGURAR TODAS LAS FUNCIONES DEL BOT
// =====================================================
function setupBotFeatures() {

  // =====================================================
  // COMANDO /start (con soporte de referidos)
  // =====================================================
  bot.onText(/\/start(.*)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = String(msg.from.id);
    const username = msg.from.username || '';
    const firstName = msg.from.first_name || 'Jugador';
    const referralParam = match[1].trim();

    console.log(`👋 /start de ${firstName} (${telegramId}) - ref: ${referralParam}`);

    // Si viene de un enlace de referido (formato: ref_123456789)
    let referrerId = null;
    if (referralParam && referralParam.startsWith('ref_')) {
      referrerId = referralParam.replace('ref_', '');
      console.log(`🔗 Referido por: ${referrerId}`);

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
Es un juego de minería ficticia donde minas tokens $KABUTO y puedes retirarlos en criptomonedas reales.

💎 *Características:*
• Minado automático en H/s
• Planes VIP que multiplican tu minado
• Retiros en USDT, TON, LTC y más
• Sistema de referidos con comisiones
• Tareas diarias con recompensas

${referrerId && referrerId !== telegramId ? '🔗 *Entraste por invitación de un amigo. ¡Ambos recibirán bonus!*' : '💡 Usa /help para ver todos los comandos.'}

🚀 Toca el botón *JUGAR* para empezar a minar.`;

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

      // Avisar al referente
      if (referrerId && referrerId !== telegramId) {
        try {
          await bot.sendMessage(referrerId,
            `🎉 ¡*Nuevo referido*!\n\n✅ *${firstName}* se unió con tu enlace de invitación.\n\n💰 Ganarás comisiones de sus compras y minado.`,
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

*Comandos disponibles:*
• /start - Iniciar el juego
• /help - Ver esta ayuda
• /play - Abrir Kabuto Miner
• /referral - Tu enlace de referido
• /support - Contactar soporte
• /rules - Reglas del juego

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
1️⃣ Usa /referral para obtener tu enlace
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
    const keyboard = {
      inline_keyboard: [
        [{ text: '🦏 ABRIR KABUTO MINER', web_app: { url: WEBAPP_URL } }]
      ]
    };
    try {
      await bot.sendMessage(chatId,
        '🚀 Toca el botón para abrir Kabuto Miner y empezar a minar $KABUTO:',
        { reply_markup: keyboard }
      );
    } catch (err) {
      console.error('Error enviando /play:', err.message);
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

💎 *Comisiones que ganas:*
• 10% de cada compra VIP de tus referidos
• 5% de todo lo que minen

📋 *Cómo funciona:*
1️⃣ Comparte tu enlace
2️⃣ Tu amigo entra y juega
3️⃣ Tú recibes comisiones automáticamente
4️⃣ Las comisiones van a tu balance de $KABUTO

💡 Comparte en redes sociales, grupos de Telegram, o con amigos directamente.`;

    const keyboard = {
      inline_keyboard: [
        [{ text: '📤 Compartir enlace', switch_inline_query: refLink }],
        [{ text: '🦏 JUGAR', web_app: { url: WEBAPP_URL } }]
      ]
    };

    try {
      await bot.sendMessage(chatId, refText, {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
        disable_web_page_preview: true
      });
    } catch (err) {
      console.error('Error enviando /referral:', err.message);
    }
  });

  // =====================================================
  // COMANDO /rules
  // =====================================================
  bot.onText(/\/rules/, async (msg) => {
    const chatId = msg.chat.id;

    const rulesText = `📜 *Reglas de Kabuto Miner*

1️⃣ *Una cuenta por persona*
No puedes tener múltiples cuentas. Si detectamos multicuenta, todas serán baneadas.

2️⃣ *No uses bots o scripts*
El minado debe ser natural. El uso de herramientas automatizadas resultará en ban.

3️⃣ *Pagos reales*
Los retiros se procesan en criptomonedas reales via Plisio. Mínimo $1.

4️⃣ *Transparencia*
Todos los pagos y retiros se publican en @kabuto_payments

5️⃣ *Comisiones de referidos*
10% de compras + 5% de minado de tus referidos.

6️⃣ *Sin spam*
No hagas spam con tu enlace de referido o serás baneado.

7️⃣ *Responsabilidad*
Eres responsable de tu dirección de retiro. Verifícala antes de retirar.

💡 *Consejo:* Juega limpio y ganarás más a largo plazo.`;

    try {
      await bot.sendMessage(chatId, rulesText, { parse_mode: 'Markdown' });
    } catch (err) {
      console.error('Error enviando /rules:', err.message);
    }
  });

  // =====================================================
  // COMANDO /support
  // =====================================================
  bot.onText(/\/support/, async (msg) => {
    const chatId = msg.chat.id;
    const keyboard = {
      inline_keyboard: [
        [{ text: '🎫 Abrir ticket de soporte', url: SUPPORT_URL }],
        [{ text: '📢 Canal de transparencia', url: CHANNEL_URL }]
      ]
    };
    try {
      await bot.sendMessage(chatId,
        '🎫 *Soporte de Kabuto Miner*\n\nSi tienes algún problema, abre un ticket en el grupo de soporte. Respondemos en menos de 24 horas.',
        { parse_mode: 'Markdown', reply_markup: keyboard }
      );
    } catch (err) {
      console.error('Error enviando /support:', err.message);
    }
  });

  // =====================================================
  // CALLBACK QUERIES (botones inline)
  // =====================================================
  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (data === 'help') {
      // Simular comando /help
      try {
        const helpText = `🦏 *Ayuda rápida*

Toca *JUGAR* para empezar.
Comandos útiles:
• /referral - Tu enlace de referido
• /rules - Reglas
• /support - Soporte`;

        const keyboard = {
          inline_keyboard: [
            [{ text: '🦏 JUGAR', web_app: { url: WEBAPP_URL } }]
          ]
        };

        await bot.sendMessage(chatId, helpText, {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
      } catch (err) {
        console.error('Error callback help:', err.message);
      }
    }

    bot.answerCallbackQuery(query.id).catch(() => {});
  });

  // =====================================================
  // MANEJO DE ERRORES
  // =====================================================
  bot.on('polling_error', (err) => {
    console.error('❌ Error polling bot:', err.message);
  });

  bot.on('error', (err) => {
    console.error('❌ Error bot:', err.message);
  });

  // =====================================================
  // FUNCIONES DE NOTIFICACIÓN
  // =====================================================
  notifyVIPActivatedFn = async (telegramId, planName, hashPowerGained) => {
    try {
      await bot.sendMessage(telegramId,
        `🎉 *¡VIP Activado!*\n\n✅ Tu plan *${planName}* ha sido activado correctamente.\n\n💪 Hash Power ganado: *+${hashPowerGained} H/s*\n\n🚀 Ahora minarás mucho más rápido. ¡Ve a jugar!`,
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
        `💸 *Retiro procesado*\n\n💰 Monto: *$${amount} ${currency}*\n🔗 TXID: \`${txid}\`\n\n✅ Tu retiro ha sido enviado. Verifica en tu wallet en unos minutos.`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      console.log('No se pudo notificar retiro:', err.message);
    }
  };

  postToChannelFn = async (text) => {
    try {
      await bot.sendMessage('@kabuto_payments', text, { parse_mode: 'Markdown' });
    } catch (err) {
      console.log('No se pudo publicar en canal:', err.message);
    }
  };
}

// =====================================================
// EXPORTAR
// =====================================================
module.exports = {
  bot,
  notifyVIPActivated: notifyVIPActivatedFn,
  notifyWithdrawal: notifyWithdrawalFn,
  postToChannel: postToChannelFn
};

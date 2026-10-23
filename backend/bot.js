// =====================================================
// KABUTO MINER v3.0 - BOT DE TELEGRAM
// =====================================================
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://kabutominer.onrender.com';
const ADMIN_ID = '1159596878';
const CHANNEL_USERNAME = 'kabuto_payments';
const CHANNEL_URL = `https://t.me/${CHANNEL_USERNAME}`;
const SUPPORT_URL = 'https://t.me/Kabutominer_support';

let bot = null;
let notifyVIPActivatedFn = async () => {};
let notifyWithdrawalFn = async () => {};
let postToChannelFn = async () => {};
let getChannelStatsFn = async () => ({});

if (!BOT_TOKEN) {
  console.warn('⚠️ TELEGRAM_BOT_TOKEN no configurado. Bot desactivado.');
} else {
  bot = new TelegramBot(BOT_TOKEN, {
    polling: { interval: 1500, autoStart: true, params: { timeout: 30 } }
  });
  console.log('🤖 Bot de Telegram iniciado correctamente');
  setupBotFeatures();
}

function setupBotFeatures() {

  // /start
  bot.onText(/\/start(.*)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = String(msg.from.id);
    const firstName = msg.from.first_name || 'Jugador';
    const referralParam = match[1].trim();

    let referrerId = null;
    if (referralParam && referralParam.startsWith('ref_')) {
      referrerId = referralParam.replace('ref_', '');
      try {
        if (referrerId !== telegramId) {
          await axios.post(`${WEBAPP_URL}/api/register_referral`, {
            referrer_id: referrerId, referred_id: telegramId
          });
        }
      } catch (err) { console.error('Error referido:', err.message); }
    }

    const welcomeText = `🦏 ¡Hola *${firstName}*! Bienvenido a *Kabuto Miner*

⛏️ Juego de minería ficticia donde minas $KABUTO y los retiras en criptomonedas reales.

💎 *Características:*
• Minado automático en H/s
• Planes VIP que multiplican tu minado
• Retiros en USDT, LTC, TRX, BNB, SOL, USDC
• Sistema de referidos con comisiones (10% compras, 5% minado)
• Tareas diarias, ruleta, logros y ranking
• Boosts temporales y niveles de cuenta

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
        parse_mode: 'Markdown', reply_markup: keyboard, disable_web_page_preview: true
      });

      if (referrerId && referrerId !== telegramId) {
        try {
          await bot.sendMessage(referrerId,
            `🎉 ¡*Nuevo referido*!\n\n✅ *${firstName}* se unió con tu enlace.\n\n💰 Ganarás 10% de sus compras y 5% de su minado.`,
            { parse_mode: 'Markdown' }
          );
        } catch (err) { console.log('No se pudo avisar al referente:', err.message); }
      }
    } catch (err) { console.error('Error /start:', err.message); }
  });

  // /help
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
1️⃣ Acumula al menos $5 USD
2️⃣ Abre el juego → Perfil → Retirar
3️⃣ Elige moneda y pega tu dirección
4️⃣ Recibe el pago en tu wallet

💡 *Consejo:* Entra todos los días para bonus de login y gira la ruleta.`;

    const keyboard = {
      inline_keyboard: [
        [{ text: '🦏 JUGAR', web_app: { url: WEBAPP_URL } }],
        [{ text: '📢 Canal', url: CHANNEL_URL }, { text: '🎫 Soporte', url: SUPPORT_URL }]
      ]
    };
    try {
      await bot.sendMessage(chatId, helpText, {
        parse_mode: 'Markdown', reply_markup: keyboard, disable_web_page_preview: true
      });
    } catch (err) { console.error('Error /help:', err.message); }
  });

  // /play
  bot.onText(/\/play/, async (msg) => {
    const chatId = msg.chat.id;
    try {
      await bot.sendMessage(chatId, '🚀 Toca para abrir Kabuto Miner:', {
        reply_markup: { inline_keyboard: [[{ text: '🦏 ABRIR KABUTO MINER', web_app: { url: WEBAPP_URL } }]] }
      });
    } catch (err) { console.error('Error /play:', err.message); }
  });

  // /referral
  bot.onText(/\/referral/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = String(msg.from.id);
    const refLink = `https://t.me/Kabutominer_bot?start=ref_${telegramId}`;
    const refText = `🎫 *Tu enlace de referido*

🔗 \`${refLink}\`

💎 *Comisiones:*
• 10% de cada compra VIP de tus referidos
• 5% de todo lo que minen

📋 *Cómo funciona:*
1️⃣ Comparte tu enlace
2️⃣ Tu amigo entra y juega
3️⃣ Recibes comisiones automáticamente en tu Team Wallet
4️⃣ Reclama desde la pestaña Amigos

💡 Compártelo en redes sociales, grupos, o con amigos.`;
    try {
      await bot.sendMessage(chatId, refText, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [
          [{ text: '📤 Compartir', switch_inline_query: refLink }],
          [{ text: '🦏 JUGAR', web_app: { url: WEBAPP_URL } }]
        ]},
        disable_web_page_preview: true
      });
    } catch (err) { console.error('Error /referral:', err.message); }
  });

  // /rules
  bot.onText(/\/rules/, async (msg) => {
    const chatId = msg.chat.id;
    const rulesText = `📜 *Reglas de Kabuto Miner*

1️⃣ *Una cuenta por persona*
Multicuentas son detectadas y marcadas.

2️⃣ *No uses bots o scripts*
El minado debe ser natural.

3️⃣ *Pagos reales*
Retiros vía Plisio. Mínimo $5 USD. Máx 3 retiros/día, $50/día.

4️⃣ *Transparencia*
Todos los pagos y retiros se publican en @${CHANNEL_USERNAME}

5️⃣ *Comisiones de referidos*
10% de compras + 5% de minado.

6️⃣ *Sin spam*
No hagas spam con tu enlace.

7️⃣ *Responsabilidad*
Verifica tu dirección antes de retirar.

💡 *Consejo:* Juega limpio y ganarás más a largo plazo.`;
    try { await bot.sendMessage(chatId, rulesText, { parse_mode: 'Markdown' }); }
    catch (err) { console.error('Error /rules:', err.message); }
  });

  // /support
  bot.onText(/\/support/, async (msg) => {
    const chatId = msg.chat.id;
    try {
      await bot.sendMessage(chatId, '🎫 *Soporte de Kabuto Miner*\n\nSi tienes algún problema, abre un ticket. Respondemos en menos de 24 horas.', {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [
          [{ text: '🎫 Abrir ticket', url: SUPPORT_URL }],
          [{ text: '📢 Canal de transparencia', url: CHANNEL_URL }]
        ]}
      });
    } catch (err) { console.error('Error /support:', err.message); }
  });

  // /stats
  bot.onText(/\/stats/, async (msg) => {
    const chatId = msg.chat.id;
    try {
      const stats = await getChannelStatsFn();
      const statsText = `📊 *Estadísticas Públicas*

👥 *Usuarios:* ${stats.total_users}
💰 *Ingresos:* $${stats.total_income.toFixed(2)}
💸 *Retiros:* $${stats.total_withdrawn.toFixed(2)}
💵 *Liquidez (70%):* $${stats.liquidity.toFixed(2)}
📦 *Compras VIP:* ${stats.total_purchases}
⚡ *Hash Power total:* ${stats.total_hash_power.toFixed(0)} H/s

📊 *Transparencia 30/70:*
• 70% para retiros
• 30% mantenimiento y admin

🔗 ${WEBAPP_URL}/transparency`;
      await bot.sendMessage(chatId, statsText, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [
          [{ text: '🦏 JUGAR', web_app: { url: WEBAPP_URL } }],
          [{ text: '📢 Ver canal', url: CHANNEL_URL }]
        ]}
      });
    } catch (err) { console.error('Error /stats:', err.message); }
  });

  // callback_query
  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    if (query.data === 'help') {
      try {
        await bot.sendMessage(chatId,
          `🦏 *Ayuda rápida*\n\nToca *JUGAR* para empezar.\nComandos:\n• /referral - Tu enlace\n• /rules - Reglas\n• /stats - Estadísticas\n• /support - Soporte`,
          { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🦏 JUGAR', web_app: { url: WEBAPP_URL } }]] } }
        );
      } catch (err) { console.error('Error callback:', err.message); }
    }
    bot.answerCallbackQuery(query.id).catch(() => {});
  });

  // errores
  bot.on('polling_error', (err) => console.error('❌ Error polling bot:', err.message));
  bot.on('error', (err) => console.error('❌ Error bot:', err.message));

  // notificaciones
  notifyVIPActivatedFn = async (telegramId, planName, hashPowerGained) => {
    try {
      await bot.sendMessage(telegramId,
        `🎉 *¡VIP Activado!*\n\n✅ Tu plan *${planName}* ha sido activado.\n💪 Hash Power: *+${hashPowerGained} H/s*\n🚀 ¡Ve a jugar!`,
        { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🦏 JUGAR', web_app: { url: WEBAPP_URL } }]] } }
      );
    } catch (err) { console.log('No se pudo notificar VIP:', err.message); }
  };

  notifyWithdrawalFn = async (telegramId, amount, currency, txid) => {
    try {
      await bot.sendMessage(telegramId,
        `💸 *Retiro procesado*\n\n💰 Monto: *$${amount} ${currency}*\n🔗 TXID: \`${txid || 'pending'}\`\n\n📊 Publicado en @${CHANNEL_USERNAME}`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) { console.log('No se pudo notificar retiro:', err.message); }
  };

  postToChannelFn = async (text) => {
    try {
      await bot.sendMessage(`@${CHANNEL_USERNAME}`, text, { parse_mode: 'Markdown', disable_web_page_preview: true });
      return true;
    } catch (err) { console.log('No se pudo publicar en canal:', err.message); return false; }
  };

  getChannelStatsFn = async () => {
    try {
      const response = await axios.get(`${WEBAPP_URL}/api/public_stats`);
      return response.data;
    } catch (err) {
      return { total_users: 0, total_income: 0, total_withdrawn: 0, liquidity: 0, total_purchases: 0, total_hash_power: 0 };
    }
  };
}

module.exports = {
  bot,
  notifyVIPActivated: notifyVIPActivatedFn,
  notifyWithdrawal: notifyWithdrawalFn,
  postToChannel: postToChannelFn,
  getChannelStats: getChannelStatsFn
};

import { useState, useEffect, useRef } from 'react';
import './App.css';

const API_URL = 'https://kabutominer.onrender.com';
const ADMIN_ID = '1159596878';
const KABUTO_PRICE_USD = 0.001;
const MINING_MULTIPLIER = 0.0001;
const REQUIRED_VIP_REFERRALS = 6;
const MIN_WITHDRAWAL_USD = 5;
const WITHDRAWAL_FEE = 0.5;

function App() {
  const [user, setUser] = useState({ telegram_id: '', first_name: 'Jugador', is_vip: 0, isAdmin: false, balance: 0, hash_power: 10, vip_level: 0, total_mined: 0, username: '' });
  const [holdingWallet, setHoldingWallet] = useState(0);
  const [poolWallet, setPoolWallet] = useState(0);
  const [teamWallet, setTeamWallet] = useState(0);
  const [hashPower, setHashPower] = useState(10);
  const [activeTab, setActiveTab] = useState('mina');
  const [referrals, setReferrals] = useState([]);
  const [referralLink, setReferralLink] = useState('');
  const [totalReferralEarned, setTotalReferralEarned] = useState(0);
  const [adminStats, setAdminStats] = useState(null);
  const [adminUsers, setAdminUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showWithdrawBox, setShowWithdrawBox] = useState(false);
  const [withdrawAddress, setWithdrawAddress] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawCurrency, setWithdrawCurrency] = useState('USDT');
  const [selectedCurrency, setSelectedCurrency] = useState('USDT');
  const [adminView, setAdminView] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [modal, setModal] = useState({ show: false, title: '', message: '', type: 'success' });
  const [claimedTasks, setClaimedTasks] = useState([]);
  const [paymentInfo, setPaymentInfo] = useState(null);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [notification, setNotification] = useState(null);
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [claimingTeam, setClaimingTeam] = useState(false);
  const [loginStreak, setLoginStreak] = useState({ streak: 0, already_claimed: false, next_bonus: 10 });
  const [claimingDaily, setClaimingDaily] = useState(false);
  const [rouletteStatus, setRouletteStatus] = useState({ can_spin: true, history: [] });
  const [spinning, setSpinning] = useState(false);
  const [activeBoosts, setActiveBoosts] = useState([]);
  const [boostMultiplier, setBoostMultiplier] = useState(1);
  const [achievements, setAchievements] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [leaderboardType, setLeaderboardType] = useState('balance');
  const [adminSearch, setAdminSearch] = useState('');
  const [adminSearchResults, setAdminSearchResults] = useState([]);
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcasting, setBroadcasting] = useState(false);
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [chartData, setChartData] = useState([]);
  const [accountLevel, setAccountLevel] = useState({ level: 1, name: 'Bronce', icon: '🥉', color: '#cd7f32', perk: 'Acceso básico' });
  const [flagged, setFlagged] = useState(false);
  const [flaggedUsers, setFlaggedUsers] = useState([]);

  const checkPaymentIntervalRef = useRef(null);

  const showModal = (title, message, type = 'success') => setModal({ show: true, title, message, type });
  const closeModal = () => setModal({ show: false, title: '', message: '', type: '' });
  const showNotification = (message, type = 'info') => { setNotification({ message, type }); setTimeout(() => setNotification(null), 3000); };

  const CURRENCIES = [
    { code: 'USDT', name: 'USDT', icon: '🟢', img: '/usdt.png' },
    { code: 'USDT_TRX', name: 'USDT TRC20', icon: '🟢', img: '/usdt-trc20.png' },
    { code: 'USDT_BSC', name: 'USDT BEP20', icon: '🟢', img: '/usdt-bep20.png' },
    { code: 'USDC', name: 'USDC', icon: '🔵', img: '/usdc.png' },
    { code: 'LTC', name: 'Litecoin', icon: '🪙', img: '/ltc.png' },
    { code: 'TRX', name: 'Tron', icon: '🔴', img: '/trx.png' },
    { code: 'BNB', name: 'BNB Chain', icon: '🟡', img: '/bnb.png' },
    { code: 'SOL', name: 'Solana', icon: '☀️', img: '/sol.png' },
    { code: 'DOGE', name: 'Dogecoin', icon: '🐕', img: '/doge.png' }
  ];

  const realUpgrades = [
    { id: 'real1', planId: 1, name: 'VIP 1 - Básico', cost_ton: 3, hashAdd: 50, image: '/vip-diamond.png' },
    { id: 'real2', planId: 2, name: 'VIP 2 - Pro', cost_ton: 5, hashAdd: 200, image: '/vip-dragon.png' },
    { id: 'real3', planId: 3, name: 'VIP 3 - Experto', cost_ton: 10, hashAdd: 500, image: '/vip-galaxy.png' },
    { id: 'real4', planId: 4, name: 'VIP 4 - Maestro', cost_ton: 25, hashAdd: 1500, image: '/vip-cosmic.png' },
    { id: 'real5', planId: 5, name: 'VIP 5 - Leyenda', cost_ton: 50, hashAdd: 5000, image: '/vip-cosmic.png' }
  ];

  const tasks = [
    { id: 'tg_channel', name: 'Únete a nuestro Canal', reward: 100, link: 'https://t.me/kabuto_payments', icon: '📢', image: '/task-channel.png' },
    { id: 'daily_login', name: 'Login Diario', reward: 50, link: null, icon: '📅', image: '/task-daily-login.png' },
    { id: 'visit_web', name: 'Visita nuestro Patrocinador', reward: 200, link: 'https://example.com', icon: '🌐', image: '/task-website.png' }
  ];

  // LOGIN
  useEffect(() => {
    async function login() {
      let tgId = '1159596878', tgName = 'Admin', tgUsername = '', refBy = null;
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.ready();
        window.Telegram.WebApp.expand();
        const tgUser = window.Telegram.WebApp.initDataUnsafe?.user;
        if (tgUser) {
          tgId = String(tgUser.id);
          tgName = tgUser.first_name;
          tgUsername = tgUser.username || '';
          const startParam = window.Telegram.WebApp.initDataUnsafe?.start_param;
          if (startParam && startParam.startsWith('ref_')) refBy = startParam.replace('ref_', '');
        }
      }
      setReferralLink(`https://t.me/Kabutominer_bot?start=ref_${tgId}`);
      try {
        const deviceId = (() => {
          let stored = localStorage.getItem('kabuto_device_id');
          if (!stored) { stored = 'dev_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15); localStorage.setItem('kabuto_device_id', stored); }
          return stored;
        })();
        const r = await fetch(`${API_URL}/api/login`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ telegram_id: tgId, username: tgUsername, first_name: tgName, device_id: deviceId })
        });
        const data = await r.json();
        if (data && data.telegram_id) {
          const adminStatus = data.is_admin === true || data.telegram_id === ADMIN_ID;
          setUser({ telegram_id: data.telegram_id, first_name: data.first_name || tgName, username: data.username || tgUsername, is_vip: data.vip_level > 0 ? 1 : 0, isAdmin: adminStatus, balance: data.balance || 0, hash_power: data.hash_power || 10, vip_level: data.vip_level || 0, total_mined: data.total_mined || 0 });
          setHoldingWallet(Number(data.balance) || 0);
          setHashPower(Number(data.hash_power) || 10);
          setIsAdmin(adminStatus);
          if (data.account_level) setAccountLevel(data.account_level);
          if (data.flagged) { setFlagged(true); showModal('⚠️ Cuenta Marcada', data.flag_reason || 'Cuenta marcada por fraude.', 'error'); }
          loadCompletedTasks(data.telegram_id);
          loadReferrals(data.telegram_id);
          loadLoginStreak(data.telegram_id);
          loadRouletteStatus(data.telegram_id);
          loadBoosts(data.telegram_id);
          loadAchievements(data.telegram_id);
          loadLeaderboard();
        }
      } catch (err) { console.error('Error login:', err); showNotification('Error de conexión', 'error'); }
      finally { setLoading(false); }
      if (refBy && refBy !== tgId) { try { await fetch(`${API_URL}/api/register_referral`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ referrer_id: refBy, referred_id: tgId }) }); } catch (e) {} }
    }
    login();
  }, []);

  async function loadCompletedTasks(id) { try { const r = await fetch(`${API_URL}/api/tasks/${id}`); const d = await r.json(); setClaimedTasks(d.completed || []); } catch (e) {} }
  async function loadReferrals(id) { try { const r = await fetch(`${API_URL}/api/referrals/${id}`); const d = await r.json(); if (d.success) { setReferrals(d.referrals || []); setTeamWallet(d.pending_commission || 0); setTotalReferralEarned(d.total_commission || 0); } } catch (e) {} }
  async function loadLoginStreak(id) { try { const r = await fetch(`${API_URL}/api/daily_login/${id}`); const d = await r.json(); if (d.success) setLoginStreak(d); } catch (e) {} }
  async function loadRouletteStatus(id) { try { const r = await fetch(`${API_URL}/api/roulette_status/${id}`); const d = await r.json(); if (d.success) setRouletteStatus(d); } catch (e) {} }
  async function loadBoosts(id) { try { const r = await fetch(`${API_URL}/api/boosts/${id}`); const d = await r.json(); if (d.success) { setActiveBoosts(d.active_boosts || []); setBoostMultiplier(d.total_multiplier || 1); } } catch (e) {} }
  async function loadAchievements(id) { try { const r = await fetch(`${API_URL}/api/achievements/${id}`); const d = await r.json(); if (d.success) setAchievements(d.achievements || []); } catch (e) {} }
  async function loadLeaderboard(type = leaderboardType) { try { const r = await fetch(`${API_URL}/api/leaderboard?type=${type}`); const d = await r.json(); if (d.success) setLeaderboard(d.leaderboard || []); } catch (e) {} }

  // GUARDAR PROGRESO
  useEffect(() => {
    if (!user.telegram_id) return;
    const interval = setInterval(async () => {
      try { await fetch(`${API_URL}/api/save`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ telegram_id: user.telegram_id, balance: holdingWallet + poolWallet, hash_power: hashPower, total_mined: user.total_mined }) }); } catch (e) {}
    }, 10000);
    return () => clearInterval(interval);
  }, [user.telegram_id, holdingWallet, poolWallet, hashPower]);

  // MINADO
  useEffect(() => {
    if (!user.telegram_id || (isAdmin && adminView)) return;
    const interval = setInterval(() => { setPoolWallet(prev => prev + (hashPower * MINING_MULTIPLIER * boostMultiplier)); }, 1000);
    const boostInterval = setInterval(() => { loadBoosts(user.telegram_id); }, 30000);
    return () => { clearInterval(interval); clearInterval(boostInterval); };
  }, [hashPower, user.telegram_id, isAdmin, adminView, boostMultiplier]);

  // ADMIN STATS
  useEffect(() => {
    if (!isAdmin || !adminView) return;
    async function loadAdmin() { try { const r = await fetch(`${API_URL}/api/admin/stats?admin_id=${user.telegram_id}`); const d = await r.json(); if (d && !d.error) { setAdminStats(d); setAdminUsers(d.users || []); } } catch (e) {} }
    loadAdmin();
    const interval = setInterval(loadAdmin, 10000);
    return () => clearInterval(interval);
  }, [isAdmin, adminView, user.telegram_id]);

  async function handleBuyReal(upgrade) {
    if (creatingInvoice) return;
    setCreatingInvoice(true);
    showNotification('Creando factura...', 'info');
    try {
      const r = await fetch(`${API_URL}/api/create_invoice`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ telegram_id: user.telegram_id, plan_id: upgrade.planId, currency: selectedCurrency }) });
      const data = await r.json();
      if (data.error) { showModal('Error', data.error, 'error'); return; }
      if (!data.invoice_url) { showModal('Error', 'No se pudo crear la factura', 'error'); return; }
      if (window.Telegram?.WebApp) window.Telegram.WebApp.openLink(data.invoice_url);
      else window.open(data.invoice_url, '_blank');
      setPaymentInfo({ ...upgrade, tx_id: data.tx_id });
      startCheckingPayment(data.tx_id);
    } catch (err) { showModal('Error', 'No se pudo conectar', 'error'); }
    finally { setCreatingInvoice(false); }
  }

  function startCheckingPayment(txId) {
    setCheckingPayment(true);
    let attempts = 0;
    checkPaymentIntervalRef.current = setInterval(async () => {
      attempts++;
      try {
        const r = await fetch(`${API_URL}/api/check_invoice/${txId}`);
        const data = await r.json();
        if (data.status === 'completed' || data.status === 'confirmed') {
          clearInterval(checkPaymentIntervalRef.current);
          setCheckingPayment(false);
          setPaymentInfo(null);
          showModal('🎉 ¡VIP Activado!', 'Tu plan VIP está activo. Hash power aumentó.', 'success');
          try { const sr = await fetch(`${API_URL}/api/state/${user.telegram_id}`); const sd = await sr.json(); if (sd && !sd.error) { setHashPower(sd.hash_power); setUser(prev => ({ ...prev, vip_level: sd.vip_level, is_vip: sd.vip_level > 0 ? 1 : 0 })); } } catch (e) {}
        }
        if (attempts >= 60) { clearInterval(checkPaymentIntervalRef.current); setCheckingPayment(false); }
      } catch (e) {}
    }, 5000);
  }

  const handleClaim = () => { setHoldingWallet(prev => prev + poolWallet); setPoolWallet(0); showModal('¡Reclamado!', 'Has movido $KABUTO a tu billetera principal.'); };

  const handleBuyLevel = () => {
    const total = holdingWallet + poolWallet;
    const cost = (Math.floor(hashPower / 100) + 1) * 500;
    if (total >= cost) {
      let remaining = cost, newHolding = holdingWallet, newPool = poolWallet;
      if (newHolding >= remaining) newHolding -= remaining;
      else { remaining -= newHolding; newHolding = 0; newPool -= remaining; }
      setHoldingWallet(newHolding); setPoolWallet(newPool); setHashPower(prev => prev + 50);
      showModal('¡Nivel Subido!', `Ahora eres Nivel ${Math.floor(hashPower / 100) + 2}. +50 H/s`);
    } else showModal('Saldo Insuficiente', 'Necesitas más $KABUTO', 'error');
  };

  async function handleClaimTask(task) {
    if (claimedTasks.includes(task.id)) return;
    if (task.link) { if (window.Telegram?.WebApp) window.Telegram.WebApp.openTelegramLink(task.link); else window.open(task.link, '_blank'); }
    try {
      const r = await fetch(`${API_URL}/api/complete_task`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ telegram_id: user.telegram_id, task_id: task.id, reward: task.reward }) });
      const data = await r.json();
      if (data.success) { setHoldingWallet(data.new_balance); setClaimedTasks(prev => [...prev, task.id]); showModal('¡Tarea Completada!', `Has ganado ${task.reward} $KABUTO.`); }
    } catch (e) {}
  }

  async function handleBanUser(telegram_id) {
    try { await fetch(`${API_URL}/api/admin/ban`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ admin_id: user.telegram_id, telegram_id }) });
      const r = await fetch(`${API_URL}/api/admin/stats?admin_id=${user.telegram_id}`); const d = await r.json(); if (d && !d.error) { setAdminStats(d); setAdminUsers(d.users || []); } } catch (e) {}
  }

  async function activateVipManual(telegramId, planId) {
    try { showNotification('Activando VIP...', 'info');
      const r = await fetch(`${API_URL}/api/admin/activate_vip`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ admin_id: user.telegram_id, telegram_id: telegramId, plan_id: planId }) });
      const data = await r.json();
      if (data.success) { showNotification('VIP activado', 'success'); const sr = await fetch(`${API_URL}/api/admin/stats?admin_id=${user.telegram_id}`); const sd = await sr.json(); if (sd && !sd.error) { setAdminStats(sd); setAdminUsers(sd.users || []); } if (telegramId === user.telegram_id) { const usr = await fetch(`${API_URL}/api/state/${user.telegram_id}`); const ud = await usr.json(); if (ud && !ud.error) { setHashPower(ud.hash_power); setUser(prev => ({ ...prev, vip_level: ud.vip_level, is_vip: ud.vip_level > 0 ? 1 : 0 })); } } } else showNotification(data.error || 'Error', 'error');
    } catch (e) { showNotification('Error de conexión', 'error'); }
  }

  async function removeVipManual(telegramId) {
    if (!confirm('¿Quitar el VIP?')) return;
    try { showNotification('Quitando VIP...', 'info');
      const r = await fetch(`${API_URL}/api/admin/remove_vip`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ admin_id: user.telegram_id, telegram_id: telegramId }) });
      const data = await r.json();
      if (data.success) { showNotification('VIP removido', 'success'); const sr = await fetch(`${API_URL}/api/admin/stats?admin_id=${user.telegram_id}`); const sd = await sr.json(); if (sd && !sd.error) { setAdminStats(sd); setAdminUsers(sd.users || []); } if (telegramId === user.telegram_id) { const usr = await fetch(`${API_URL}/api/state/${user.telegram_id}`); const ud = await usr.json(); if (ud && !ud.error) { setHashPower(ud.hash_power); setUser(prev => ({ ...prev, vip_level: ud.vip_level, is_vip: ud.vip_level > 0 ? 1 : 0 })); } } }
    } catch (e) { showNotification('Error', 'error'); }
  }

  async function handleClaimTeam() {
    if (teamWallet <= 0 || claimingTeam) return;
    setClaimingTeam(true);
    showNotification('Reclamando comisiones...', 'info');
    try { const r = await fetch(`${API_URL}/api/claim_team_wallet`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ telegram_id: user.telegram_id }) });
      const data = await r.json();
      if (data.success) { setHoldingWallet(data.new_balance); setTeamWallet(0); showModal('¡Comisiones Reclamadas!', `Has reclamado ${data.claimed_amount.toFixed(2)} $KABUTO.\n\nSaldo: ${data.new_balance.toFixed(2)}`); }
      else showModal('Error', data.message || 'No se pudo reclamar', 'error');
    } catch (e) { showModal('Error', 'No se pudo conectar', 'error'); }
    finally { setClaimingTeam(false); }
  }

  async function handleClaimDaily() {
    if (loginStreak.already_claimed || claimingDaily) return;
    setClaimingDaily(true);
    try { const r = await fetch(`${API_URL}/api/daily_login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ telegram_id: user.telegram_id }) });
      const data = await r.json();
      if (data.success) { setHoldingWallet(data.new_balance); setLoginStreak(prev => ({ ...prev, streak: data.streak, already_claimed: true, next_bonus: Math.min(data.streak + 1, 7) * 10 })); showModal('🎉 ¡Bonus Diario!', `${data.message}`); }
      else showModal('Info', data.message || 'Ya reclamaste', 'error');
    } catch (e) {} finally { setClaimingDaily(false); }
  }

  async function handleSpinRoulette() {
    if (!rouletteStatus.can_spin || spinning) return;
    setSpinning(true);
    try { const r = await fetch(`${API_URL}/api/roulette_spin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ telegram_id: user.telegram_id }) });
      const data = await r.json();
      if (data.success) { setTimeout(() => { setHoldingWallet(data.new_balance); setRouletteStatus(prev => ({ ...prev, can_spin: false })); setSpinning(false); showModal('🎡 ¡Ruleta!', `¡Ganaste ${data.label}!\n\nSaldo: ${data.new_balance.toFixed(2)}`); }, 2000); }
      else { showModal('Info', data.message || 'Ya giraste', 'error'); setSpinning(false); }
    } catch (e) { setSpinning(false); }
  }

  async function handleBuyBoost(boostType, cost, name) {
    if (holdingWallet < cost) { showModal('Saldo Insuficiente', `Necesitas ${cost} $KABUTO`, 'error'); return; }
    if (!confirm(`¿Comprar ${name} por ${cost} $KABUTO?`)) return;
    try { const r = await fetch(`${API_URL}/api/buy_boost`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ telegram_id: user.telegram_id, boost_type: boostType }) });
      const data = await r.json();
      if (data.success) { setHoldingWallet(data.new_balance); await loadBoosts(user.telegram_id); showModal('🚀 Boost Activado!', `${data.boost.name}\n\nVence: ${new Date(data.expires_at).toLocaleString('es-ES')}`); }
      else showModal('Error', data.error, 'error');
    } catch (e) { showModal('Error', 'No se pudo conectar', 'error'); }
  }

  async function handleAdminSearch(query) {
    setAdminSearch(query);
    if (query.length < 1) { setAdminSearchResults([]); return; }
    try { const r = await fetch(`${API_URL}/api/admin/search?admin_id=${user.telegram_id}&q=${encodeURIComponent(query)}`); const d = await r.json(); if (d.success) setAdminSearchResults(d.users || []); } catch (e) {}
  }

  async function handleBroadcast() {
    if (!broadcastMessage.trim()) { showModal('Error', 'Escribe un mensaje', 'error'); return; }
    if (!confirm('¿Enviar mensaje a TODOS los usuarios?')) return;
    setBroadcasting(true);
    try { const r = await fetch(`${API_URL}/api/admin/broadcast`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ admin_id: user.telegram_id, message: broadcastMessage }) });
      const data = await r.json();
      if (data.success) { showModal('✅ Enviado', `Enviados: ${data.sent}\nFallidos: ${data.failed}\nTotal: ${data.total}`); setShowBroadcast(false); setBroadcastMessage(''); }
      else showModal('Error', data.error, 'error');
    } catch (e) { showModal('Error', 'No se pudo enviar', 'error'); }
    finally { setBroadcasting(false); }
  }

  async function loadChartData() { try { const r = await fetch(`${API_URL}/api/admin/chart_data?admin_id=${user.telegram_id}`); const d = await r.json(); if (d.success) setChartData(d.chart_data || []); } catch (e) {} }
  async function loadFlaggedUsers() { try { const r = await fetch(`${API_URL}/api/admin/flagged?admin_id=${user.telegram_id}`); const d = await r.json(); if (d.success) { setFlaggedUsers(d.flagged_users || []); showModal('🚨 Sospechosos', `${d.flagged_users.length} usuarios marcados`); } } catch (e) {} }
  async function handleUnflag(telegramId) { if (!confirm('¿Desmarcar?')) return; try { await fetch(`${API_URL}/api/admin/unflag`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ admin_id: user.telegram_id, telegram_id: telegramId }) }); showNotification('Desmarcado', 'success'); loadFlaggedUsers(); } catch (e) {} }
  async function handleSendReminders() { if (!confirm('¿Enviar recordatorios a inactivos?')) return; showNotification('Enviando...', 'info'); try { const r = await fetch(`${API_URL}/api/admin/send_reminders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ admin_id: user.telegram_id }) }); const d = await r.json(); if (d.success) showModal('📅 Enviados', 'Recordatorios enviados'); else showModal('Error', d.error, 'error'); } catch (e) {} }

  const validateAddress = (address, currency) => { if (!address) return false; if (currency === 'USDT' || currency === 'USDT_TRX' || currency === 'USDT_BSC') return /^T[A-Za-z0-9]{33}$/.test(address); return true; };

  async function processWithdrawal() {
    if (!withdrawAddress || !withdrawAmount) return showModal('Error', 'Completa todo', 'error');
    if (!validateAddress(withdrawAddress, withdrawCurrency)) return showModal('Error', 'Dirección inválida', 'error');
    const usd = parseFloat(withdrawAmount);
    if (usd < MIN_WITHDRAWAL_USD) return showModal('Error', `Mínimo ${MIN_WITHDRAWAL_USD} USD`, 'error');
    const kabutoToBurn = usd / KABUTO_PRICE_USD;
    if (kabutoToBurn > holdingWallet) return showModal('Error', 'Saldo insuficiente', 'error');
    try { const r = await fetch(`${API_URL}/api/withdraw`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ telegram_id: user.telegram_id, amount: usd, currency: withdrawCurrency, address: withdrawAddress }) });
      const data = await r.json();
      if (data.success) { showModal('Retiro Enviado', `${usd} USD en ${withdrawCurrency}.\nTXID: ${data.tx_id || 'pending'}`); setHoldingWallet(prev => prev - kabutoToBurn); setShowWithdrawBox(false); setWithdrawAddress(''); setWithdrawAmount(''); }
      else showModal('Error', data.error, 'error');
    } catch (e) { showModal('Error', 'No se pudo conectar', 'error'); }
  }

  const handleMaxWithdraw = () => setWithdrawAmount((holdingWallet * KABUTO_PRICE_USD).toFixed(2));
  const copyLink = () => { navigator.clipboard.writeText(referralLink); showModal('Copiado', 'Enlace copiado'); };
  const openPaymentsChannel = () => { if (window.Telegram?.WebApp) window.Telegram.WebApp.openTelegramLink('https://t.me/kabuto_payments'); else window.open('https://t.me/kabuto_payments', '_blank'); };

  const totalBalance = holdingWallet + poolWallet;
  const totalUsdValue = (totalBalance * KABUTO_PRICE_USD).toFixed(4);
  const dailyProfit = (hashPower * MINING_MULTIPLIER * 86400).toFixed(2);
  const currentLevel = Math.floor(hashPower / 100) + 1;
  const nextLevelCost = currentLevel * 500;
  const activeVipReferrals = referrals.filter(r => r.is_vip === 1).length;
  const canWithdraw = user.is_vip === 1 && activeVipReferrals >= REQUIRED_VIP_REFERRALS;

  if (loading) {
    return (
      <div className="phone-screen loading-screen" translate="no">
        <img src="/kabuto-coin.png" alt="Kabuto" className="loading-coin-img" onError={(e) => { e.target.style.display='none'; e.target.nextSibling.style.display='block'; }} />
        <div className="loading-coin" style={{display:'none'}}>🦏</div>
        <p>Cargando Kabuto Miner...</p>
      </div>
    );
  }

  if (isAdmin && adminView) {
    return (
      <div className="phone-screen admin-screen" translate="no">
        <header className="top-bar">
          <div className="user-info">
            <img src="/avatar.png" alt="Avatar" className="avatar" onError={(e) => e.target.src='https://ui-avatars.com/api/?name=Admin&background=ffd700&color=000'} />
            <div className="user-details"><span className="user-name">Panel Admin</span><span className="user-level">Control Total</span></div>
          </div>
          <button className="view-toggle-btn" onClick={() => setAdminView(false)}>🎮 Vista Jugador</button>
        </header>
        <div className="admin-container">
          <div className="admin-section-title">💰 Finanzas Reales</div>
          <div className="admin-finance-grid">
            <div className="admin-finance-card"><span>Ingresos Totales</span><strong className="text-blue">${Number(adminStats?.total_income || 0).toFixed(2)} USD</strong></div>
            <div className="admin-finance-card"><span>Fondo Liquidez (70%)</span><strong className="text-blue">${Number(adminStats?.liquidity_70 || 0).toFixed(2)} USD</strong></div>
            <div className="admin-finance-card"><span>Tu Ganancia (30%)</span><strong className="text-green">${Number(adminStats?.admin_profit_30 || 0).toFixed(2)} USD</strong></div>
            <div className="admin-finance-card"><span>Total Retiros Pagados</span><strong>${Number(adminStats?.total_withdrawn || 0).toFixed(2)} USD</strong></div>
          </div>

          <div className="admin-section-title">📊 Estadísticas</div>
          <div className="admin-stats-grid">
            <div className="admin-stat-card"><span>👥 Totales</span><strong>{adminStats?.total_users || 0}</strong></div>
            <div className="admin-stat-card"><span>👑 VIPs</span><strong>{adminStats?.purchases?.length || 0}</strong></div>
            <div className="admin-stat-card"><span>💵 Balance</span><strong>${Number(adminStats?.total_balance || 0).toFixed(0)}</strong></div>
            <div className="admin-stat-card"><span>💸 Retiros</span><strong>{adminStats?.withdrawals?.length || 0}</strong></div>
          </div>

          <div className="admin-section-title">📊 Gráfico (7 días)</div>
          <div className="admin-chart-container">
            <button onClick={loadChartData} className="buy-btn" style={{marginBottom: '10px', width: 'auto'}}>📈 Cargar gráfico</button>
            {chartData.length > 0 && (
              <div className="admin-chart">
                {chartData.map((d, i) => {
                  const maxIncome = Math.max(...chartData.map(x => Math.max(x.income, x.withdrawals)), 1);
                  return (
                    <div key={i} className="chart-bar-group">
                      <div className="chart-bars">
                        <div className="chart-bar income" style={{height: `${(d.income / maxIncome) * 100}%`}} title={`Ingresos: $${d.income.toFixed(2)}`}></div>
                        <div className="chart-bar withdrawal" style={{height: `${(d.withdrawals / maxIncome) * 100}%`}} title={`Retiros: $${d.withdrawals.toFixed(2)}`}></div>
                      </div>
                      <small>{d.date.split('-')[2]}</small>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="chart-legend">
              <span className="legend-item"><span className="legend-color income"></span>Ingresos</span>
              <span className="legend-item"><span className="legend-color withdrawal"></span>Retiros</span>
            </div>
          </div>

          <div className="admin-section-title">📢 Mensaje Masivo</div>
          {!showBroadcast ? (
            <button className="claim-btn vip-btn" onClick={() => setShowBroadcast(true)} style={{marginBottom: '20px', padding: '10px'}}>📢 ENVIAR MENSAJE A TODOS</button>
          ) : (
            <div className="broadcast-box">
              <textarea placeholder="Escribe tu mensaje..." value={broadcastMessage} onChange={(e) => setBroadcastMessage(e.target.value)} rows={4} className="ref-input" style={{width: '100%', marginBottom: '10px', resize: 'vertical'}} />
              <div style={{display: 'flex', gap: '10px'}}>
                <button className="claim-btn vip-btn" onClick={handleBroadcast} disabled={broadcasting} style={{flex: 1, padding: '10px'}}>{broadcasting ? 'Enviando...' : '✅ ENVIAR'}</button>
                <button className="claim-btn" onClick={() => setShowBroadcast(false)} style={{flex: 1, padding: '10px', background: '#555'}}>Cancelar</button>
              </div>
            </div>
          )}

          <div className="admin-section-title">🛡️ Anti-Fraude + Notificaciones</div>
          <div style={{display: 'flex', gap: '10px', marginBottom: '15px', flexWrap: 'wrap'}}>
            <button className="buy-btn" onClick={loadFlaggedUsers} style={{width: 'auto', background: '#ff4444', color: '#fff'}}>🚨 Ver sospechosos</button>
            <button className="buy-btn" onClick={handleSendReminders} style={{width: 'auto', background: '#2196f3', color: '#fff'}}>📅 Enviar recordatorios</button>
          </div>
          {flaggedUsers.length > 0 && (
            <div className="admin-users-list" style={{marginBottom: '20px'}}>
              {flaggedUsers.map(u => (
                <div key={u.telegram_id} className="admin-user-card banned">
                  <div className="admin-user-info">
                    <strong>🚨 {u.first_name} (MARCA)</strong>
                    <span className="user-id-text">ID: {u.telegram_id}</span>
                    <span className="user-finances">{u.flag_reason}</span>
                  </div>
                  <div className="admin-user-actions">
                    <button className="ban-btn unban" onClick={() => handleUnflag(u.telegram_id)}>Desmarcar</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="admin-section-title">🔍 Buscar Usuario</div>
          <input type="text" placeholder="Nombre, username o ID..." value={adminSearch} onChange={(e) => handleAdminSearch(e.target.value)} className="ref-input" style={{width: '100%', marginBottom: '10px'}} />
          {adminSearchResults.length > 0 && (
            <div className="admin-users-list">
              {adminSearchResults.map(u => (
                <div key={u.telegram_id} className={`admin-user-card ${u.banned ? 'banned' : ''}`}>
                  <div className="admin-user-info">
                    <strong>{u.first_name} {u.vip_level > 0 ? '👑' : ''} {u.banned ? '🚫' : ''}</strong>
                    <span className="user-id-text">ID: {u.telegram_id}</span>
                    <span className="user-finances">Balance: ${Number(u.balance || 0).toFixed(2)} | VIP: {u.vip_level} | HP: {u.hash_power}</span>
                  </div>
                  <div className="admin-user-actions">
                    {u.vip_level > 0 ? <button className="ban-btn unban" onClick={() => removeVipManual(u.telegram_id)}>Quitar VIP</button> :
                    <select onChange={(e) => { if (e.target.value) activateVipManual(u.telegram_id, e.target.value); e.target.value=''; }} defaultValue="" style={{background:'#21262d',color:'#fff',border:'1px solid #30363d',borderRadius:'4px',padding:'4px 8px',fontSize:'12px'}}>
                      <option value="">+ VIP</option><option value="1">VIP 1</option><option value="2">VIP 2</option><option value="3">VIP 3</option><option value="4">VIP 4</option><option value="5">VIP 5</option>
                    </select>}
                    {u.telegram_id !== ADMIN_ID && <button className={`ban-btn ${u.banned ? 'unban' : ''}`} onClick={() => handleBanUser(u.telegram_id)}>{u.banned ? 'Desbloquear' : 'Bloquear'}</button>}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="admin-section-title">Usuarios ({adminUsers.length})</div>
          <div className="admin-users-list">
            {adminUsers.length === 0 ? <p className="no-friends">Aún no hay usuarios registrados.</p> : adminUsers.map(u => (
              <div key={u.telegram_id} className={`admin-user-card ${u.banned ? 'banned' : ''}`}>
                <div className="admin-user-info">
                  <strong>{u.first_name} {u.vip_level > 0 ? '👑' : ''} {u.banned ? '🚫' : ''} {u.flagged ? '🚨' : ''}</strong>
                  <span className="user-id-text">ID: {u.telegram_id}</span>
                  <span className="user-finances">Balance: ${Number(u.balance || 0).toFixed(2)} | VIP: {u.vip_level}</span>
                </div>
                <div className="admin-user-actions">
                  <span className="user-hash">⚡ {u.hash_power} H/s</span>
                  {u.vip_level > 0 ? <button className="ban-btn unban" onClick={() => removeVipManual(u.telegram_id)}>Quitar VIP</button> :
                  <select onChange={(e) => { if (e.target.value) activateVipManual(u.telegram_id, e.target.value); e.target.value=''; }} defaultValue="" style={{background:'#21262d',color:'#fff',border:'1px solid #30363d',borderRadius:'4px',padding:'4px 8px',fontSize:'12px'}}>
                    <option value="">+ VIP</option><option value="1">VIP 1</option><option value="2">VIP 2</option><option value="3">VIP 3</option><option value="4">VIP 4</option><option value="5">VIP 5</option>
                  </select>}
                  {u.telegram_id !== ADMIN_ID && <button className={`ban-btn ${u.banned ? 'unban' : ''}`} onClick={() => handleBanUser(u.telegram_id)}>{u.banned ? 'Desbloquear' : 'Bloquear'}</button>}
                </div>
              </div>
            ))}
          </div>
        </div>
        {modal.show && (
          <div className="modal-overlay">
            <div className={`modal-box ${modal.type === 'error' ? 'error' : 'success'}`}>
              <span className="modal-icon">{modal.type === 'error' ? '❌' : '✅'}</span>
              <h3 className="modal-title">{modal.title}</h3>
              <p className="modal-message" style={{whiteSpace: 'pre-line'}}>{modal.message}</p>
              <button className="claim-btn" onClick={closeModal} style={{marginTop: '15px', width: '100%'}}>CERRAR</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="phone-screen" translate="no">
      {notification && <div className={`notification ${notification.type}`}>{notification.message}</div>}

      <header className="top-bar">
        <div className="user-info">
          <img src="/avatar.png" alt="Avatar" className="avatar" onError={(e) => e.target.src='https://ui-avatars.com/api/?name=' + encodeURIComponent(user.first_name) + '&background=ffd700&color=000'} />
          <div className="user-details">
            <span className="user-name">{user.first_name}</span>
            <span className="user-level">{accountLevel.icon} {accountLevel.name} • Nivel {currentLevel} • {user.is_vip ? 'VIP ✅' : 'FREE'}{flagged && ' • 🚨'}</span>
          </div>
        </div>
        <div className="top-bar-right">
          {isAdmin && <button className="view-toggle-btn" onClick={() => setAdminView(true)}>🛠️</button>}
          <button className="view-toggle-btn" onClick={() => setActiveTab('whitepaper')}>📖</button>
        </div>
      </header>

      {activeTab !== 'whitepaper' && (
        <div className="assets-section">
          <div className="price-tag">Precio $KABUTO: ${KABUTO_PRICE_USD}</div>
          <span className="assets-label">TOTAL ACTIVOS</span>
          <h1 className="total-balance">{totalBalance.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 4})} <span className="token-symbol">$KABUTO</span></h1>
          <span className="usd-value">≈ ${totalUsdValue} USD</span>
          <div className="wallets">
            <div className="wallet-box"><span>HOLDING WALLET</span><strong>{holdingWallet.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 4})}</strong></div>
            <div className="wallet-box"><span>POOL WALLET</span><strong>{poolWallet.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 4})}</strong></div>
          </div>
          <div className="daily-profit-box">📈 Ganancia Diaria: +{dailyProfit} $KABUTO {boostMultiplier > 1 && `(x${boostMultiplier})`}</div>
        </div>
      )}

      {checkingPayment && (
        <div className="checking-payment-toast">
          <div className="checking-payment-content">
            <div className="spinner-small"></div>
            <div className="checking-payment-text"><strong>Esperando pago...</strong><span>Verificando automáticamente</span></div>
            <button className="checking-payment-close" onClick={() => { setCheckingPayment(false); showNotification('Verificación en segundo plano', 'info'); }}>✕</button>
          </div>
        </div>
      )}

      {activeTab === 'mina' && (
        <div className="coin-area">
          <div className="profit-text">⚡ {hashPower} H/s {boostMultiplier > 1 && `(x${boostMultiplier})`}</div>
          <img src="/kabuto-coin.png" alt="Kabuto Coin" className="kabuto-coin" onError={(e) => e.target.innerHTML='🦏'} />
          <button className="claim-btn" onClick={handleClaim}>RECLAMAR +{poolWallet.toFixed(4)} $KABUTO</button>
        </div>
      )}

      {activeTab === 'mejoras' && (
        <div className="shop-container">
          <h2 className="shop-title">MINER LEVEL</h2>
          <p className="shop-subtitle">Sube de nivel para aumentar tu velocidad de minado</p>
          <div className="level-up-card">
            <div className="level-info">
              <span className="current-level">Nivel Actual: {currentLevel}</span>
              <span className="next-level">Siguiente Nivel: {currentLevel + 1}</span>
              <span className="next-level-bonus">+50 H/s</span>
            </div>
            <div className="level-cost">Costo: {nextLevelCost} $KABUTO</div>
            <button className="buy-btn" onClick={handleBuyLevel} disabled={totalBalance < nextLevelCost}>SUBIR DE NIVEL</button>
          </div>
          <div className="divider"></div>
          <h2 className="shop-title">MEJORAS VIP</h2>
          <p className="shop-subtitle">Desbloquea poder máximo y habilita retiros pagando con cripto</p>
          <div className="currency-selector">
            <label>Pagar con:</label>
            <div className="currency-grid">
              {CURRENCIES.map(c => (
                <button key={c.code} className={`currency-btn ${selectedCurrency === c.code ? 'selected' : ''}`} onClick={() => setSelectedCurrency(c.code)}>
                  <img src={c.img} alt={c.name} className="currency-icon-img" onError={(e) => { e.target.style.display='none'; e.target.nextSibling.style.display='inline'; }} />
                  <span className="currency-icon" style={{display:'none', fontSize:'24px'}}>{c.icon}</span>
                  <span className="currency-code">{c.name}</span>
                </button>
              ))}
            </div>
          </div>
          {realUpgrades.map(up => (
            <div key={up.id} className="upgrade-card vip-card">
              <div className="upgrade-info">
                <img src={up.image} alt={up.name} className="upgrade-emoji" onError={(e) => e.target.innerHTML='💎'} />
                <div><strong>{up.name}</strong><span className="upgrade-profit">+{up.hashAdd} H/s</span></div>
              </div>
              <button className="buy-btn vip-btn" onClick={() => handleBuyReal(up)} disabled={creatingInvoice}>{creatingInvoice ? '...' : `$${up.cost_ton}`}</button>
            </div>
          ))}
          <div className="divider"></div>
          <h2 className="shop-title">🚀 BOOSTS TEMPORALES</h2>
          <p className="shop-subtitle">Mina más rápido temporalmente con $KABUTO</p>
          {activeBoosts.length > 0 && (
            <div className="active-boosts-banner">
              <strong>⚡ Boosts activos (x{boostMultiplier})</strong>
              {activeBoosts.map((b, i) => (<div key={i} className="active-boost-item">{b.boost_type} → vence {new Date(b.expires_at).toLocaleTimeString('es-ES', {hour: '2-digit', minute: '2-digit'})}</div>))}
            </div>
          )}
          <div className="upgrade-card boost-card"><div className="upgrade-info"><span className="upgrade-emoji">⚡</span><div><strong>2x Minado 1h</strong><span className="upgrade-profit">Doble velocidad 1 hora</span></div></div><button className="buy-btn" onClick={() => handleBuyBoost('2x_1h', 100, '2x Minado 1h')}>100</button></div>
          <div className="upgrade-card boost-card"><div className="upgrade-info"><span className="upgrade-emoji">🚀</span><div><strong>3x Minado 1h</strong><span className="upgrade-profit">Triple velocidad 1 hora</span></div></div><button className="buy-btn" onClick={() => handleBuyBoost('3x_1h', 250, '3x Minado 1h')}>250</button></div>
          <div className="upgrade-card boost-card"><div className="upgrade-info"><span className="upgrade-emoji">⏰</span><div><strong>2x Minado 24h</strong><span className="upgrade-profit">Doble velocidad 24 horas</span></div></div><button className="buy-btn" onClick={() => handleBuyBoost('2x_24h', 1000, '2x Minado 24h')}>1000</button></div>
          <div className="upgrade-card boost-card"><div className="upgrade-info"><span className="upgrade-emoji">🤖</span><div><strong>Auto-Minero 24h</strong><span className="upgrade-profit">Mina sin entrar</span></div></div><button className="buy-btn" onClick={() => handleBuyBoost('auto_24h', 500, 'Auto-Minero 24h')}>500</button></div>
        </div>
      )}

      {paymentInfo && (
        <div className="payment-modal-overlay">
          <div className="payment-modal">
            <h3>Pago de {paymentInfo.name}</h3>
            <p>Se abrió Plisio para pagar <strong>${paymentInfo.cost_ton} USD</strong> en {selectedCurrency}.</p>
            <p className="payment-warning">La verificación es automática.</p>
            <button className="claim-btn vip-btn" onClick={() => setPaymentInfo(null)} style={{marginTop: '20px'}}>Cerrar</button>
          </div>
        </div>
      )}

      {activeTab === 'tareas' && (
        <div className="shop-container">
          <h2 className="shop-title">TAREAS DIARIAS</h2>
          <p className="shop-subtitle">Gana $KABUTO gratis completando tareas</p>
          <div className="daily-bonus-card">
            <div className="daily-bonus-header">
              <img src="/daily-bonus.png" alt="Bonus" className="daily-bonus-icon" onError={(e) => { e.target.style.display='none'; e.target.nextSibling.style.display='inline-block'; }} />
              <span className="daily-bonus-icon-fallback" style={{display:'none', fontSize:'40px'}}>📅</span>
              <div><strong>Bonus Diario</strong><span className="daily-bonus-streak">🔥 Racha: {loginStreak.streak} día(s)</span></div>
            </div>
            <div className="streak-progress">
              {[1,2,3,4,5,6,7].map(day => (<div key={day} className={`streak-day ${(loginStreak.streak || 0) >= day ? 'completed' : ''}`}><span>D{day}</span><small>+{day * 10}</small></div>))}
            </div>
            <button className="claim-btn" onClick={handleClaimDaily} disabled={loginStreak.already_claimed || claimingDaily} style={{marginTop: '12px', padding: '10px', fontSize: '14px'}}>{loginStreak.already_claimed ? '✅ Ya reclamado' : (claimingDaily ? '...' : `🎁 Reclamar +${loginStreak.next_bonus} $KABUTO`)}</button>
          </div>
          <div className="roulette-card">
            <div className="roulette-header">
              <img src="/roulette.png" alt="Ruleta" className="roulette-icon" onError={(e) => { e.target.style.display='none'; e.target.nextSibling.style.display='inline-block'; }} />
              <span className="roulette-icon-fallback" style={{display:'none', fontSize:'40px'}}>🎡</span>
              <div><strong>Ruleta Diaria</strong><span className="roulette-desc">Gana hasta 500 $KABUTO</span></div>
            </div>
            <div className={`roulette-wheel ${spinning ? 'spinning' : ''}`}>{spinning ? '🎲' : '🎡'}</div>
            <button className="claim-btn vip-btn" onClick={handleSpinRoulette} disabled={!rouletteStatus.can_spin || spinning} style={{marginTop: '12px', padding: '10px', fontSize: '14px'}}>{!rouletteStatus.can_spin ? '⏰ Ya giraste hoy' : (spinning ? '🌀 Girando...' : '🎡 ¡GIRAR AHORA!')}</button>
            {rouletteStatus.history && rouletteStatus.history.length > 0 && (<div className="roulette-history"><small>Últimos giros:</small>{rouletteStatus.history.slice(0, 3).map((h, i) => (<span key={i} className="roulette-history-item">+{h.reward}</span>))}</div>)}
          </div>
          <div className="divider"></div>
          <h3 className="shop-title" style={{fontSize: '16px'}}>📋 Otras Tareas</h3>
          {tasks.map(task => { const isClaimed = claimedTasks.includes(task.id); return (
            <div key={task.id} className={`upgrade-card task-card ${isClaimed ? 'owned-card' : ''}`}>
              <div className="upgrade-info">
                <img src={task.image} alt={task.name} className="task-icon-img" onError={(e) => { e.target.style.display='none'; e.target.nextSibling.style.display='inline-flex'; }} />
                <span className="task-icon-fallback" style={{display:'none'}}>{task.icon}</span>
                <div><strong>{task.name}</strong><span className="upgrade-profit">+{task.reward} $KABUTO</span></div>
              </div>
              <button className="buy-btn" onClick={() => handleClaimTask(task)} disabled={isClaimed}>{isClaimed ? 'HECHO ✅' : 'RECLAMAR'}</button>
            </div>
          ); })}
        </div>
      )}

      {activeTab === 'amigos' && (
        <div className="shop-container">
          <h2 className="shop-title">INVITA Y GANA</h2>
          <p className="shop-subtitle">Necesitas {REQUIRED_VIP_REFERRALS} referidos VIP para desbloquear retiros.</p>
          <div className="referral-stats">
            <div className="ref-stat-item"><span className="ref-stat-value">{referrals.length}</span><span className="ref-stat-label">Total</span></div>
            <div className="ref-stat-item"><span className="ref-stat-value">{activeVipReferrals}</span><span className="ref-stat-label">VIP</span></div>
            <div className="ref-stat-item"><span className="ref-stat-value">{totalReferralEarned.toFixed(2)}</span><span className="ref-stat-label">Ganado</span></div>
          </div>
          <div className="team-wallet-card">
            <div className="team-wallet-info"><span className="team-wallet-title">👥 TEAM WALLET</span><span className="team-wallet-desc">Gana 10% de cada compra VIP + 5% del minado.</span></div>
            <div className="team-wallet-balance"><strong>{teamWallet.toFixed(2)} $KABUTO</strong><button className="buy-btn" onClick={handleClaimTeam} disabled={teamWallet <= 0 || claimingTeam}>{claimingTeam ? '...' : 'RECLAMAR'}</button></div>
          </div>
          <div className="referral-box"><input type="text" value={referralLink} readOnly className="ref-input" /><button className="buy-btn" onClick={copyLink}>Copiar</button></div>
          <h3 className="friends-title">MIS AMIGOS ({referrals.length})</h3>
          {referrals.length === 0 ? <p className="no-friends">Aún no has invitado a nadie. ¡Comparte tu enlace!</p> : referrals.map((ref) => (
            <div key={ref.telegram_id} className={`upgrade-card ${ref.is_vip ? 'vip-card' : ''}`}>
              <div className="upgrade-info">
                <span className="upgrade-emoji">{ref.is_vip ? '👑' : '👤'}</span>
                <div><strong>{ref.first_name} {ref.is_vip ? '(VIP)' : '(FREE)'}</strong><span className="upgrade-profit">{ref.is_vip ? `⚡ ${ref.hash_power} H/s` : 'Inactivo'}{ref.commission_earned > 0 && ` · 💰 ${ref.commission_earned.toFixed(2)}`}</span></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'perfil' && (
        <div className="shop-container profile-container">
          <div className="profile-header">
            <img src="/avatar.png" alt="Avatar" className="profile-avatar" onError={(e) => e.target.src='https://ui-avatars.com/api/?name=' + encodeURIComponent(user.first_name) + '&background=ffd700&color=000'} />
            <h2 className="profile-name">{user.first_name}</h2>
            <span className="profile-id">ID: {user.telegram_id}</span>
          </div>
          <div className="stats-grid">
            <div className="stat-item"><span className="stat-label">⚡ Poder de Minado</span><strong className="stat-value">{hashPower} H/s</strong></div>
            <div className="stat-item"><span className="stat-label">📊 Nivel de Minero</span><strong className="stat-value">Nivel {currentLevel}</strong></div>
            <div className="stat-item"><span className="stat-label">👑 Nivel VIP</span><strong className="stat-value">{user.vip_level}</strong></div>
            <div className="stat-item"><span className="stat-label">⛏️ Total Minado</span><strong className="stat-value">{user.total_mined.toFixed(2)}</strong></div>
          </div>

          <div className="account-level-card" style={{borderColor: accountLevel.color}}>
            <div className="account-level-header">
              <span className="account-level-icon" style={{color: accountLevel.color}}>{accountLevel.icon}</span>
              <div className="account-level-info"><strong style={{color: accountLevel.color}}>Cuenta {accountLevel.name}</strong><small>Beneficio: {accountLevel.perk}</small></div>
            </div>
            {accountLevel.next && (
              <div className="account-level-progress">
                <div className="progress-bar" style={{background: '#222'}}><div className="progress-fill" style={{width: `${Math.min(100, ((user.total_mined || 0) / accountLevel.next) * 100)}%`, background: accountLevel.color}}></div></div>
                <small className="progress-text">{(user.total_mined || 0).toFixed(0)} / {accountLevel.next} para subir</small>
              </div>
            )}
          </div>

          <div className="achievements-section">
            <h3 className="achievements-title">🏆 LOGROS ({achievements.filter(a => a.unlocked).length}/{achievements.length})</h3>
            <div className="achievements-grid">
              {achievements.map(ach => (
                <div key={ach.code} className={`achievement-badge ${ach.unlocked ? 'unlocked' : 'locked'}`}>
                  <span className="achievement-icon">{ach.icon}</span>
                  <div className="achievement-info">
                    <strong>{ach.name}</strong>
                    <small>{ach.description}</small>
                    {ach.unlocked ? <span className="achievement-reward">+{ach.reward} ✅</span> : <span className="achievement-reward locked">+{ach.reward} 🔒</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="leaderboard-section">
            <h3 className="leaderboard-title">🏅 RANKING TOP 10</h3>
            <div className="leaderboard-tabs">
              <button className={leaderboardType === 'balance' ? 'active' : ''} onClick={() => { setLeaderboardType('balance'); loadLeaderboard('balance'); }}>💰 Balance</button>
              <button className={leaderboardType === 'hash_power' ? 'active' : ''} onClick={() => { setLeaderboardType('hash_power'); loadLeaderboard('hash_power'); }}>⚡ Hash Power</button>
              <button className={leaderboardType === 'total_mined' ? 'active' : ''} onClick={() => { setLeaderboardType('total_mined'); loadLeaderboard('total_mined'); }}>⛏️ Total Minado</button>
            </div>
            <div className="leaderboard-list">
              {leaderboard.length === 0 ? <p className="no-friends">Aún no hay datos para el ranking</p> : leaderboard.map((u) => (
                <div key={u.telegram_id} className={`leaderboard-row ${u.telegram_id === user.telegram_id ? 'me' : ''} rank-${u.rank}`}>
                  <span className="rank-badge">{u.rank === 1 ? '🥇' : u.rank === 2 ? '🥈' : u.rank === 3 ? '🥉' : `#${u.rank}`}</span>
                  <span className="rank-name">{u.name} {u.vip_level > 0 ? '👑' : ''} {u.telegram_id === user.telegram_id ? '(Tú)' : ''}</span>
                  <span className="rank-value">{leaderboardType === 'balance' && `$${Number(u.value || 0).toFixed(2)}`}{leaderboardType === 'hash_power' && `${u.value} H/s`}{leaderboardType === 'total_mined' && `${Number(u.value || 0).toFixed(2)}`}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="wallet-section transparent-section" onClick={openPaymentsChannel} style={{cursor: 'pointer'}}>
            <h3>🛡️ CANAL DE TRANSPARENCIA</h3>
            <p>Verifica todos los pagos reales en tiempo real.</p>
            <button className="claim-btn transparent-btn">📜 VER COMPROBANTES</button>
          </div>
          <div className={canWithdraw ? 'wallet-section blue unlocked' : 'wallet-section blue locked'}>
            <h3>BILLETERA DE RETIRO</h3>
            <div className="withdraw-reqs">
              <p>Requisitos para retirar:</p>
              <span className={user.is_vip ? 'req-tag ok' : 'req-tag no'}>{user.is_vip ? '✅' : '❌'} Comprar VIP</span>
              <span className={activeVipReferrals >= REQUIRED_VIP_REFERRALS ? 'req-tag ok' : 'req-tag no'}>{activeVipReferrals >= REQUIRED_VIP_REFERRALS ? '✅' : '❌'} Invitar {REQUIRED_VIP_REFERRALS} amigos VIP ({activeVipReferrals}/{REQUIRED_VIP_REFERRALS})</span>
              <span className="req-tag ok">💵 Mínimo: {MIN_WITHDRAWAL_USD} USD (Fee: {WITHDRAWAL_FEE} USD) | Máx 3/día, $50/día</span>
            </div>
            <button className="claim-btn connect-wallet-btn" onClick={() => canWithdraw ? setShowWithdrawBox(true) : showModal('Requisitos Incompletos', 'Necesitas VIP y 6 referidos VIP para retirar.', 'error')}>{canWithdraw ? '💸 RETIRAR GANANCIAS' : '🔒 BLOQUEADO'}</button>
          </div>
          {showWithdrawBox && (
            <div className="payment-modal-overlay">
              <div className="payment-modal">
                <h3>Retirar Ganancias</h3>
                <p>Saldo disponible: <strong>${(holdingWallet * KABUTO_PRICE_USD).toFixed(2)} USD</strong></p>
                <div className="currency-selector">
                  <label>Moneda:</label>
                  <div className="currency-grid">
                    {CURRENCIES.map(c => (
                      <button key={c.code} className={`currency-btn ${withdrawCurrency === c.code ? 'selected' : ''}`} onClick={() => setWithdrawCurrency(c.code)}>
                        <img src={c.img} alt={c.name} className="currency-icon-img" onError={(e) => { e.target.style.display='none'; e.target.nextSibling.style.display='inline'; }} />
                        <span className="currency-icon" style={{display:'none', fontSize:'24px'}}>{c.icon}</span>
                        <span className="currency-code">{c.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <p className="payment-warning">Mínimo: {MIN_WITHDRAWAL_USD} USD | Comisión: {WITHDRAWAL_FEE} USD | Máx 3 retiros/día</p>
                <div className="withdraw-input-box"><input type="number" step="0.01" placeholder="Monto en USD" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} className="ref-input" /><button onClick={handleMaxWithdraw} className="max-btn">MAX</button></div>
                <input type="text" placeholder={`Tu dirección ${withdrawCurrency}`} value={withdrawAddress} onChange={(e) => setWithdrawAddress(e.target.value)} className="ref-input" style={{marginBottom: '15px'}} />
                <button className="claim-btn vip-btn" onClick={processWithdrawal}>CONFIRMAR RETIRO</button>
                <button className="claim-btn" onClick={() => setShowWithdrawBox(false)} style={{marginTop: '10px', background: '#555'}}>CANCELAR</button>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'whitepaper' && (
        <div className="shop-container whitepaper-container">
          <button className="back-btn" onClick={() => setActiveTab('mina')}>← Volver</button>
          <h1 className="whitepaper-title">Whitepaper $KABUTO</h1>
          <p className="whitepaper-subtitle">La economía detrás de Kabuto Miner</p>
          <div className="whitepaper-card">
            <h3>📊 Tokenómica</h3>
            <div className="wp-stat-row"><span>Nombre del Token</span><strong>Kabuto Miner ($KABUTO)</strong></div>
            <div className="wp-stat-row"><span>Suministro Total</span><strong>1,000,000,000 $KABUTO</strong></div>
            <div className="wp-stat-row"><span>Precio Actual</span><strong>$0.001 USD</strong></div>
            <div className="wp-stat-row"><span>Red</span><strong>Telegram (Interna)</strong></div>
          </div>
          <div className="whitepaper-card">
            <h3>💰 Modelo de Sostenibilidad</h3>
            <p>El sistema está diseñado para ser 100% sostenible. Cuando un usuario invierte en mejoras VIP, el dinero se divide así:</p>
            <ul className="wp-list">
              <li>✅ <strong>70%</strong> va al Fondo de Liquidez (para pagar retiros).</li>
              <li>✅ <strong>30%</strong> es la ganancia del creador y mantenimiento.</li>
            </ul>
            <p>Para retirar, un usuario debe activar el VIP mínimo y traer 6 referidos VIP. Esto asegura que siempre entre dinero nuevo antes de que salga.</p>
          </div>
          <div className="whitepaper-card">
            <h3>🪲 ¿Qué es Kabuto Miner?</h3>
            <p>Es un juego Play-to-Earn inspirado en el escarabajo rinoceronte (Kabutomushi). Los usuarios simulan la excavación de bloques, ganando $KABUTO que puede ser canjeado por criptomonedas reales via Plisio.</p>
          </div>
          <div className="whitepaper-card">
            <h3>🏅 Niveles de Cuenta</h3>
            <ul className="wp-list">
              <li>🥉 Bronce (0+) - Acceso básico</li>
              <li>🥈 Plata (100+) - Bonus diario x1.2</li>
              <li>🥇 Oro (1000+) - Bonus diario x1.5</li>
              <li>💎 Diamante (10000+) - Sin comisión de retiro</li>
            </ul>
          </div>
        </div>
      )}

      {modal.show && (
        <div className="modal-overlay">
          <div className={`modal-box ${modal.type === 'error' ? 'error' : 'success'}`}>
            <span className="modal-icon">{modal.type === 'error' ? '❌' : '✅'}</span>
            <h3 className="modal-title">{modal.title}</h3>
            <p className="modal-message" style={{whiteSpace: 'pre-line'}}>{modal.message}</p>
            <button className="claim-btn" onClick={closeModal} style={{marginTop: '15px', width: '100%'}}>CERRAR</button>
          </div>
        </div>
      )}

      {activeTab !== 'whitepaper' && (
        <nav className="bottom-nav">
          <div className={activeTab === 'mina' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveTab('mina')}><img src="/icon-mine.png" alt="Mina" className="nav-icon" onError={(e) => e.target.innerHTML='⛏️'} /><span>Mina</span></div>
          <div className={activeTab === 'tareas' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveTab('tareas')}><img src="/icon-tasks.png" alt="Tareas" className="nav-icon" onError={(e) => e.target.innerHTML='📋'} /><span>Tareas</span></div>
          <div className={activeTab === 'mejoras' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveTab('mejoras')}><img src="/icon-shop.png" alt="Mejoras" className="nav-icon" onError={(e) => e.target.innerHTML='🛒'} /><span>Mineros</span></div>
          <div className={activeTab === 'amigos' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveTab('amigos')}><img src="/icon-friends.png" alt="Amigos" className="nav-icon" onError={(e) => e.target.innerHTML='👥'} /><span>Amigos</span></div>
          <div className={activeTab === 'perfil' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveTab('perfil')}><img src="/icon-profile.png" alt="Perfil" className="nav-icon" onError={(e) => e.target.innerHTML='👤'} /><span>Perfil</span></div>
        </nav>
      )}
    </div>
  );
}

export default App;

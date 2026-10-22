import { useState, useEffect, useRef } from 'react';
import './App.css';

const API_URL = 'https://kabutominer.onrender.com';
const ADMIN_ID = '1159596878';

const KABUTO_PRICE_USD = 0.001;
// 🚀 FIX: Velocidad de minado restaurada a 10 H/s base (sin romper economía)
const MINING_MULTIPLIER = 0.0001; // Antes era 0.0000015 - ahora mina mucho más rápido
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
  const [adminStats, setAdminStats] = useState(null);
  const [adminUsers, setAdminUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showWithdrawBox, setShowWithdrawBox] = useState(false);
  const [withdrawAddress, setWithdrawAddress] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawCurrency, setWithdrawCurrency] = useState('TON');
  const [selectedCurrency, setSelectedCurrency] = useState('TON');

  const [adminView, setAdminView] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [modal, setModal] = useState({ show: false, title: '', message: '', type: 'success' });
  const [claimedTasks, setClaimedTasks] = useState([]);
  const [paymentInfo, setPaymentInfo] = useState(null);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [notification, setNotification] = useState(null);
  const [creatingInvoice, setCreatingInvoice] = useState(false);

  const stateRef = useRef();
  stateRef.current = { holdingWallet, poolWallet, hashPower };
  const checkPaymentIntervalRef = useRef(null);

  const showModal = (title, message, type = 'success') => {
    setModal({ show: true, title, message, type });
  };
  const closeModal = () => setModal({ show: false, title: '', message: '', type: '' });
  const showNotification = (message, type = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  // =====================================================
  // RELOAD USER STATE - función centralizada
  // =====================================================
  async function reloadUserState(telegramId) {
    try {
      const r = await fetch(`${API_URL}/api/state/${telegramId}`);
      const data = await r.json();
      if (data && !data.error) {
        setUser(prev => ({
          ...prev,
          balance: data.balance,
          hash_power: data.hash_power,
          vip_level: data.vip_level,
          total_mined: data.total_mined,
          is_vip: data.vip_level > 0 ? 1 : 0
        }));
        setHoldingWallet(Number(data.balance) || 0);
        setHashPower(Number(data.hash_power) || 10);
        setIsAdmin(data.is_admin === true);
        console.log('✅ Estado recargado:', data);
      }
    } catch (err) {
      console.error('Error reloadUserState:', err);
    }
  }

  // =====================================================
  // RELOAD ADMIN STATS
  // =====================================================
  async function reloadAdminStats() {
    try {
      const r = await fetch(`${API_URL}/api/admin/stats?admin_id=${user.telegram_id}`);
      const data = await r.json();
      if (data && !data.error) {
        setAdminStats(data);
        setAdminUsers(data.users || []);
        console.log('✅ Admin stats recargado');
      }
    } catch (err) {
      console.error('Error reloadAdminStats:', err);
    }
  }

  // =====================================================
  // LOGIN
  // =====================================================
  useEffect(() => {
    async function login() {
      let tgId = '1159596878';
      let tgName = 'Admin';
      let tgUsername = '';
      let refBy = null;

      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.ready();
        window.Telegram.WebApp.expand();
        const tgUser = window.Telegram.WebApp.initDataUnsafe?.user;
        if (tgUser) {
          tgId = String(tgUser.id);
          tgName = tgUser.first_name;
          tgUsername = tgUser.username || '';
          const startParam = window.Telegram.WebApp.initDataUnsafe?.start_param;
          if (startParam && startParam.startsWith('ref_')) {
            refBy = startParam.replace('ref_', '');
          }
        }
      }

      setReferralLink(`https://t.me/Kabutominer_bot?start=ref_${tgId}`);

      try {
        const r = await fetch(`${API_URL}/api/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ telegram_id: tgId, username: tgUsername, first_name: tgName })
        });
        const data = await r.json();
        console.log('Login:', data);

        if (data && data.telegram_id) {
          const adminStatus = data.is_admin === true || data.telegram_id === ADMIN_ID;
          setUser({
            telegram_id: data.telegram_id,
            first_name: data.first_name || tgName,
            username: data.username || tgUsername,
            is_vip: data.vip_level > 0 ? 1 : 0,
            isAdmin: adminStatus,
            balance: data.balance || 0,
            hash_power: data.hash_power || 10,
            vip_level: data.vip_level || 0,
            total_mined: data.total_mined || 0
          });
          setHoldingWallet(Number(data.balance) || 0);
          setHashPower(Number(data.hash_power) || 10);
          setIsAdmin(adminStatus);
          loadCompletedTasks(data.telegram_id);
        }
      } catch (err) {
        console.error('Error login:', err);
        showNotification('Error de conexión', 'error');
      } finally {
        setLoading(false);
      }

      if (refBy && refBy !== tgId) {
        try {
          await fetch(`${API_URL}/api/register_referral`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ referrer_id: refBy, referred_id: tgId })
          });
        } catch (err) {
          console.error('Error referido:', err);
        }
      }
    }
    login();
  }, []);

  // =====================================================
  // CARGAR TAREAS
  // =====================================================
  async function loadCompletedTasks(telegramId) {
    try {
      const r = await fetch(`${API_URL}/api/tasks/${telegramId}`);
      const data = await r.json();
      setClaimedTasks(data.completed || []);
    } catch (err) {
      console.error('Error tareas:', err);
    }
  }

  // =====================================================
  // GUARDAR PROGRESO
  // =====================================================
  useEffect(() => {
    if (!user.telegram_id) return;
    const interval = setInterval(async () => {
      try {
        await fetch(`${API_URL}/api/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            telegram_id: user.telegram_id,
            balance: holdingWallet + poolWallet,
            hash_power: hashPower,
            total_mined: user.total_mined
          })
        });
      } catch (err) {
        console.error('Error guardando:', err);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [user.telegram_id, holdingWallet, poolWallet, hashPower]);

  // =====================================================
  // MINADO AUTOMÁTICO - ahora con velocidad correcta
  // =====================================================
  useEffect(() => {
    if (!user.telegram_id || (isAdmin && adminView)) return;
    const interval = setInterval(() => {
      setPoolWallet(prev => prev + (hashPower * MINING_MULTIPLIER));
    }, 1000);
    return () => clearInterval(interval);
  }, [hashPower, user.telegram_id, isAdmin, adminView]);

  // =====================================================
  // CARGAR STATS ADMIN
  // =====================================================
  useEffect(() => {
    if (!isAdmin || !adminView) return;
    reloadAdminStats();
    const interval = setInterval(reloadAdminStats, 10000);
    return () => clearInterval(interval);
  }, [isAdmin, adminView, user.telegram_id]);

  // =====================================================
  // COMPRAR VIP - FIX FACTURAS
  // =====================================================
  async function handleBuyReal(upgrade) {
    if (creatingInvoice) return; // evitar doble click
    setCreatingInvoice(true);
    showNotification('Creando factura...', 'info');

    try {
      console.log('🛒 Creando factura para plan:', upgrade.planId, 'moneda:', selectedCurrency);
      const r = await fetch(`${API_URL}/api/create_invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegram_id: user.telegram_id,
          plan_id: upgrade.planId,
          currency: selectedCurrency
        })
      });
      const data = await r.json();
      console.log('🛒 Respuesta factura:', data);

      if (data.error) {
        showModal('Error', data.error, 'error');
        return;
      }

      if (!data.invoice_url) {
        showModal('Error', 'No se pudo crear la factura. Intenta de nuevo.', 'error');
        return;
      }

      // Abrir página de Plisio
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.openLink(data.invoice_url);
      } else {
        window.open(data.invoice_url, '_blank');
      }

      setPaymentInfo({ ...upgrade, tx_id: data.tx_id });
      startCheckingPayment(data.tx_id);
      showNotification('Factura creada. ¡Paga en la página abierta!', 'success');
    } catch (err) {
      console.error('Error factura:', err);
      showModal('Error', 'No se pudo conectar con el servidor. Intenta de nuevo.', 'error');
    } finally {
      setCreatingInvoice(false);
    }
  }

  function startCheckingPayment(txId) {
    setCheckingPayment(true);
    let attempts = 0;
    checkPaymentIntervalRef.current = setInterval(async () => {
      attempts++;
      try {
        const r = await fetch(`${API_URL}/api/check_invoice/${txId}`);
        const data = await r.json();
        console.log(`Check #${attempts}:`, data.status);

        if (data.status === 'completed' || data.status === 'confirmed') {
          clearInterval(checkPaymentIntervalRef.current);
          setCheckingPayment(false);
          setPaymentInfo(null);
          showModal('¡VIP Activado!', `Tu plan VIP está activo. Tu hash power aumentó.`, 'success');
          // 🚀 FIX: Recargar estado completo
          await reloadUserState(user.telegram_id);
        }
        if (attempts >= 60) {
          clearInterval(checkPaymentIntervalRef.current);
          setCheckingPayment(false);
          showNotification('Timeout esperando pago. Si ya pagaste, recarga la página.', 'error');
        }
      } catch (err) {
        console.error('Error check:', err);
      }
    }, 5000);
  }

  // =====================================================
  // RECLAMAR
  // =====================================================
  const handleClaim = () => {
    setHoldingWallet(prev => prev + poolWallet);
    setPoolWallet(0);
    showModal('¡Reclamado!', `Has movido $KABUTO a tu billetera principal.`);
  };

  // =====================================================
  // SUBIR NIVEL
  // =====================================================
  const handleBuyLevel = () => {
    const total = holdingWallet + poolWallet;
    const cost = (Math.floor(hashPower / 100) + 1) * 500;
    if (total >= cost) {
      let remaining = cost, newHolding = holdingWallet, newPool = poolWallet;
      if (newHolding >= remaining) newHolding -= remaining;
      else { remaining -= newHolding; newHolding = 0; newPool -= remaining; }
      setHoldingWallet(newHolding);
      setPoolWallet(newPool);
      setHashPower(prev => prev + 50);
      showModal('¡Nivel Subido!', `Ahora eres Nivel ${Math.floor(hashPower / 100) + 2}. +50 H/s`);
    } else showModal('Saldo Insuficiente', 'Necesitas más $KABUTO para subir de nivel.', 'error');
  };

  // =====================================================
  // COMPLETAR TAREA
  // =====================================================
  async function handleClaimTask(task) {
    if (claimedTasks.includes(task.id)) return;
    if (task.link) {
      if (window.Telegram?.WebApp) window.Telegram.WebApp.openTelegramLink(task.link);
      else window.open(task.link, '_blank');
    }
    try {
      const r = await fetch(`${API_URL}/api/complete_task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegram_id: user.telegram_id, task_id: task.id, reward: task.reward })
      });
      const data = await r.json();
      if (data.success) {
        setHoldingWallet(data.new_balance);
        setClaimedTasks(prev => [...prev, task.id]);
        showModal('¡Tarea Completada!', `Has ganado ${task.reward} $KABUTO.`);
      }
    } catch (err) {
      console.error('Error tarea:', err);
    }
  }

  // =====================================================
  // BANEAR USUARIO
  // =====================================================
  async function handleBanUser(telegram_id, currentBanned) {
    try {
      await fetch(`${API_URL}/api/admin/ban`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_id: user.telegram_id, telegram_id })
      });
      await reloadAdminStats();
    } catch (err) {
      console.error('Error ban:', err);
    }
  }

  // =====================================================
  // ACTIVAR VIP MANUAL - FIX: recarga el estado admin
  // =====================================================
  async function activateVipManual(telegramId, planId) {
    try {
      showNotification('Activando VIP...', 'info');
      const r = await fetch(`${API_URL}/api/admin/activate_vip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_id: user.telegram_id, telegram_id: telegramId, plan_id: planId })
      });
      const data = await r.json();
      if (data.success) {
        showNotification('VIP activado manualmente', 'success');
        // 🚀 FIX: Recargar admin stats para ver cambios
        await reloadAdminStats();
        // Si el VIP se activó al propio admin, recargar su estado también
        if (telegramId === user.telegram_id) {
          await reloadUserState(user.telegram_id);
        }
      } else {
        showNotification(data.error || 'Error al activar VIP', 'error');
      }
    } catch (err) {
      console.error('Error VIP manual:', err);
      showNotification('Error de conexión', 'error');
    }
  }

  // =====================================================
  // 🆕 REMOVER VIP MANUAL
  // =====================================================
  async function removeVipManual(telegramId) {
    if (!confirm('¿Quitar el VIP a este usuario?')) return;
    try {
      showNotification('Quitando VIP...', 'info');
      const r = await fetch(`${API_URL}/api/admin/remove_vip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_id: user.telegram_id, telegram_id: telegramId })
      });
      const data = await r.json();
      if (data.success) {
        showNotification('VIP removido', 'success');
        await reloadAdminStats();
        if (telegramId === user.telegram_id) {
          await reloadUserState(user.telegram_id);
        }
      } else {
        showNotification(data.error || 'Error al remover VIP', 'error');
      }
    } catch (err) {
      console.error('Error remove VIP:', err);
      showNotification('Error de conexión', 'error');
    }
  }

  // =====================================================
  // VALIDAR DIRECCIÓN
  // =====================================================
  const validateAddress = (address, currency) => {
    if (!address) return false;
    if (currency === 'TON') return /^(U|E)[A-Za-z0-9_-]{46,48}$/.test(address);
    if (currency === 'USDT') return /^T[A-Za-z0-9]{33}$/.test(address);
    return true;
  };

  // =====================================================
  // RETIRAR
  // =====================================================
  async function processWithdrawal() {
    if (!withdrawAddress || !withdrawAmount) return showModal('Error', 'Ingresa tu dirección y el monto.', 'error');
    if (!validateAddress(withdrawAddress, withdrawCurrency)) {
      return showModal('Dirección Inválida', `La dirección de ${withdrawCurrency} no es válida.`, 'error');
    }
    const usd = parseFloat(withdrawAmount);
    if (usd < MIN_WITHDRAWAL_USD) return showModal('Error', `Mínimo ${MIN_WITHDRAWAL_USD} USD`, 'error');
    const kabutoToBurn = usd / KABUTO_PRICE_USD;
    if (kabutoToBurn > holdingWallet) return showModal('Error', 'Saldo insuficiente', 'error');

    try {
      const r = await fetch(`${API_URL}/api/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegram_id: user.telegram_id,
          amount: usd,
          currency: withdrawCurrency,
          address: withdrawAddress
        })
      });
      const data = await r.json();
      if (data.success) {
        showModal('Retiro Enviado', `${usd} USD en ${withdrawCurrency} enviados.\nTXID: ${data.tx_id || 'pending'}`);
        setHoldingWallet(prev => prev - kabutoToBurn);
        setShowWithdrawBox(false);
        setWithdrawAddress('');
        setWithdrawAmount('');
      } else {
        showModal('Error', data.error || 'No se pudo procesar', 'error');
      }
    } catch (err) {
      showModal('Error', 'No se pudo conectar', 'error');
    }
  }

  const handleMaxWithdraw = () => setWithdrawAmount((holdingWallet * KABUTO_PRICE_USD).toFixed(2));
  const copyLink = () => {
    navigator.clipboard.writeText(referralLink);
    showModal('Copiado', 'Enlace copiado al portapapeles.');
  };
  const openPaymentsChannel = () => {
    if (window.Telegram?.WebApp) window.Telegram.WebApp.openTelegramLink('https://t.me/kabuto_payments');
    else window.open('https://t.me/kabuto_payments', '_blank');
  };

  // =====================================================
  // VALORES CALCULADOS
  // =====================================================
  const totalBalance = holdingWallet + poolWallet;
  const totalUsdValue = (totalBalance * KABUTO_PRICE_USD).toFixed(4);
  const dailyProfit = (hashPower * MINING_MULTIPLIER * 86400).toFixed(2);
  const dailyUsdValue = (dailyProfit * KABUTO_PRICE_USD).toFixed(4);
  const currentLevel = Math.floor(hashPower / 100) + 1;
  const nextLevelCost = currentLevel * 500;
  const nextLevelHash = 50;
  const activeVipReferrals = referrals.filter(r => r.is_vip === 1).length;
  const canWithdraw = user.is_vip === 1 && activeVipReferrals >= REQUIRED_VIP_REFERRALS;

  // 🚀 FIX: VIP 1 ahora cuesta $3 (mínimo de Plisio)
  const realUpgrades = [
    { id: 'real1', planId: 1, name: 'VIP 1 - Básico', cost_ton: 3, hashAdd: 50, image: '/vip-diamond.png' },
    { id: 'real2', planId: 2, name: 'VIP 2 - Pro', cost_ton: 5, hashAdd: 200, image: '/vip-dragon.png' },
    { id: 'real3', planId: 3, name: 'VIP 3 - Experto', cost_ton: 10, hashAdd: 500, image: '/vip-galaxy.png' },
    { id: 'real4', planId: 4, name: 'VIP 4 - Maestro', cost_ton: 25, hashAdd: 1500, image: '/vip-cosmic.png' },
    { id: 'real5', planId: 5, name: 'VIP 5 - Leyenda', cost_ton: 50, hashAdd: 5000, image: '/vip-cosmic.png' }
  ];

  const tasks = [
    { id: 'tg_channel', name: 'Únete a nuestro Canal', reward: 100, link: 'https://t.me/kabuto_payments', icon: '📢' },
    { id: 'daily_login', name: 'Login Diario', reward: 50, link: null, icon: '📅' },
    { id: 'visit_web', name: 'Visita nuestro Patrocinador', reward: 200, link: 'https://example.com', icon: '🌐' }
  ];

  const CURRENCIES = [
    { code: 'USDT', icon: '🟢', img: '/usdt.png' },
    { code: 'TON', icon: '💎', img: '/ton.png' },
    { code: 'LTC', icon: '🪙', img: '/ltc.png' },
    { code: 'TRX', icon: '🔴', img: '/trx.png' },
    { code: 'BNB', icon: '🟡', img: '/bnb.png' },
    { code: 'SOL', icon: '☀️', img: '/sol.png' },
    { code: 'USDC', icon: '🔵', img: '/usdc.png' }
  ];

  // =====================================================
  // LOADING - 🚀 FIX: usa kabuto-coin.png en lugar de emoji
  // =====================================================
  if (loading) {
    return (
      <div className="phone-screen loading-screen" translate="no">
        <img src="/kabuto-coin.png" alt="Kabuto" className="loading-coin-img" onError={(e) => { e.target.style.display='none'; e.target.nextSibling.style.display='block'; }} />
        <div className="loading-coin" style={{display:'none'}}>🦏</div>
        <p>Cargando Kabuto Miner...</p>
      </div>
    );
  }

  // =====================================================
  // VISTA ADMIN
  // =====================================================
  if (isAdmin && adminView) {
    return (
      <div className="phone-screen admin-screen" translate="no">
        <header className="top-bar">
          <div className="user-info">
            <img src="/avatar.png" alt="Avatar" className="avatar" onError={(e) => e.target.src='https://ui-avatars.com/api/?name=Admin&background=ffd700&color=000'} />
            <div className="user-details">
              <span className="user-name">Panel Admin</span>
              <span className="user-level">Control Total</span>
            </div>
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

          <div className="admin-section-title">Usuarios ({adminUsers.length})</div>
          <div className="admin-users-list">
            {adminUsers.length === 0 ? (
              <p className="no-friends">Aún no hay usuarios registrados.</p>
            ) : adminUsers.map(u => (
              <div key={u.telegram_id} className={`admin-user-card ${u.banned ? 'banned' : ''}`}>
                <div className="admin-user-info">
                  <strong>{u.first_name} {u.vip_level > 0 ? '👑' : ''} {u.banned ? '🚫' : ''}</strong>
                  <span className="user-id-text">ID: {u.telegram_id}</span>
                  <span className="user-finances">Balance: ${Number(u.balance || 0).toFixed(2)} | VIP: {u.vip_level}</span>
                </div>
                <div className="admin-user-actions">
                  <span className="user-hash">⚡ {u.hash_power} H/s</span>
                  {u.vip_level > 0 ? (
                    // 🆕 Si tiene VIP, mostrar botón para quitar
                    <button className="ban-btn unban" onClick={() => removeVipManual(u.telegram_id)}>
                      Quitar VIP
                    </button>
                  ) : (
                    // Si no tiene VIP, mostrar select para activar
                    <select
                      onChange={(e) => {
                        if (e.target.value) activateVipManual(u.telegram_id, e.target.value);
                        e.target.value = '';
                      }}
                      defaultValue=""
                      style={{background:'#21262d',color:'#fff',border:'1px solid #30363d',borderRadius:'4px',padding:'4px 8px',fontSize:'12px'}}
                    >
                      <option value="">+ VIP</option>
                      <option value="1">VIP 1</option>
                      <option value="2">VIP 2</option>
                      <option value="3">VIP 3</option>
                      <option value="4">VIP 4</option>
                      <option value="5">VIP 5</option>
                    </select>
                  )}
                  {u.telegram_id !== ADMIN_ID && (
                    <button className={`ban-btn ${u.banned ? 'unban' : ''}`} onClick={() => handleBanUser(u.telegram_id, u.banned)}>
                      {u.banned ? 'Desbloquear' : 'Bloquear'}
                    </button>
                  )}
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

  // =====================================================
  // VISTA JUGADOR
  // =====================================================
  return (
    <div className="phone-screen" translate="no">
      {notification && (
        <div className={`notification ${notification.type}`}>{notification.message}</div>
      )}

      <header className="top-bar">
        <div className="user-info">
          <img src="/avatar.png" alt="Avatar" className="avatar" onError={(e) => e.target.src='https://ui-avatars.com/api/?name=' + encodeURIComponent(user.first_name) + '&background=ffd700&color=000'} />
          <div className="user-details">
            <span className="user-name">{user.first_name}</span>
            <span className="user-level">Nivel {currentLevel} • {user.is_vip ? 'VIP ✅' : 'FREE'}</span>
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
          <div className="daily-profit-box">📈 Ganancia Diaria: +{dailyProfit} $KABUTO (≈ ${dailyUsdValue} USD)</div>
        </div>
      )}

      {checkingPayment && (
        <div className="checking-payment">
          <div className="spinner"></div>
          <p>Esperando confirmación de pago...</p>
        </div>
      )}

      {activeTab === 'mina' && (
        <div className="coin-area">
          <div className="profit-text">⚡ {hashPower} H/s</div>
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
              <span className="next-level-bonus">+{nextLevelHash} H/s</span>
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
                  <img src={c.img} alt={c.code} className="currency-icon-img" onError={(e) => { e.target.style.display='none'; e.target.nextSibling.style.display='inline'; }} />
                  <span className="currency-icon" style={{display:'none', fontSize:'24px'}}>{c.icon}</span>
                  <span className="currency-code">{c.code}</span>
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
              <button
                className="buy-btn vip-btn"
                onClick={() => handleBuyReal(up)}
                disabled={creatingInvoice}
              >
                {creatingInvoice ? '...' : `$${up.cost_ton}`}
              </button>
            </div>
          ))}
        </div>
      )}

      {paymentInfo && (
        <div className="payment-modal-overlay">
          <div className="payment-modal">
            <h3>Pago de {paymentInfo.name}</h3>
            <p>Se abrió la página de Plisio para que pagues <strong>${paymentInfo.cost_ton} USD</strong> en {selectedCurrency}.</p>
            <p className="payment-warning">La verificación es automática. No cierres esta ventana.</p>
            <button className="claim-btn vip-btn" onClick={() => setPaymentInfo(null)} style={{marginTop: '20px'}}>Cerrar</button>
          </div>
        </div>
      )}

      {activeTab === 'tareas' && (
        <div className="shop-container">
          <h2 className="shop-title">TAREAS DIARIAS</h2>
          <p className="shop-subtitle">Gana $KABUTO gratis completando tareas</p>
          {tasks.map(task => {
            const isClaimed = claimedTasks.includes(task.id);
            return (
              <div key={task.id} className={`upgrade-card task-card ${isClaimed ? 'owned-card' : ''}`}>
                <div className="upgrade-info">
                  <span className="task-icon">{task.icon}</span>
                  <div><strong>{task.name}</strong><span className="upgrade-profit">+{task.reward} $KABUTO</span></div>
                </div>
                <button className="buy-btn" onClick={() => handleClaimTask(task)} disabled={isClaimed}>{isClaimed ? 'HECHO ✅' : 'RECLAMAR'}</button>
              </div>
            );
          })}
        </div>
      )}

      {activeTab === 'amigos' && (
        <div className="shop-container">
          <h2 className="shop-title">INVITA Y GANA</h2>
          <p className="shop-subtitle">Necesitas {REQUIRED_VIP_REFERRALS} referidos VIP para desbloquear retiros.</p>
          <div className="team-wallet-card">
            <div className="team-wallet-info">
              <span className="team-wallet-title">👥 TEAM WALLET</span>
              <span className="team-wallet-desc">Gana el 10% de lo que minan tus amigos + 5% de sus compras.</span>
            </div>
            <div className="team-wallet-balance">
              <strong>{teamWallet.toFixed(2)} $KABUTO</strong>
              <button className="buy-btn" onClick={() => showNotification('Próximamente', 'info')} disabled={teamWallet <= 0}>RECLAMAR</button>
            </div>
          </div>
          <div className="referral-box">
            <input type="text" value={referralLink} readOnly className="ref-input" />
            <button className="buy-btn" onClick={copyLink}>Copiar</button>
          </div>
          <h3 className="friends-title">AMIGOS VIP ({activeVipReferrals}/{REQUIRED_VIP_REFERRALS})</h3>
          {referrals.length === 0 ? <p className="no-friends">Aún no has invitado a nadie. ¡Comparte tu enlace!</p> : referrals.map((ref) => (
            <div key={ref.telegram_id} className="upgrade-card">
              <div className="upgrade-info">
                <span className="upgrade-emoji">{ref.is_vip ? '👑' : '👤'}</span>
                <div><strong>{ref.first_name} {ref.is_vip ? '(VIP)' : '(FREE)'}</strong><span className="upgrade-profit">{ref.is_vip ? 'Activo' : 'Inactivo'}</span></div>
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
          <div className="wallet-section transparent-section" onClick={openPaymentsChannel} style={{cursor: 'pointer'}}>
            <h3>🛡️ CANAL DE TRANSPARENCIA</h3>
            <p>Verifica todos los pagos reales de la plataforma en tiempo real.</p>
            <button className="claim-btn transparent-btn">📜 VER COMPROBANTES</button>
          </div>
          <div className={canWithdraw ? 'wallet-section blue unlocked' : 'wallet-section blue locked'}>
            <h3>BILLETERA DE RETIRO</h3>
            <div className="withdraw-reqs">
              <p>Requisitos para retirar:</p>
              <span className={user.is_vip ? 'req-tag ok' : 'req-tag no'}>{user.is_vip ? '✅' : '❌'} Comprar VIP</span>
              <span className={activeVipReferrals >= REQUIRED_VIP_REFERRALS ? 'req-tag ok' : 'req-tag no'}>{activeVipReferrals >= REQUIRED_VIP_REFERRALS ? '✅' : '❌'} Invitar {REQUIRED_VIP_REFERRALS} amigos VIP ({activeVipReferrals}/{REQUIRED_VIP_REFERRALS})</span>
              <span className="req-tag ok">💵 Mínimo: {MIN_WITHDRAWAL_USD} USD (Fee: {WITHDRAWAL_FEE} USD)</span>
            </div>
            <button className="claim-btn connect-wallet-btn" onClick={() => canWithdraw ? setShowWithdrawBox(true) : showModal('Requisitos Incompletos', 'Necesitas VIP y 6 referidos VIP para retirar.', 'error')}>
              {canWithdraw ? '💸 RETIRAR GANANCIAS' : '🔒 BLOQUEADO'}
            </button>
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
                        <img src={c.img} alt={c.code} className="currency-icon-img" onError={(e) => { e.target.style.display='none'; e.target.nextSibling.style.display='inline'; }} />
                        <span className="currency-icon" style={{display:'none', fontSize:'24px'}}>{c.icon}</span>
                        <span className="currency-code">{c.code}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <p className="payment-warning">Mínimo: {MIN_WITHDRAWAL_USD} USD | Comisión: {WITHDRAWAL_FEE} USD</p>
                <div className="withdraw-input-box">
                  <input type="number" step="0.01" placeholder="Monto en USD" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} className="ref-input" />
                  <button onClick={handleMaxWithdraw} className="max-btn">MAX</button>
                </div>
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
              <li>✅ <strong>30%</strong> es la ganancia del creador y mantenimiento del servidor.</li>
            </ul>
            <p>Para retirar, un usuario debe activar el VIP mínimo y traer 6 referidos VIP. Esto asegura que siempre entre dinero nuevo antes de que salga.</p>
          </div>
          <div className="whitepaper-card">
            <h3>🪲 ¿Qué es Kabuto Miner?</h3>
            <p>Es un juego Play-to-Earn inspirado en el escarabajo rinoceronte (Kabutomushi). Los usuarios simulan la excavación de bloques, ganando $KABUTO que puede ser canjeado por criptomonedas reales via Plisio.</p>
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
          <div className={activeTab === 'mina' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveTab('mina')}>
            <img src="/icon-mine.png" alt="Mina" className="nav-icon" onError={(e) => e.target.innerHTML='⛏️'} /><span>Mina</span>
          </div>
          <div className={activeTab === 'tareas' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveTab('tareas')}>
            <img src="/icon-tasks.png" alt="Tareas" className="nav-icon" onError={(e) => e.target.innerHTML='📋'} /><span>Tareas</span>
          </div>
          <div className={activeTab === 'mejoras' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveTab('mejoras')}>
            <img src="/icon-shop.png" alt="Mejoras" className="nav-icon" onError={(e) => e.target.innerHTML='🛒'} /><span>Mineros</span>
          </div>
          <div className={activeTab === 'amigos' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveTab('amigos')}>
            <img src="/icon-friends.png" alt="Amigos" className="nav-icon" onError={(e) => e.target.innerHTML='👥'} /><span>Amigos</span>
          </div>
          <div className={activeTab === 'perfil' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveTab('perfil')}>
            <img src="/icon-profile.png" alt="Perfil" className="nav-icon" onError={(e) => e.target.innerHTML='👤'} /><span>Perfil</span>
          </div>
        </nav>
      )}
    </div>
  );
}

export default App;

import { useState, useEffect, useRef } from 'react';
import './App.css';

const API_URL = '/api';
const ADMIN_ID = '1159596878'; 

const KABUTO_PRICE_USD = 0.001; 
const MINING_MULTIPLIER = 0.00015; // 🚀 VELOCIDAD AUMENTADA 100x
const REQUIRED_VIP_REFERRALS = 6; 
const MIN_WITHDRAWAL_USD = 5; 
const WITHDRAWAL_FEE = 0.5; 

function App() {
  const [user, setUser] = useState({ telegram_id: '1159596878', first_name: 'Admin', level: 1, is_vip: 0, isAdmin: false });
  const [poolWallet, setPoolWallet] = useState(0);
  const [holdingWallet, setHoldingWallet] = useState(0);
  const [teamWallet, setTeamWallet] = useState(0);
  const [hashPower, setHashPower] = useState(10);
  const [activeTab, setActiveTab] = useState('mina');
  const [referrals, setReferrals] = useState([]);
  const [referralLink, setReferralLink] = useState('');
  const [adminStats, setAdminStats] = useState({ totalUsers: 0, totalVips: 0, totalKabuto: 0, totalInvested: 0, totalWithdrawn: 0, liquidityPool: 0, adminProfitAvailable: 0, adminProfitWithdrawn: 0, onlineUsers: 0 });
  const [adminUsers, setAdminUsers] = useState([]);
  
  const [showWithdrawBox, setShowWithdrawBox] = useState(false);
  const [withdrawAddress, setWithdrawAddress] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawCurrency, setWithdrawCurrency] = useState('TON');

  const [showAdminWithdrawBox, setShowAdminWithdrawBox] = useState(false);
  const [adminWithdrawAmount, setAdminWithdrawAmount] = useState('');

  const [adminView, setAdminView] = useState(true);
  const [modal, setModal] = useState({ show: false, title: '', message: '', type: 'success' });
  const [claimedTasks, setClaimedTasks] = useState([]);
  const [paymentInfo, setPaymentInfo] = useState(null);

  const stateRef = useRef();
  stateRef.current = { holdingWallet, poolWallet, hashPower, is_vip: user.is_vip };
  const prevVipReferralsRef = useRef(-1);

  const showModal = (title, message, type = 'success') => {
    setModal({ show: true, title, message, type });
  };

  const closeModal = () => {
    setModal({ show: false, title: '', message: '', type: '' });
  };

  const fetchAdminData = () => {
    fetch(`${API_URL}/admin/stats`).then(res => res.json()).then(setAdminStats).catch(console.error);
    fetch(`${API_URL}/admin/users`).then(res => res.json()).then(setAdminUsers).catch(console.error);
  };

  const fetchReferrals = (tgId) => {
    fetch(`${API_URL}/user/referrals/${tgId}`)
      .then(res => res.json())
      .then(data => {
        const arr = Array.isArray(data) ? data : [];
        const currentVipCount = arr.filter(r => r.is_vip === 1).length;
        
        if (prevVipReferralsRef.current !== -1 && currentVipCount > prevVipReferralsRef.current) {
          const newVipUser = arr.find(r => r.is_vip === 1);
          if (newVipUser) {
            showModal('🔥 ¡Referido Confirmado y Activo!', `¡Uno de tus referidos se acaba de activar!\n\n👤 Nombre: ${newVipUser.first_name}\n🆔 Telegram ID: ${newVipUser.telegram_id}\n\nVe a la sección de Amigos para reclamar tu recompensa.`);
          }
        }
        prevVipReferralsRef.current = currentVipCount;
        setReferrals(arr);
      })
      .catch(err => console.error('Error buscando amigos:', err));
  };

  useEffect(() => {
    let tgId = '1159596878'; 
    let tgName = 'Admin';
    let refBy = null;
    let botUsername = 'kabuto_miner_bot'; 

    if (window.Telegram && window.Telegram.WebApp) {
      window.Telegram.WebApp.ready();
      window.Telegram.WebApp.expand();
      const tgUser = window.Telegram.WebApp.initDataUnsafe?.user;
      if (tgUser) {
        tgId = String(tgUser.id);
        tgName = tgUser.first_name;
        const startParam = window.Telegram.WebApp.initDataUnsafe?.start_param;
        if (startParam && startParam.startsWith('ref_')) {
          refBy = startParam.replace('ref_', '');
        }
      }
    }

    setReferralLink(`https://t.me/${botUsername}?start=ref_${tgId}`);

    fetch(`${API_URL}/user/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegram_id: tgId, first_name: tgName, referred_by: refBy })
    })
    .then(res => res.json())
    .then(data => {
      if (data && data.telegram_id) {
        const isAdmin = data.telegram_id === ADMIN_ID;
        setUser({ telegram_id: data.telegram_id, first_name: data.first_name, level: 1, is_vip: data.is_vip, isAdmin });
        setHoldingWallet(Number(data.holding_wallet) || 0);
        setPoolWallet(Number(data.pool_wallet) || 0);
        setTeamWallet(Number(data.team_wallet) || 0);
        setHashPower(Number(data.hash_power) || 10);
        setClaimedTasks(data.claimed_tasks || []);
        fetchReferrals(data.telegram_id); 
      }
    })
    .catch(err => console.error('Error de conexión:', err));
  }, []);

  useEffect(() => {
    if (user.isAdmin && adminView) {
      fetchAdminData();
      const adminInterval = setInterval(fetchAdminData, 5000);
      return () => clearInterval(adminInterval);
    }
  }, [user.isAdmin, adminView]);

  useEffect(() => {
    if (user.telegram_id && (!user.isAdmin || !adminView)) {
      const interval = setInterval(() => fetchReferrals(user.telegram_id), 10000);
      return () => clearInterval(interval);
    }
  }, [user, adminView]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!user.isAdmin || !adminView) setPoolWallet(prev => prev + (hashPower * MINING_MULTIPLIER));
    }, 1000);
    return () => clearInterval(interval);
  }, [hashPower, user.isAdmin, adminView]);

  useEffect(() => {
    const saveInterval = setInterval(() => {
      if (user.telegram_id && (!user.isAdmin || !adminView)) {
        fetch(`${API_URL}/user/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            telegram_id: user.telegram_id,
            holding_wallet: stateRef.current.holdingWallet,
            pool_wallet: stateRef.current.poolWallet,
            hash_power: stateRef.current.hashPower,
            is_vip: stateRef.current.is_vip
          })
        })
        .then(res => res.json())
        .then(data => { if (data.status === 'OK' && data.team_wallet !== undefined) setTeamWallet(data.team_wallet); })
        .catch(err => console.error('Error guardando:', err));
      }
    }, 10000);
    return () => clearInterval(saveInterval);
  }, [user, adminView]);

  const totalBalance = holdingWallet + poolWallet;
  const totalUsdValue = (totalBalance * KABUTO_PRICE_USD).toFixed(4);
  const dailyProfit = (hashPower * MINING_MULTIPLIER * 86400).toFixed(2); 
  const dailyUsdValue = (dailyProfit * KABUTO_PRICE_USD).toFixed(4);
  const currentLevel = Math.floor(hashPower / 100) + 1;
  const nextLevelCost = currentLevel * 500;
  const nextLevelHash = currentLevel * 50;
  const activeVipReferrals = referrals.filter(r => r.is_vip === 1).length;
  const canWithdraw = user.is_vip && activeVipReferrals >= REQUIRED_VIP_REFERRALS;

  const handleClaim = () => {
    setHoldingWallet(prev => prev + poolWallet);
    setPoolWallet(0);
    showModal('¡Reclamado!', `Has movido ${poolWallet.toFixed(2)} $KABUTO a tu billetera principal.`);
  };

  const handleClaimTeam = () => {
    if (teamWallet <= 0) return showModal('Vacío', 'Aún no tienes comisiones para reclamar.', 'error');
    fetch(`${API_URL}/user/claim_team`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegram_id: user.telegram_id })
    })
    .then(res => res.json())
    .then(data => {
      if (data.status === 'OK') {
        setHoldingWallet(prev => prev + data.claimed);
        setTeamWallet(0);
        showModal('¡Comisiones Reclamadas!', `Has ganado ${data.claimed.toFixed(2)} $KABUTO de tu equipo.`);
      }
    });
  };

  const handleBuyLevel = () => {
    if (totalBalance >= nextLevelCost) {
      let remainingCost = nextLevelCost, newHolding = holdingWallet, newPool = poolWallet;
      if (newHolding >= remainingCost) newHolding -= remainingCost; 
      else { remainingCost -= newHolding; newHolding = 0; newPool -= remainingCost; }
      setHoldingWallet(newHolding); setPoolWallet(newPool);
      setHashPower(prev => prev + nextLevelHash);
      showModal('¡Nivel Subido!', `Ahora eres Nivel ${currentLevel + 1}. +${nextLevelHash} H/s`);
    } else showModal('Saldo Insuficiente', 'Necesitas más $KABUTO para subir de nivel.', 'error');
  };

  const handleBuyReal = (upgrade) => {
    fetch(`${API_URL}/create_plisio_invoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ upgrade_name: upgrade.name, amount_ton: upgrade.cost_ton, telegram_id: user.telegram_id })
    })
    .then(res => res.json())
    .then(data => {
      if (data.url) {
        window.open(data.url, '_blank');
        setPaymentInfo({ upgrade_name: upgrade.name, amount_ton: upgrade.cost_ton, hashAdd: upgrade.hashAdd });
      } else {
        showModal('Error', data.error || 'No se pudo generar la factura.', 'error');
      }
    });
  };

  const confirmMockPayment = () => {
    fetch(`${API_URL}/user/activate_vip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegram_id: user.telegram_id, first_name: user.first_name, amount_ton: paymentInfo.amount_ton })
    })
    .then(res => res.json())
    .then(data => {
      if (data.status === 'OK') {
        setUser(prev => ({ ...prev, is_vip: 1 }));
        setHashPower(prev => prev + paymentInfo.hashAdd);
        const newLevel = Math.floor((hashPower + paymentInfo.hashAdd) / 100) + 1;
        showModal('¡VIP Activado!', `Tu VIP está activo. +${paymentInfo.hashAdd} H/s\n¡Ahora eres Nivel ${newLevel}! ⭐`);
        setPaymentInfo(null);
      }
    });
  };

  const copyLink = () => {
    navigator.clipboard.writeText(referralLink);
    showModal('Copiado', 'Enlace de referido copiado al portapapeles.');
  };

  const handleConnectWallet = () => {
    if (canWithdraw) setShowWithdrawBox(true);
    else {
      let msg = '⛔ Retiro bloqueado. Requisitos:\n';
      if (!user.is_vip) msg += '❌ Comprar el VIP mínimo.\n';
      if (activeVipReferrals < REQUIRED_VIP_REFERRALS) msg += `❌ Invitar a ${REQUIRED_VIP_REFERRALS - activeVipReferrals} amigos VIP más.`;
      showModal('Requisitos Incompletos', msg, 'error');
    }
  };

  const handleMaxWithdraw = () => setWithdrawAmount((holdingWallet * KABUTO_PRICE_USD).toFixed(2));

  const validateAddress = (address, currency) => {
    if (!address) return false;
    if (currency === 'TON') {
      return /^(U|E)[A-Za-z0-9_-]{46,48}$/.test(address);
    } else if (currency === 'USDT') {
      return /^T[A-Za-z0-9]{33}$/.test(address);
    }
    return false;
  };

  const processWithdrawal = () => {
    if (!withdrawAddress || !withdrawAmount) return showModal('Error', 'Ingresa tu dirección y el monto.', 'error');
    
    if (!validateAddress(withdrawAddress, withdrawCurrency)) {
      return showModal('Dirección Inválida', `La dirección de ${withdrawCurrency} no tiene un formato válido. Verifica los caracteres y la longitud.`, 'error');
    }

    const usdToWithdraw = parseFloat(withdrawAmount);
    if (usdToWithdraw < MIN_WITHDRAWAL_USD) return showModal('Error', `El retiro mínimo es de ${MIN_WITHDRAWAL_USD} USD.`, 'error');
    const kabutoToBurn = usdToWithdraw / KABUTO_PRICE_USD;
    if (kabutoToBurn > holdingWallet) return showModal('Error', `Saldo insuficiente.`, 'error');
    
    fetch(`${API_URL}/request_withdrawal`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegram_id: user.telegram_id, amount: usdToWithdraw, to_address: withdrawAddress, currency: withdrawCurrency })
    })
    .then(res => res.json())
    .then(data => {
      if (data.status === 'OK') {
        showModal('Retiro Enviado', `${usdToWithdraw} USD en ${withdrawCurrency} enviados a ${withdrawAddress}.\nComisión: ${WITHDRAWAL_FEE} USD.`);
        setHoldingWallet(prev => prev - kabutoToBurn); 
        setShowWithdrawBox(false); setWithdrawAddress(''); setWithdrawAmount('');
      } else {
        showModal('Error en el Retiro', data.error || 'No se pudo procesar el retiro. Tu saldo ha sido devuelto.', 'error');
        setShowWithdrawBox(false); 
      }
    })
    .catch(err => {
      showModal('Error de Conexión', 'No se pudo conectar con el servidor.', 'error');
      setShowWithdrawBox(false);
    });
  };

  const handleAdminWithdraw = () => {
    const amount = parseFloat(adminWithdrawAmount);
    if (!amount || amount <= 0) return showModal('Error', 'Ingresa un monto válido.', 'error');
    
    if (amount > adminStats.adminProfitAvailable) return showModal('Error', 'No puedes retirar más de tu ganancia disponible.', 'error');

    fetch(`${API_URL}/admin/withdraw_profit`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount })
    })
    .then(res => res.json())
    .then(data => {
      if (data.status === 'OK') {
        showModal('Retiro Registrado', `Has retirado ${amount} USD de tus ganancias a tu billetera personal.`);
        setShowAdminWithdrawBox(false);
        setAdminWithdrawAmount('');
        fetchAdminData(); 
      }
    });
  };

  const openPaymentsChannel = () => {
    if (window.Telegram && window.Telegram.WebApp) window.Telegram.WebApp.openTelegramLink('https://t.me/kabuto_payments'); 
    else window.open('https://t.me/kabuto_payments', '_blank');
  };

  const handleBanUser = (telegram_id, currentStatus) => {
    fetch(`${API_URL}/admin/ban_user`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegram_id, ban_status: !currentStatus })
    }).then(() => fetchAdminData());
  };

  const handleClaimTask = (task) => {
    if (claimedTasks.includes(task.id)) return showModal('Ya reclamado', 'Ya recibiste la recompensa de esta tarea.', 'error');
    
    if (task.link) {
      if (window.Telegram && window.Telegram.WebApp) window.Telegram.WebApp.openTelegramLink(task.link);
      else window.open(task.link, '_blank');
    }

    fetch(`${API_URL}/user/claim_task`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegram_id: user.telegram_id, task_id: task.id })
    })
    .then(res => res.json())
    .then(data => {
      if (data.status === 'OK') {
        setHoldingWallet(data.new_holding_wallet);
        setClaimedTasks(prev => [...prev, task.id]);
        showModal('¡Tarea Completada!', `Has ganado ${task.reward} $KABUTO.`);
      } else {
        showModal('Error', data.error || 'No se pudo reclamar la tarea.', 'error');
      }
    });
  };

  const realUpgrades = [
    { id: 'real1', name: 'Minero Diamante', cost_ton: 4, hashAdd: 1000, image: '/vip-diamond.png' },
    { id: 'real2', name: 'Minero Legendario', cost_ton: 10, hashAdd: 5000, image: '/vip-dragon.png' },
    { id: 'real3', name: 'Minero Galáctico', cost_ton: 20, hashAdd: 10000, image: '/vip-galaxy.png' },
    { id: 'real4', name: 'Minero Cósmico', cost_ton: 50, hashAdd: 20000, image: '/vip-cosmic.png' }
  ];

  const tasks = [
    { id: 'tg_channel', name: 'Únete a nuestro Canal', reward: 100, link: 'https://t.me/kabuto_payments', icon: '📢' },
    { id: 'tg_community', name: 'Únete a Kabuto Game Community', reward: 150, link: 'https://t.me/kabutogamecommunity', icon: '👥' },
    { id: 'daily_login', name: 'Login Diario', reward: 50, link: null, icon: '📅' },
    { id: 'visit_web', name: 'Visita nuestro Patrocinador', reward: 200, link: 'https://example.com', icon: '🌐' }
  ];

  if (user.isAdmin && adminView) {
    return (
      <div className="phone-screen admin-screen" translate="no">
        <header className="top-bar">
          <div className="user-info">
            <img src="/avatar.png" alt="Avatar" className="avatar" />
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
            <div className="admin-finance-card"><span>Ingresos Totales</span><strong className="text-blue">${Number(adminStats?.totalInvested || 0).toFixed(2)} USD</strong></div>
            <div className="admin-finance-card"><span>Fondo Liquidez (70%)</span><strong className="text-blue">${Number(adminStats?.liquidityPool || 0).toFixed(2)} USD</strong></div>
            <div className="admin-finance-card"><span>Tu Ganancia (30%)</span><strong className="text-green">${Number(adminStats?.adminProfitAvailable || 0).toFixed(2)} USD</strong></div>
            <div className="admin-finance-card"><span>Ya Retiraste</span><strong>${Number(adminStats?.adminProfitWithdrawn || 0).toFixed(2)} USD</strong></div>
          </div>

          {!showAdminWithdrawBox ? (
            <button className="claim-btn vip-btn" style={{marginTop: '10px', marginBottom: '20px'}} onClick={() => setShowAdminWithdrawBox(true)}>
              🏦 RETIRAR MI GANANCIA A TONKEEPER
            </button>
          ) : (
            <div className="payment-modal-overlay" style={{position: 'relative', background: 'rgba(0,0,0,0.3)', marginTop: '10px', marginBottom: '20px'}}>
              <div className="payment-modal" style={{width: '100%', boxShadow: 'none'}}>
                <h3>Retirar Ganancias</h3>
                <p>Disponible: <strong>${Number(adminStats?.adminProfitAvailable || 0).toFixed(2)} USD</strong></p>
                <p className="payment-warning">Retira este monto desde tu cuenta de Plisio a tu Tonkeeper, y luego ingrésalo aquí para llevar la contabilidad.</p>
                <div className="withdraw-input-box">
                  <input type="number" step="0.01" placeholder="Monto retirado" value={adminWithdrawAmount} onChange={(e) => setAdminWithdrawAmount(e.target.value)} className="ref-input" />
                  <button onClick={() => setAdminWithdrawAmount(adminStats.adminProfitAvailable.toFixed(2))} className="max-btn">MAX</button>
                </div>
                <button className="claim-btn vip-btn" onClick={handleAdminWithdraw}>CONFIRMAR RETIRO</button>
                <button className="claim-btn" onClick={() => setShowAdminWithdrawBox(false)} style={{marginTop: '10px', background: '#555'}}>CANCELAR</button>
              </div>
            </div>
          )}

          <div className="admin-section-title">📊 Estadísticas de Usuarios</div>
          <div className="admin-stats-grid">
            <div className="admin-stat-card"><span>👥 Totales</span><strong>{adminStats?.totalUsers || 0}</strong></div>
            <div className="admin-stat-card"><span>🟢 En Línea</span><strong>{adminStats?.onlineUsers || 0}</strong></div>
            <div className="admin-stat-card"><span>👑 VIPs</span><strong>{adminStats?.totalVips || 0}</strong></div>
            <div className="admin-stat-card"><span>🪲 $KABUTO</span><strong>{Number(adminStats?.totalKabuto || 0).toFixed(0)}</strong></div>
          </div>
          <div className="admin-section-title">Últimos Usuarios (100)</div>
          <div className="admin-users-list">
            {adminUsers?.length === 0 ? <p className="no-friends">Aún no hay usuarios registrados.</p> : adminUsers?.map((u) => (
              <div key={u.telegram_id} className={`admin-user-card ${u.is_banned ? 'banned' : ''}`}>
                <div className="admin-user-info">
                  <strong>{u.is_online ? '🟢' : '⚪'} {u.first_name} {u.is_vip ? '👑' : ''} {u.is_banned ? '🚫' : ''}</strong>
                  <span className="user-id-text">ID: {u.telegram_id}</span>
                  <span className="user-finances">Inv: {Number(u.total_invested || 0).toFixed(1)} USD | Ret: {Number(u.total_withdrawn || 0).toFixed(1)} USD</span>
                </div>
                <div className="admin-user-actions">
                  <span className="user-hash">⚡ {u.hash_power} H/s</span>
                  <button className={`ban-btn ${u.is_banned ? 'unban' : ''}`} onClick={() => handleBanUser(u.telegram_id, u.is_banned)}>
                    {u.is_banned ? 'Desbloquear' : 'Bloquear'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="phone-screen" translate="no">
      <header className="top-bar">
        <div className="user-info">
          <img src="/avatar.png" alt="Avatar" className="avatar" />
          <div className="user-details">
            <span className="user-name">{user.first_name}</span>
            <span className="user-level">Nivel {currentLevel} • {user.is_vip ? 'VIP ✅' : 'FREE'}</span>
          </div>
        </div>
        <div className="top-bar-right">
          {user.isAdmin && <button className="view-toggle-btn" onClick={() => setAdminView(true)}>🛠️</button>}
          <button className="view-toggle-btn" onClick={() => setActiveTab('whitepaper')}>📖</button>
        </div>
      </header>

      {activeTab !== 'whitepaper' && (
        <div className="assets-section">
          <div className="price-tag">Precio $KABUTO: ${KABUTO_PRICE_USD}</div>
          <span className="assets-label">TOTAL ACTIVOS</span>
          <h1 className="total-balance">{totalBalance.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})} <span className="token-symbol">$KABUTO</span></h1>
          <span className="usd-value">≈ ${totalUsdValue} USD</span>
          <div className="wallets">
            <div className="wallet-box"><span>HOLDING WALLET</span><strong>{holdingWallet.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong></div>
            <div className="wallet-box"><span>POOL WALLET</span><strong>{poolWallet.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong></div>
          </div>
          <div className="daily-profit-box">📈 Ganancia Diaria: +{dailyProfit} $KABUTO (≈ ${dailyUsdValue} USD)</div>
        </div>
      )}

      {activeTab === 'mina' && (
        <div className="coin-area">
          <div className="profit-text">⚡ {hashPower} H/s</div>
          <img src="/kabuto-coin.png" alt="Kabuto Coin" className="kabuto-coin" />
          <button className="claim-btn" onClick={handleClaim}>RECLAMAR +{poolWallet.toFixed(2)} $KABUTO</button>
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
          <p className="shop-subtitle">Desbloquea poder máximo y habilita retiros pagando con TON</p>
          {realUpgrades.map(up => (
            <div key={up.id} className="upgrade-card vip-card">
              <div className="upgrade-info">
                <img src={up.image} alt={up.name} className="upgrade-emoji" />
                <div><strong>{up.name}</strong><span className="upgrade-profit">+{up.hashAdd} H/s</span></div>
              </div>
              <button className="buy-btn vip-btn" onClick={() => handleBuyReal(up)}>{up.cost_ton} TON</button>
            </div>
          ))}
        </div>
      )}

      {paymentInfo && (
        <div className="payment-modal-overlay">
          <div className="payment-modal">
            <h3>Pago de {paymentInfo.upgrade_name}</h3>
            <p>Se ha abierto la página de Plisio para que pagues <strong>{paymentInfo.amount_ton} TON</strong>.</p>
            <p className="payment-warning">Una vez que hayas hecho el pago en Plisio, presiona el botón de abajo para activar tu VIP.</p>
            <button className="claim-btn vip-btn" onClick={confirmMockPayment} style={{marginTop: '20px'}}>Ya pagué (Activar VIP)</button>
            <button className="claim-btn" onClick={() => setPaymentInfo(null)} style={{marginTop: '10px', background: '#555'}}>Cerrar</button>
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
              <span className="team-wallet-desc">Gana el 10% de lo que minan tus amigos.</span>
            </div>
            <div className="team-wallet-balance">
              <strong>{teamWallet.toFixed(2)} $KABUTO</strong>
              <button className="buy-btn" onClick={handleClaimTeam} disabled={teamWallet <= 0}>RECLAMAR</button>
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
            <img src="/avatar.png" alt="Avatar" className="profile-avatar" />
            <h2 className="profile-name">{user.first_name}</h2>
            <span className="profile-id">ID: {user.telegram_id}</span>
          </div>
          <div className="stats-grid">
            <div className="stat-item"><span className="stat-label">⚡ Poder de Minado</span><strong className="stat-value">{hashPower} H/s</strong></div>
            <div className="stat-item"><span className="stat-label">📊 Nivel de Minero</span><strong className="stat-value">Nivel {currentLevel}</strong></div>
          </div>
          <div className="wallet-section transparent-section" onClick={openPaymentsChannel} style={{cursor: 'pointer'}}>
            <h3 className="wallet-title">🛡️ CANAL DE TRANSPARENCIA</h3>
            <p className="wallet-text">Verifica todos los pagos reales de la plataforma en tiempo real.</p>
            <button className="claim-btn transparent-btn">📜 VER COMPROBANTES</button>
          </div>
          <div className={canWithdraw ? 'wallet-section blue unlocked' : 'wallet-section blue locked'}>
            <h3 className="wallet-title">BILLETERA DE RETIRO</h3>
            <div className="withdraw-reqs">
              <p className="wallet-text">Requisitos para retirar:</p>
              <span className={user.is_vip ? 'req-tag ok' : 'req-tag no'}>{user.is_vip ? '✅' : '❌'} Comprar VIP</span>
              <span className={activeVipReferrals >= REQUIRED_VIP_REFERRALS ? 'req-tag ok' : 'req-tag no'}>{activeVipReferrals >= REQUIRED_VIP_REFERRALS ? '✅' : '❌'} Invitar {REQUIRED_VIP_REFERRALS} amigos VIP ({activeVipReferrals}/{REQUIRED_VIP_REFERRALS})</span>
              <span className="req-tag ok">💵 Retiro mínimo: {MIN_WITHDRAWAL_USD} USD (Fee: {WITHDRAWAL_FEE} USD)</span>
            </div>
            <button className="claim-btn connect-wallet-btn" onClick={handleConnectWallet}>{canWithdraw ? '💸 RETIRAR GANANCIAS' : '🔒 BLOQUEADO'}</button>
          </div>
          {showWithdrawBox && (
            <div className="payment-modal-overlay">
              <div className="payment-modal">
                <h3>Retirar Ganancias</h3>
                <p>Saldo disponible: <strong>${(holdingWallet * KABUTO_PRICE_USD).toFixed(2)} USD</strong> ({holdingWallet.toFixed(2)} $KABUTO)</p>
                
                <div className="currency-selector">
                  <button className={withdrawCurrency === 'TON' ? 'active' : ''} onClick={() => setWithdrawCurrency('TON')}>TON</button>
                  <button className={withdrawCurrency === 'USDT' ? 'active' : ''} onClick={() => setWithdrawCurrency('USDT')}>USDT (TRC20)</button>
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
            <p>El sistema está diseñado para ser 100% sostenible. Cuando un usuario invierte en mejoras VIP, el dinero se divide de la siguiente manera:</p>
            <ul className="wp-list">
              <li>✅ <strong>70%</strong> va al Fondo de Liquidez (para pagar retiros).</li>
              <li>✅ <strong>30%</strong> es la ganancia del creador y mantenimiento del servidor.</li>
            </ul>
            <p>Para retirar, un usuario debe activar el VIP mínimo y traer 6 referidos VIP. Esto asegura que siempre entre dinero nuevo antes de que salga.</p>
          </div>
          <div className="whitepaper-card">
            <h3>🪲 ¿Qué es Kabuto Miner?</h3>
            <p>Es un juego Play-to-Earn inspirado en el escarabajo rinoceronte (Kabutomushi). Los usuarios simulan la excavación de bloques, ganando $KABUTO que puede ser canjeado por USDT real.</p>
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
            <img src="/icon-mine.png" alt="Mina" className="nav-icon" /><span>Mina</span>
          </div>
          <div className={activeTab === 'tareas' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveTab('tareas')}>
            <img src="/icon-tasks.png" alt="Tareas" className="nav-icon" /><span>Tareas</span>
          </div>
          <div className={activeTab === 'mejoras' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveTab('mejoras')}>
            <img src="/icon-shop.png" alt="Mejoras" className="nav-icon" /><span>Mineros</span>
          </div>
          <div className={activeTab === 'amigos' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveTab('amigos')}>
            <img src="/icon-friends.png" alt="Amigos" className="nav-icon" /><span>Amigos</span>
          </div>
          <div className={activeTab === 'perfil' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveTab('perfil')}>
            <img src="/icon-profile.png" alt="Perfil" className="nav-icon" /><span>Perfil</span>
          </div>
        </nav>
      )}
    </div>
  );
}

export default App;
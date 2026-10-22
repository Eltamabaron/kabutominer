import { useState, useEffect, useRef } from 'react';
import './App.css';

const API_URL = 'https://kabutominer.onrender.com';
const ADMIN_TELEGRAM_ID = '1159596878';

const VIP_PLANS = [
  { id: 1, name: 'VIP 1', price: 1, hash_power: 50, color: '#4caf50' },
  { id: 2, name: 'VIP 2', price: 5, hash_power: 200, color: '#2196f3' },
  { id: 3, name: 'VIP 3', price: 10, hash_power: 500, color: '#9c27b0' },
  { id: 4, name: 'VIP 4', price: 25, hash_power: 1500, color: '#ff9800' },
  { id: 5, name: 'VIP 5', price: 50, hash_power: 5000, color: '#f44336' },
];

const CURRENCIES = [
  { code: 'USDT', name: 'USDT', icon: '🟢' },
  { code: 'TON', name: 'TON', icon: '💎' },
  { code: 'LTC', name: 'Litecoin', icon: '🪙' },
  { code: 'TRX', name: 'TRON', icon: '🔴' },
  { code: 'DOGE', name: 'Dogecoin', icon: '🐕' },
  { code: 'BNB', name: 'BNB', icon: '🟡' },
  { code: 'SOL', name: 'Solana', icon: '☀️' },
  { code: 'USDC', name: 'USDC', icon: '🔵' },
];

function App() {
  const [player, setPlayer] = useState({
    telegram_id: '',
    username: '',
    first_name: '',
    balance: 0,
    hash_power: 1,
    vip_level: 0,
    total_mined: 0
  });
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminView, setShowAdminView] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('mine');
  const [showVipModal, setShowVipModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showWhitepaper, setShowWhitepaper] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [selectedCurrency, setSelectedCurrency] = useState('USDT');
  const [invoiceData, setInvoiceData] = useState(null);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [withdrawCurrency, setWithdrawCurrency] = useState('USDT');
  const [withdrawAddress, setWithdrawAddress] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [completedTasks, setCompletedTasks] = useState([]);
  const [adminStats, setAdminStats] = useState(null);
  const [notification, setNotification] = useState(null);
  const [mining, setMining] = useState(true);

  const saveIntervalRef = useRef(null);
  const checkPaymentIntervalRef = useRef(null);

  // =====================================================
  // LOGIN
  // =====================================================
  async function login() {
    const tg = window.Telegram?.WebApp;
    const user = tg?.initDataUnsafe?.user;

    if (!user) {
      console.error('❌ No se pudo obtener el usuario de Telegram');
      // Datos de fallback para testing
      const testUser = { id: ADMIN_TELEGRAM_ID, username: 'TAMABARON', first_name: 'Admin' };
      await doLogin(testUser);
      return;
    }

    const userData = {
      id: String(user.id),
      username: user.username || '',
      first_name: user.first_name || 'Jugador'
    };
    console.log('🔍 Login - Telegram user:', userData);
    await doLogin(userData);
  }

  async function doLogin(user) {
    try {
      const response = await fetch(`${API_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegram_id: user.id,
          username: user.username,
          first_name: user.first_name
        })
      });

      const data = await response.json();
      console.log('🔍 Login - Respuesta del servidor:', data);

      if (data.error) {
        console.error('❌ Error login:', data.error);
        showNotification('Error al iniciar sesión: ' + data.error, 'error');
        return;
      }

      setPlayer({
        telegram_id: data.telegram_id,
        username: data.username || user.username,
        first_name: data.first_name || user.first_name,
        balance: data.balance || 0,
        hash_power: data.hash_power || 1,
        vip_level: data.vip_level || 0,
        total_mined: data.total_mined || 0
      });

      // 🚨 IMPORTANTE: Forzar is_admin como booleano
      const adminStatus = data.is_admin === true || data.is_admin === 'true';
      setIsAdmin(adminStatus);
      console.log('🔍 is_admin recibido:', data.is_admin, '→ establecido como:', adminStatus);

      // Cargar tareas completadas
      loadCompletedTasks(user.id);
      setLoading(false);
    } catch (err) {
      console.error('❌ Error de red en login:', err);
      showNotification('Error de conexión', 'error');
    }
  }

  // =====================================================
  // CARGAR TAREAS COMPLETADAS
  // =====================================================
  async function loadCompletedTasks(telegramId) {
    try {
      const r = await fetch(`${API_URL}/api/tasks/${telegramId}`);
      const data = await r.json();
      setCompletedTasks(data.completed || []);
    } catch (err) {
      console.error('Error cargando tareas:', err);
    }
  }

  // =====================================================
  // GUARDAR PROGRESO AUTOMÁTICO
  // =====================================================
  useEffect(() => {
    if (!player.telegram_id) return;

    saveIntervalRef.current = setInterval(async () => {
      try {
        await fetch(`${API_URL}/api/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            telegram_id: player.telegram_id,
            balance: player.balance,
            hash_power: player.hash_power,
            total_mined: player.total_mined
          })
        });
      } catch (err) {
        console.error('Error guardando:', err);
      }
    }, 10000);

    return () => clearInterval(saveIntervalRef.current);
  }, [player.telegram_id, player.balance, player.hash_power, player.total_mined]);

  // =====================================================
  // MINADO AUTOMÁTICO
  // =====================================================
  useEffect(() => {
    if (!mining || !player.telegram_id) return;

    const mineInterval = setInterval(() => {
      setPlayer(prev => {
        const mined = prev.hash_power * 0.001;
        return {
          ...prev,
          balance: prev.balance + mined,
          total_mined: prev.total_mined + mined
        };
      });
    }, 1000);

    return () => clearInterval(mineInterval);
  }, [mining, player.telegram_id, player.hash_power]);

  // =====================================================
  // INICIAR AL CARGAR
  // =====================================================
  useEffect(() => {
    login();
  }, []);

  // =====================================================
  // CREAR FACTURA
  // =====================================================
  async function createInvoice(plan) {
    setSelectedPlan(plan);
    try {
      const r = await fetch(`${API_URL}/api/create_invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegram_id: player.telegram_id,
          plan_id: plan.id,
          currency: selectedCurrency
        })
      });
      const data = await r.json();
      if (data.error) {
        showNotification(data.error, 'error');
        return;
      }
      setInvoiceData(data);
      // Abrir la URL de Plisio
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.openLink(data.invoice_url);
      } else {
        window.open(data.invoice_url, '_blank');
      }
      // Empezar a verificar pago
      startCheckingPayment(data.tx_id);
    } catch (err) {
      console.error('Error creando factura:', err);
      showNotification('Error al crear factura', 'error');
    }
  }

  // =====================================================
  // VERIFICAR PAGO AUTOMÁTICAMENTE
  // =====================================================
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
          setInvoiceData(null);
          setShowVipModal(false);
          showNotification('🎉 ¡VIP Activado! Tu hash power aumentó.', 'success');
          // Recargar estado del jugador
          await reloadPlayer();
        }
        // Máximo 60 intentos (5 min)
        if (attempts >= 60) {
          clearInterval(checkPaymentIntervalRef.current);
          setCheckingPayment(false);
        }
      } catch (err) {
        console.error('Error verificando pago:', err);
      }
    }, 5000);
  }

  // =====================================================
  // RECARGAR ESTADO DEL JUGADOR
  // =====================================================
  async function reloadPlayer() {
    try {
      const r = await fetch(`${API_URL}/api/state/${player.telegram_id}`);
      const data = await r.json();
      if (data && !data.error) {
        setPlayer(prev => ({
          ...prev,
          balance: data.balance,
          hash_power: data.hash_power,
          vip_level: data.vip_level,
          total_mined: data.total_mined
        }));
        setIsAdmin(data.is_admin === true);
      }
    } catch (err) {
      console.error('Error recargando:', err);
    }
  }

  // =====================================================
  // RETIRAR
  // =====================================================
  async function handleWithdraw() {
    if (!withdrawAddress || !withdrawAmount) {
      showNotification('Completa todos los campos', 'error');
      return;
    }
    if (parseFloat(withdrawAmount) < 1) {
      showNotification('Mínimo $1', 'error');
      return;
    }
    try {
      const r = await fetch(`${API_URL}/api/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegram_id: player.telegram_id,
          amount: parseFloat(withdrawAmount),
          currency: withdrawCurrency,
          address: withdrawAddress
        })
      });
      const data = await r.json();
      if (data.error) {
        showNotification(data.error, 'error');
        return;
      }
      showNotification('💸 Retiro procesado correctamente', 'success');
      setPlayer(prev => ({ ...prev, balance: data.new_balance }));
      setShowWithdrawModal(false);
      setWithdrawAddress('');
      setWithdrawAmount('');
    } catch (err) {
      console.error('Error retirando:', err);
      showNotification('Error al procesar retiro', 'error');
    }
  }

  // =====================================================
  // COMPLETAR TAREA
  // =====================================================
  async function completeTask(taskId, reward) {
    if (completedTasks.includes(taskId)) return;
    try {
      const r = await fetch(`${API_URL}/api/complete_task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegram_id: player.telegram_id,
          task_id: taskId,
          reward: reward
        })
      });
      const data = await r.json();
      if (data.success) {
        setCompletedTasks([...completedTasks, taskId]);
        setPlayer(prev => ({ ...prev, balance: data.new_balance }));
        showNotification(`+${reward} $KABUTO`, 'success');
      }
    } catch (err) {
      console.error('Error completando tarea:', err);
    }
  }

  // =====================================================
  // CARGAR STATS ADMIN
  // =====================================================
  async function loadAdminStats() {
    try {
      const r = await fetch(`${API_URL}/api/admin/stats?admin_id=${player.telegram_id}`);
      const data = await r.json();
      if (data.error) {
        showNotification(data.error, 'error');
        return;
      }
      setAdminStats(data);
    } catch (err) {
      console.error('Error admin stats:', err);
    }
  }

  // =====================================================
  // BANEAR USUARIO
  // =====================================================
  async function banUser(telegramId) {
    if (!confirm('¿Banear a este usuario?')) return;
    try {
      const r = await fetch(`${API_URL}/api/admin/ban`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin_id: player.telegram_id,
          telegram_id: telegramId
        })
      });
      const data = await r.json();
      if (data.success) {
        showNotification('Usuario baneado', 'success');
        loadAdminStats();
      }
    } catch (err) {
      console.error('Error baneando:', err);
    }
  }

  // =====================================================
  // ACTIVAR VIP MANUAL
  // =====================================================
  async function activateVipManual(telegramId, planId) {
    try {
      const r = await fetch(`${API_URL}/api/admin/activate_vip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin_id: player.telegram_id,
          telegram_id: telegramId,
          plan_id: planId
        })
      });
      const data = await r.json();
      if (data.success) {
        showNotification('VIP activado manualmente', 'success');
        loadAdminStats();
      } else {
        showNotification(data.error || 'Error', 'error');
      }
    } catch (err) {
      console.error('Error activando VIP:', err);
    }
  }

  // =====================================================
  // NOTIFICACIONES
  // =====================================================
  function showNotification(message, type = 'info') {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  }

  // =====================================================
  // NIVEL BASADO EN HASH POWER
  // =====================================================
  function getLevel(hashPower) {
    if (hashPower < 10) return { level: 1, name: 'Novato', next: 10 };
    if (hashPower < 50) return { level: 2, name: 'Aprendiz', next: 50 };
    if (hashPower < 200) return { level: 3, name: 'Minero', next: 200 };
    if (hashPower < 500) return { level: 4, name: 'Pro', next: 500 };
    if (hashPower < 1500) return { level: 5, name: 'Experto', next: 1500 };
    if (hashPower < 5000) return { level: 6, name: 'Maestro', next: 5000 };
    return { level: 7, name: 'Leyenda', next: null };
  }

  const level = getLevel(player.hash_power);
  const progress = level.next ? (player.hash_power / level.next) * 100 : 100;

  // =====================================================
  // LOADING
  // =====================================================
  if (loading) {
    return (
      <div className="App loading-screen">
        <div className="loading-coin">🦏</div>
        <p>Cargando Kabuto Miner...</p>
      </div>
    );
  }

  // =====================================================
  // RENDER
  // =====================================================
  return (
    <div className="App">
      {/* Notificación flotante */}
      {notification && (
        <div className={`notification ${notification.type}`}>
          {notification.message}
        </div>
      )}

      {/* Toggle Admin/Jugador (solo si es admin) */}
      {isAdmin && (
        <button
          onClick={() => setShowAdminView(!showAdminView)}
          className="admin-toggle-btn"
        >
          {showAdminView ? '🎮 Vista Jugador' : '👑 Vista Admin'}
        </button>
      )}

      {/* ====================== VISTA ADMIN ====================== */}
      {isAdmin && showAdminView && (
        <div className="admin-panel">
          <h1>👑 Panel de Administración</h1>
          <button onClick={loadAdminStats} className="refresh-btn">🔄 Actualizar</button>

          {adminStats && (
            <>
              <div className="admin-stats-grid">
                <div className="stat-card">
                  <div className="stat-icon">👥</div>
                  <div className="stat-value">{adminStats.total_users}</div>
                  <div className="stat-label">Usuarios</div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon">💰</div>
                  <div className="stat-value">${adminStats.total_income.toFixed(2)}</div>
                  <div className="stat-label">Ingresos</div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon">💸</div>
                  <div className="stat-value">${adminStats.total_withdrawn.toFixed(2)}</div>
                  <div className="stat-label">Retiros</div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon">💵</div>
                  <div className="stat-value">${adminStats.liquidity_70.toFixed(2)}</div>
                  <div className="stat-label">Liquidez (70%)</div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon">📈</div>
                  <div className="stat-value">${adminStats.admin_profit_30.toFixed(2)}</div>
                  <div className="stat-label">Ganancia (30%)</div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon">⚖️</div>
                  <div className="stat-value">${adminStats.total_balance.toFixed(2)}</div>
                  <div className="stat-label">Balance usuarios</div>
                </div>
              </div>

              <h2>👥 Usuarios ({adminStats.users.length})</h2>
              <div className="users-list">
                {adminStats.users.map(u => (
                  <div key={u.telegram_id} className="user-row">
                    <div className="user-info">
                      <strong>{u.first_name}</strong>
                      {u.username && <span className="username">@{u.username}</span>}
                      <span className="user-id">ID: {u.telegram_id}</span>
                      {u.banned === 1 && <span className="banned-badge">BANEADO</span>}
                    </div>
                    <div className="user-stats">
                      <span>💰 ${u.balance.toFixed(2)}</span>
                      <span>⚡ {u.hash_power} H/s</span>
                      <span>👑 VIP {u.vip_level}</span>
                    </div>
                    <div className="user-actions">
                      <select
                        onChange={(e) => {
                          if (e.target.value) activateVipManual(u.telegram_id, e.target.value);
                          e.target.value = '';
                        }}
                        defaultValue=""
                      >
                        <option value="">+ VIP</option>
                        <option value="1">VIP 1</option>
                        <option value="2">VIP 2</option>
                        <option value="3">VIP 3</option>
                        <option value="4">VIP 4</option>
                        <option value="5">VIP 5</option>
                      </select>
                      {u.banned === 0 && u.telegram_id !== ADMIN_TELEGRAM_ID && (
                        <button onClick={() => banUser(u.telegram_id)} className="ban-btn">🚫 Banear</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <h2>💸 Retiros recientes</h2>
              <div className="withdrawals-list">
                {adminStats.withdrawals.length === 0 ? (
                  <p className="empty">Sin retiros aún</p>
                ) : (
                  adminStats.withdrawals.slice(-10).reverse().map((w, i) => (
                    <div key={i} className="withdrawal-row">
                      <span>👤 {w.telegram_id}</span>
                      <span>💰 ${w.amount} {w.currency}</span>
                      <span>📍 {w.address?.substring(0, 10)}...</span>
                      <span>✅ {w.status}</span>
                    </div>
                  ))
                )}
              </div>

              <h2>📦 Compras recientes</h2>
              <div className="purchases-list">
                {adminStats.purchases.length === 0 ? (
                  <p className="empty">Sin compras aún</p>
                ) : (
                  adminStats.purchases.slice(-10).reverse().map((p, i) => (
                    <div key={i} className="purchase-row">
                      <span>👤 {p.telegram_id}</span>
                      <span>📦 {p.plan}</span>
                      <span>💰 ${p.amount_usd}</span>
                      <span>✅ {p.status}</span>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ====================== VISTA JUGADOR ====================== */}
      {(!isAdmin || !showAdminView) && (
        <>
          {/* Header */}
          <div className="header">
            <div className="player-info">
              <h2>🦏 {player.first_name || player.username}</h2>
              <div className="level-badge">
                Nivel {level.level} - {level.name}
              </div>
            </div>
            <div className="balance-display">
              <div className="balance-label">$KABUTO</div>
              <div className="balance-amount">{player.balance.toFixed(4)}</div>
            </div>
          </div>

          {/* Stats principales */}
          <div className="stats-row">
            <div className="stat-box">
              <div className="stat-icon">⚡</div>
              <div className="stat-info">
                <div className="stat-value">{player.hash_power} H/s</div>
                <div className="stat-label">Hash Power</div>
              </div>
            </div>
            <div className="stat-box">
              <div className="stat-icon">👑</div>
              <div className="stat-info">
                <div className="stat-value">VIP {player.vip_level}</div>
                <div className="stat-label">Nivel VIP</div>
              </div>
            </div>
            <div className="stat-box">
              <div className="stat-icon">⛏️</div>
              <div className="stat-info">
                <div className="stat-value">{player.total_mined.toFixed(2)}</div>
                <div className="stat-label">Total Minado</div>
              </div>
            </div>
          </div>

          {/* Barra de progreso de nivel */}
          <div className="progress-section">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }}></div>
            </div>
            <div className="progress-text">
              {level.next ? `${player.hash_power}/${level.next} H/s para nivel ${level.level + 1}` : 'Nivel máximo alcanzado'}
            </div>
          </div>

          {/* Botón de minado */}
          <div className="mining-section">
            <button
              className={`mine-btn ${mining ? 'mining-active' : ''}`}
              onClick={() => setMining(!mining)}
            >
              <div className="mine-icon">🦏</div>
              <div className="mine-text">
                {mining ? 'MINANDO...' : 'PAUSADO'}
              </div>
              <div className="mine-rate">
                +{(player.hash_power * 0.001).toFixed(4)} $KABUTO/s
              </div>
            </button>
          </div>

          {/* Verificando pago */}
          {checkingPayment && (
            <div className="checking-payment">
              <div className="spinner"></div>
              <p>Esperando confirmación de pago...</p>
              <p className="small">No cierres esta ventana</p>
            </div>
          )}

          {/* Menu inferior flotante */}
          <div className="bottom-menu">
            <button
              className={activeTab === 'mine' ? 'active' : ''}
              onClick={() => setActiveTab('mine')}
            >
              ⛏️ Minar
            </button>
            <button
              className={activeTab === 'vip' ? 'active' : ''}
              onClick={() => setActiveTab('vip')}
            >
              👑 VIP
            </button>
            <button
              className={activeTab === 'tasks' ? 'active' : ''}
              onClick={() => setActiveTab('tasks')}
            >
              📋 Tareas
            </button>
            <button
              className={activeTab === 'wallet' ? 'active' : ''}
              onClick={() => setActiveTab('wallet')}
            >
              💰 Billetera
            </button>
          </div>

          {/* Contenido según tab activo */}
          <div className="content-area">
            {activeTab === 'mine' && (
              <div className="tab-content">
                <h3>⛏️ Minado</h3>
                <p>Tu escarabajo Kabuto está minando automáticamente.</p>
                <p>Compra planes VIP para aumentar tu Hash Power y minar más rápido.</p>
                <button onClick={() => setActiveTab('vip')} className="cta-btn">
                  Ver planes VIP →
                </button>
                <button onClick={() => setShowWhitepaper(true)} className="link-btn">
                  📖 Leer Whitepaper
                </button>
              </div>
            )}

            {activeTab === 'vip' && (
              <div className="tab-content">
                <h3>👑 Planes VIP</h3>
                <p>Aumenta tu Hash Power y mina más rápido</p>

                {/* Selector de moneda */}
                <div className="currency-selector">
                  <label>Pagar con:</label>
                  <div className="currency-grid">
                    {CURRENCIES.map(c => (
                      <button
                        key={c.code}
                        className={`currency-btn ${selectedCurrency === c.code ? 'selected' : ''}`}
                        onClick={() => setSelectedCurrency(c.code)}
                      >
                        <span className="currency-icon">{c.icon}</span>
                        <span className="currency-code">{c.code}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Planes */}
                <div className="plans-grid">
                  {VIP_PLANS.map(plan => (
                    <div
                      key={plan.id}
                      className="plan-card"
                      style={{ borderColor: plan.color }}
                    >
                      <div className="plan-header" style={{ background: plan.color }}>
                        {plan.name}
                      </div>
                      <div className="plan-price">${plan.price}</div>
                      <div className="plan-hashpower">+{plan.hash_power} H/s</div>
                      <button
                        onClick={() => createInvoice(plan)}
                        className="plan-btn"
                        style={{ background: plan.color }}
                      >
                        Comprar
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'tasks' && (
              <div className="tab-content">
                <h3>📋 Tareas Diarias</h3>
                <div className="tasks-list">
                  <div className="task-card">
                    <div className="task-info">
                      <strong>📖 Leer Whitepaper</strong>
                      <span>Recompensa: +10 $KABUTO</span>
                    </div>
                    <button
                      disabled={completedTasks.includes('read_whitepaper')}
                      onClick={() => {
                        setShowWhitepaper(true);
                        completeTask('read_whitepaper', 10);
                      }}
                    >
                      {completedTasks.includes('read_whitepaper') ? '✅' : 'Hacer'}
                    </button>
                  </div>

                  <div className="task-card">
                    <div className="task-info">
                      <strong>📢 Unirse al canal</strong>
                      <span>Recompensa: +5 $KABUTO</span>
                    </div>
                    <button
                      disabled={completedTasks.includes('join_channel')}
                      onClick={() => {
                        window.Telegram?.WebApp?.openLink('https://t.me/kabuto_payments');
                        completeTask('join_channel', 5);
                      }}
                    >
                      {completedTasks.includes('join_channel') ? '✅' : 'Unirse'}
                    </button>
                  </div>

                  <div className="task-card">
                    <div className="task-info">
                      <strong>🎫 Invitar amigos</strong>
                      <span>Usa /referral en el bot</span>
                    </div>
                    <button disabled>
                      En bot
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'wallet' && (
              <div className="tab-content">
                <h3>💰 Billetera</h3>
                <div className="wallet-balance">
                  <div className="balance-label">Balance disponible</div>
                  <div className="balance-big">{player.balance.toFixed(4)} $KABUTO</div>
                </div>

                <button
                  onClick={() => setShowWithdrawModal(true)}
                  className="cta-btn"
                  disabled={player.balance < 1}
                >
                  💸 Retirar
                </button>
                {player.balance < 1 && (
                  <p className="small">Necesitas al menos $1 para retirar</p>
                )}

                <div className="referral-section">
                  <h4>🎫 Enlace de referido</h4>
                  <p>Compártelo y gana 10% de compras + 5% de minado</p>
                  <div className="referral-link">
                    https://t.me/Kabutominer_bot?start=ref_{player.telegram_id}
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ====================== MODAL VIP ====================== */}
      {showVipModal && invoiceData && (
        <div className="modal-overlay" onClick={() => setShowVipModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>💳 Pago en proceso</h3>
            <p>Estamos esperando la confirmación de tu pago en {selectedCurrency}.</p>
            <div className="payment-info">
              <div>Monto: {invoiceData.amount} {invoiceData.currency}</div>
              <div>Plan: {invoiceData.plan.name}</div>
            </div>
            <button onClick={() => window.open(invoiceData.invoice_url, '_blank')}>
              Abrir página de pago
            </button>
            <button onClick={() => setShowVipModal(false)}>Cerrar</button>
          </div>
        </div>
      )}

      {/* ====================== MODAL RETIRO ====================== */}
      {showWithdrawModal && (
        <div className="modal-overlay" onClick={() => setShowWithdrawModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>💸 Retirar $KABUTO</h3>
            <p>Balance disponible: {player.balance.toFixed(4)}</p>

            <label>Moneda:</label>
            <div className="currency-grid">
              {CURRENCIES.map(c => (
                <button
                  key={c.code}
                  className={`currency-btn ${withdrawCurrency === c.code ? 'selected' : ''}`}
                  onClick={() => setWithdrawCurrency(c.code)}
                >
                  <span className="currency-icon">{c.icon}</span>
                  <span className="currency-code">{c.code}</span>
                </button>
              ))}
            </div>

            <label>Dirección de {withdrawCurrency}:</label>
            <input
              type="text"
              value={withdrawAddress}
              onChange={e => setWithdrawAddress(e.target.value)}
              placeholder="Pega tu dirección"
            />

            <label>Monto (USD):</label>
            <input
              type="number"
              value={withdrawAmount}
              onChange={e => setWithdrawAmount(e.target.value)}
              placeholder="Mínimo 1"
              min="1"
              step="0.01"
              max={player.balance}
            />

            <button onClick={handleWithdraw} className="cta-btn">
              Confirmar retiro
            </button>
            <button onClick={() => setShowWithdrawModal(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* ====================== MODAL WHITEPAPER ====================== */}
      {showWhitepaper && (
        <div className="modal-overlay" onClick={() => setShowWhitepaper(false)}>
          <div className="modal whitepaper-modal" onClick={e => e.stopPropagation()}>
            <h2>🦏 Kabuto Miner - Whitepaper</h2>

            <h3>¿Qué es Kabuto Miner?</h3>
            <p>
              Kabuto Miner es un juego Play-to-Earn de minería ficticia inspirado en el escarabajo rinocerón japonés (Kabutomushi). Los jugadores minan tokens $KABUTO que pueden retirar en criptomonedas reales.
            </p>

            <h3>Token $KABUTO</h3>
            <p>
              $KABUTO es el token ficticio del juego. Se obtiene minando automáticamente con Hash Power. No es un token blockchain real, es un saldo interno convertible a criptomonedas reales.
            </p>

            <h3>Hash Power</h3>
            <p>
              El Hash Power determina tu velocidad de minado. Cada segundo ganas: Hash Power × 0.001 $KABUTO. Los planes VIP aumentan tu Hash Power permanentemente.
            </p>

            <h3>Sistema de niveles</h3>
            <ul>
              <li>Nivel 1 - Novato (0 H/s)</li>
              <li>Nivel 2 - Aprendiz (10 H/s)</li>
              <li>Nivel 3 - Minero (50 H/s)</li>
              <li>Nivel 4 - Pro (200 H/s)</li>
              <li>Nivel 5 - Experto (500 H/s)</li>
              <li>Nivel 6 - Maestro (1500 H/s)</li>
              <li>Nivel 7 - Leyenda (5000+ H/s)</li>
            </ul>

            <h3>Planes VIP</h3>
            <p>Aumentan tu Hash Power permanentemente:</p>
            <ul>
              <li>VIP 1 - $1 → +50 H/s</li>
              <li>VIP 2 - $5 → +200 H/s</li>
              <li>VIP 3 - $10 → +500 H/s</li>
              <li>VIP 4 - $25 → +1500 H/s</li>
              <li>VIP 5 - $50 → +5000 H/s</li>
            </ul>

            <h3>Transparencia 30/70</h3>
            <p>
              De todos los ingresos: 70% se reserva para pagar retiros de usuarios, 30% para mantenimiento y ganancia del admin. Todos los pagos y retiros se publican en @kabuto_payments
            </p>

            <h3>Sistema de referidos</h3>
            <ul>
              <li>10% de comisión en cada compra VIP de tus referidos</li>
              <li>5% de comisión de todo lo que minen tus referidos</li>
            </ul>

            <h3>Pagos y retiros</h3>
            <p>
              Procesados via Plisio en: USDT, TON, LTC, TRX, DOGE, BNB, SOL, USDC. Mínimo de retiro: $1.
            </p>

            <button onClick={() => setShowWhitepaper(false)}>Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

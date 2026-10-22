const axios = require('axios');

const RENDER_URL = 'https://kabutominer.onrender.com';
const YOUR_TELEGRAM_ID = '1159596878';
const YOUR_USERNAME = 'TAMABARON';

async function diagnose() {
  console.log('=======================================');
  console.log('  KABUTO MINER - DIAGNOSTICO PANEL ADMIN');
  console.log('=======================================\n');

  console.log('1. Verificando servidor...');
  try {
    const r = await axios.get(`${RENDER_URL}/api/public_stats`, { timeout: 10000 });
    console.log('   OK Servidor activo. Usuarios:', r.data.total_users);
  } catch (err) {
    console.log('   ERROR Servidor no responde:', err.message);
    return;
  }

  console.log('\n2. Login con tu Telegram ID...');
  let userData;
  try {
    const r = await axios.post(`${RENDER_URL}/api/login`, {
      telegram_id: YOUR_TELEGRAM_ID,
      username: YOUR_USERNAME,
      first_name: 'Admin'
    }, { timeout: 10000 });
    userData = r.data;
    console.log('   OK Login exitoso:');
    console.log('      telegram_id:', userData.telegram_id);
    console.log('      username:', userData.username);
    console.log('      vip_level:', userData.vip_level);
    console.log('      hash_power:', userData.hash_power);
    console.log('      is_admin:', userData.is_admin);
  } catch (err) {
    console.log('   ERROR en login:', err.response?.data || err.message);
    return;
  }

  console.log('\n3. Verificando is_admin...');
  if (userData.is_admin === true) {
    console.log('   OK Backend te reconoce como ADMIN');
  } else {
    console.log('   ERROR Backend NO te reconoce como admin');
  }

  console.log('\n4. Verificando /api/admin/stats...');
  try {
    const r = await axios.get(`${RENDER_URL}/api/admin/stats?admin_id=${YOUR_TELEGRAM_ID}`, { timeout: 10000 });
    console.log('   OK Admin stats funciona. Total usuarios:', r.data.total_users);
  } catch (err) {
    console.log('   ERROR Admin stats:', err.response?.status, err.response?.data?.error || '');
  }

  console.log('\n=======================================');
  console.log('  DIAGNOSTICO COMPLETADO');
  console.log('=======================================\n');

  if (userData.is_admin === true) {
    console.log('BACKEND OK - El problema esta en el FRONTEND (App.jsx)');
  } else {
    console.log('BACKEND FALLA - Tu ID no coincide con 1159596878');
  }
}

diagnose().catch(console.error);
const axios = require('axios');

const RENDER_URL = 'https://kabutominer.onrender.com';
const YOUR_TELEGRAM_ID = '1159596878';

async function deepDiagnose() {
  console.log('=======================================');
  console.log('  DIAGNOSTICO PROFUNDO - SUPABASE');
  console.log('=======================================\n');

  // 1. Probar public_stats
  console.log('1. Probando /api/public_stats...');
  try {
    const r = await axios.get(`${RENDER_URL}/api/public_stats`, { timeout: 10000 });
    console.log('   OK:', JSON.stringify(r.data, null, 2));
  } catch (err) {
    console.log('   ERROR:', err.response?.data || err.message);
  }

  // 2. Probar login con datos minimos
  console.log('\n2. Login con datos minimos...');
  try {
    const r = await axios.post(`${RENDER_URL}/api/login`, {
      telegram_id: YOUR_TELEGRAM_ID,
      username: 'test',
      first_name: 'Test'
    }, { timeout: 15000 });
    console.log('   OK:', JSON.stringify(r.data, null, 2));
  } catch (err) {
    console.log('   ERROR:', err.response?.data || err.message);
    console.log('   Status:', err.response?.status);
  }

  // 3. Probar login sin telegram_id (debe dar error 400)
  console.log('\n3. Login sin telegram_id (debe dar error 400)...');
  try {
    const r = await axios.post(`${RENDER_URL}/api/login`, {
      username: 'test'
    }, { timeout: 10000 });
    console.log('   Respuesta:', r.status, JSON.stringify(r.data));
  } catch (err) {
    console.log('   Status:', err.response?.status, 'Data:', err.response?.data);
  }

  // 4. Verificar estado del usuario directamente
  console.log('\n4. GET /api/state/1159596878...');
  try {
    const r = await axios.get(`${RENDER_URL}/api/state/1159596878`, { timeout: 10000 });
    console.log('   OK:', JSON.stringify(r.data, null, 2));
  } catch (err) {
    console.log('   ERROR:', err.response?.status, err.response?.data || err.message);
  }

  console.log('\n=======================================');
  console.log('  ANALISIS');
  console.log('=======================================');
  console.log('Si TODOS fallan con error 500:');
  console.log('  → SUPABASE_URL o SUPABASE_KEY mal configuradas en Render');
  console.log('  → O las tablas no existen en Supabase');
  console.log('  → Ve a https://supabase.com → tu proyecto → Table Editor');
  console.log('  → Debes ver las tablas: users, referrals, withdrawals, purchases, tasks_completed');
}

deepDiagnose().catch(console.error);
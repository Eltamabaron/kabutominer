const axios = require('axios');

const RENDER_URL = 'https://kabutominer.onrender.com';

async function test() {
  console.log('=== TEST DE LOGIN CON DETALLE ===\n');

  // Probar login
  try {
    const r = await axios.post(`${RENDER_URL}/api/login`, {
      telegram_id: '1159596878',
      username: 'TAMABARON',
      first_name: 'Admin'
    }, { timeout: 30000 });
    console.log('OK! Respuesta:', JSON.stringify(r.data, null, 2));
  } catch (err) {
    console.log('ERROR Status:', err.response?.status);
    console.log('ERROR Data:', JSON.stringify(err.response?.data, null, 2));
  }

  // Verificar state
  console.log('\n=== TEST DE STATE ===');
  try {
    const r = await axios.get(`${RENDER_URL}/api/state/1159596878`, { timeout: 10000 });
    console.log('OK:', JSON.stringify(r.data, null, 2));
  } catch (err) {
    console.log('ERROR Status:', err.response?.status);
    console.log('ERROR Data:', err.response?.data);
  }
}

test().catch(console.error);
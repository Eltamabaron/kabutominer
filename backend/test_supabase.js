const { createClient } = require('@supabase/supabase-js');

// ⚠️ PEGA AQUÍ TUS VALORES REALES DE SUPABASE
const SUPABASE_URL = 'https://dhftuvoglnronkdhdfvl.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRoZnR1dm9nbG5yb25rZGhkZnZsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MjYxNDE0MCwiZXhwIjoyMTA4MTkwMTQwfQ.ijmcFRCTaad4dG2QZPEdWd6M_DxzM-3qyw-mMh_dvko';

async function test() {
  console.log('=========================================');
  console.log('  TEST DIRECTO A SUPABASE');
  console.log('=========================================\n');

  console.log('URL:', SUPABASE_URL);
  console.log('KEY longitud:', SUPABASE_KEY.length, 'caracteres');
  console.log('KEY empieza con:', SUPABASE_KEY.substring(0, 20) + '...');
  console.log('');

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // 1. SELECT simple
  console.log('1. SELECT de users...');
  try {
    const { data, error } = await supabase.from('users').select('*');
    if (error) {
      console.log('   ERROR:', error.message);
    } else {
      console.log('   OK! Usuarios encontrados:', data.length);
      console.log('   Datos:', JSON.stringify(data, null, 2));
    }
  } catch (err) {
    console.log('   EXCEPCION:', err.message);
  }

  // 2. INSERT de prueba
  console.log('\n2. INSERT de prueba...');
  try {
    const { data, error } = await supabase.from('users').insert([{
      telegram_id: 'test_node_001',
      username: 'testnode',
      first_name: 'Test',
      balance: 0,
      hash_power: 1,
      vip_level: 0,
      total_mined: 0,
      banned: 0
    }]).select();

    if (error) {
      console.log('   ERROR:', error.message);
    } else {
      console.log('   OK! Insertado:', JSON.stringify(data, null, 2));
    }
  } catch (err) {
    console.log('   EXCEPCION:', err.message);
  }
}

test().catch(console.error);
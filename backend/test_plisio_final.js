// =====================================================
// TEST FINAL - Crear factura de $3 USD (mínimo Plisio)
// =====================================================
// Reemplaza TU_API_KEY_REAL con tu API key de Plisio
// =====================================================

const axios = require('axios');

const PLISIO_API_KEY = 'xxWBe8xc_Tz6NDJ5zItE5dgdSRbIxAT59-i0uuiRSf_uI3mL8mV8S-7gf6sk1N64'; // ⚠️ CAMBIA ESTO

async function test() {
  console.log('=== TEST FACTURA $3 USD (mínimo Plisio) ===\n');

  console.log('Creando factura de $3 USD en USDT...');
  try {
    const params = new URLSearchParams({
      source_currency: 'USD',
      source_amount: 3, // 🚀 FIX: $3 USD (mínimo de Plisio)
      currency: 'USDT',
      order_name: 'Kabuto VIP 1',
      order_number: 'test_' + Date.now(),
      api_key: PLISIO_API_KEY
    });

    const r = await axios.get(
      `https://api.plisio.net/api/v1/invoices/new?${params.toString()}`,
      { timeout: 30000 }
    );

    console.log('   ✅ FACTURA CREADA CORRECTAMENTE');
    console.log('   TXN ID:', r.data.data?.txn_id);
    console.log('   URL:', r.data.data?.invoice_url);
    console.log('   Total a pagar:', r.data.data?.invoice_total_sum, 'USDT');
    console.log('\n   Abre la URL en tu navegador para ver la factura.');
  } catch (err) {
    console.log('   ❌ ERROR:', err.response?.status);
    if (err.response?.data) {
      console.log('   Data:', err.response.data);
    }
  }
}

test().catch(console.error);

// =====================================================
// TEST TODAS LAS CRIPTOMONEDAS - Encontrar mínimos
// =====================================================
// Reemplaza TU_API_KEY_REAL con tu API key de Plisio
// =====================================================

const axios = require('axios');

const PLISIO_API_KEY = 'xxWBe8xc_Tz6NDJ5zItE5dgdSRbIxAT59-i0uuiRSf_uI3mL8mV8S-7gf6sk1N64'; // ⚠️ CAMBIA ESTO

const CURRENCIES = ['USDT', 'TON', 'LTC', 'TRX', 'DOGE', 'BNB', 'SOL', 'USDC'];
const AMOUNTS_TO_TEST = [3, 5, 10, 25, 50]; // USD

async function test() {
  console.log('=== TEST MÍNIMOS POR CRIPTOMONEDA ===\n');
  console.log('Probando crear facturas de diferentes montos en cada moneda...\n');

  for (const currency of CURRENCIES) {
    console.log(`\n📊 ${currency}:`);

    for (const amount of AMOUNTS_TO_TEST) {
      try {
        const params = new URLSearchParams({
          source_currency: 'USD',
          source_amount: amount,
          currency: currency,
          order_name: `Test ${currency} ${amount}`,
          order_number: `test_${currency}_${amount}_${Date.now()}`,
          api_key: PLISIO_API_KEY
        });

        const r = await axios.get(
          `https://api.plisio.net/api/v1/invoices/new?${params.toString()}`,
          { timeout: 30000 }
        );

        if (r.data.status === 'success') {
          console.log(`   ✅ $${amount} USD → OK (${r.data.data?.invoice_total_sum} ${currency})`);
          break; // Si funciona, no probar montos mayores
        } else {
          console.log(`   ⚠️  $${amount} USD → ${r.data.message || 'error'}`);
        }
      } catch (err) {
        const msg = err.response?.data?.data?.message || err.response?.data?.message || err.message;
        console.log(`   ❌ $${amount} USD → ${msg}`);
      }
    }
  }

  console.log('\n=== RESUMEN ===');
  console.log('Las criptomonedas con ❌ en todos los montos no funcionan.');
  console.log('Las que tienen ✅ funcionan en ese monto mínimo.');
}

test().catch(console.error);

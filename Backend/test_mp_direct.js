const fetch = require('node-fetch');
require('dotenv').config();

async function testMPDirect() {
    console.log("Probando suscripción directa con API de Mercado Pago...");
    
    // Usaremos un token reciente capturado de tus logs
    const testToken = '6af9eb475a87099a3ffe9909b8d2c4a0'; 
    
    const body = {
        back_url: "https://example.com",
        reason: "Test Suscripción Metria",
        auto_recurring: {
            frequency: 1,
            frequency_type: 'months',
            transaction_amount: 28000,
            currency_id: 'CLP'
        },
        payer_email: "test_user_success@testuser.com",
        card_token_id: testToken,
        status: 'authorized'
    };

    try {
        const response = await fetch('https://api.mercadopago.com/preapproval', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        const data = await response.json();
        console.log("Respuesta de MP:", JSON.stringify(data, null, 2));
    } catch (error) {
        console.error("Error en test:", error);
    }
}

testMPDirect();

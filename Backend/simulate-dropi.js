async function simulateDropiWebhooks() {
    const workspaceId = 'workspace-default'; // from the seeded database
    const webhookUrl = 'http://localhost:4000/api/dropi/webhooks/status';

    const events = [
        {
            guideId: 'DRP-' + Math.floor(Math.random() * 100000),
            orderId: '#1055', // An example Shopify order format
            clientName: 'María Pérez',
            city: 'Santiago',
            status: 'En Tránsito',
            shippingFee: '3.50',
            workspaceId
        },
        {
            guideId: 'DRP-' + Math.floor(Math.random() * 100000),
            orderId: '#1056',
            clientName: 'Juan Gómez',
            city: 'Bogotá',
            status: 'Entregado',
            collectedValue: '45.00',
            shippingFee: '5.00',
            workspaceId
        },
        {
            guideId: 'DRP-' + Math.floor(Math.random() * 100000),
            orderId: '#1057',
            clientName: 'Lucía Fernández',
            city: 'Valparaíso',
            status: 'Devuelto',
            shippingFee: '4.50',
            workspaceId
        }
    ];

    console.log("-----------------------------------------");
    console.log("Simulando Eventos Dropi hacia el Backend...");
    console.log("-----------------------------------------\n");

    for (const payload of events) {
        console.log(`Enviando actualización para Guía ${payload.guideId} - Estado: ${payload.status}`);

        try {
            const resp = await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const r = await resp.json();
            console.log(`Respuesta Metria Metrics:`, resp.status, r);
            console.log("---");
        } catch (e) {
            console.error("Error conectando a " + webhookUrl, e.message);
        }

        // Esperamos 2 segundos entre cada evento para que se vea más real
        await new Promise(r => setTimeout(r, 2000));
    }

    console.log("✅ Simulación completada. Revisa los logs en Metria y tu Dashboard de Logística.");
}

simulateDropiWebhooks();

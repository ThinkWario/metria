import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

const workspaceId = '2a3c8b35-e91c-4e36-afa0-b783f3734c33';
const API_URL = 'http://127.0.0.1:4000/api';

async function setup() {
  console.log('--- SETUP: Creating dummy channels ---');
  
  // WHATSAPP
  await prisma.channel.upsert({
    where: { workspaceId_platform: { workspaceId, platform: 'WHATSAPP' } },
    update: {
      status: 'CONNECTED',
      config: {
        verifyToken: 'METRIA_TEST_TOKEN',
        appSecret: 'METRIA_TEST_SECRET',
        phoneNumberId: '123456789'
      }
    },
    create: {
      workspaceId,
      platform: 'WHATSAPP',
      name: 'Test WhatsApp',
      status: 'CONNECTED',
      config: {
        verifyToken: 'METRIA_TEST_TOKEN',
        appSecret: 'METRIA_TEST_SECRET',
        phoneNumberId: '123456789'
      }
    }
  });

  // TELEGRAM
  await prisma.channel.upsert({
    where: { workspaceId_platform: { workspaceId, platform: 'TELEGRAM' } },
    update: {
      status: 'CONNECTED',
      config: {
        botToken: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11'
      }
    },
    create: {
      workspaceId,
      platform: 'TELEGRAM',
      name: 'Test Telegram',
      status: 'CONNECTED',
      config: {
        botToken: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11'
      }
    }
  });

  console.log('Dummy channels created.');
}

async function testWhatsAppVerify() {
  console.log('\n--- TEST: WhatsApp Verification (GET) ---');
  const challenge = 'test_challenge_123';
  const url = `${API_URL}/webhooks/whatsapp/${workspaceId}?hub.mode=subscribe&hub.verify_token=METRIA_TEST_TOKEN&hub.challenge=${challenge}`;
  
  const response = await fetch(url);
  const text = await response.text();
  
  if (response.status === 200 && text === challenge) {
    console.log('✅ WhatsApp Verification successful');
  } else {
    console.error(`❌ WhatsApp Verification failed. Status: ${response.status}, Response: ${text}`);
  }
}

async function testWhatsAppWebhook() {
  console.log('\n--- TEST: WhatsApp Webhook (POST) ---');
  const payload = {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'WHATSAPP_BUSINESS_ACCOUNT_ID',
      changes: [{
        value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: '123456789', phone_number_id: '123456789' },
          contacts: [{ profile: { name: 'Test User' }, wa_id: '1234567890' }],
          messages: [{
            from: '1234567890',
            id: 'wamid.HBgLMTIzNDU2Nzg5MFVGRVFGRVFGRVFGRVFGRVQF',
            timestamp: '1623123456',
            type: 'text',
            text: { body: 'Hello from Test' }
          }]
        },
        field: 'messages'
      }]
    }]
  };

  const rawBody = JSON.stringify(payload);
  const signature = 'sha256=' + crypto.createHmac('sha256', 'METRIA_TEST_SECRET').update(rawBody).digest('hex');

  const response = await fetch(`${API_URL}/webhooks/whatsapp/${workspaceId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hub-signature-256': signature
    },
    body: rawBody
  });

  if (response.status === 200) {
    console.log('✅ WhatsApp Webhook processed successfully');
    
    // Wait for async processing
    console.log('Waiting 2 seconds for DB storage...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Verify in DB
    const msg = await prisma.message.findFirst({
      where: { workspaceId, content: 'Hello from Test' }
    });
    if (msg) {
      console.log('✅ Message found in DB');
    } else {
      console.error('❌ Message NOT found in DB');
    }
  } else {
    const text = await response.text();
    console.error(`❌ WhatsApp Webhook failed. Status: ${response.status}, Response: ${text}`);
  }
}

async function testTelegramWebhook() {
  console.log('\n--- TEST: Telegram Webhook (POST) ---');
  const payload = {
    update_id: 123456789,
    message: {
      message_id: 1,
      from: { id: 987654321, is_bot: false, first_name: 'Test', last_name: 'User', username: 'testuser' },
      chat: { id: 987654321, first_name: 'Test', last_name: 'User', username: 'testuser', type: 'private' },
      date: 1623123456,
      text: 'Hello from Telegram'
    }
  };

  const response = await fetch(`${API_URL}/webhooks/telegram/${workspaceId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (response.status === 200) {
    console.log('✅ Telegram Webhook processed successfully');
    // Note: Telegram processing is usually async via service
  } else {
    console.error(`❌ Telegram Webhook failed. Status: ${response.status}`);
  }
}

async function cleanup() {
  console.log('\n--- CLEANUP: Removing dummy data ---');
  await prisma.channel.deleteMany({ where: { workspaceId, name: { contains: 'Test' } } });
  await prisma.message.deleteMany({ where: { workspaceId, content: { contains: 'Hello from' } } });
  // Conversations and contacts will be left but it's okay for now
  console.log('Cleanup complete.');
}

async function main() {
  try {
    await setup();
    await testWhatsAppVerify();
    await testWhatsAppWebhook();
    await testTelegramWebhook();
  } catch (err) {
    console.error('Test error:', err);
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
}

main();

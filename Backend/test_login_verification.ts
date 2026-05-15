
import 'dotenv/config';

async function testLogin() {
    const payload = {
        email: 'wario.jorquera@gmail.com',
        password: 'metria2025'
    };

    try {
        console.log('Testing login for:', payload.email);
        const response = await fetch('http://127.0.0.1:4000/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        
        if (response.ok && data.token) {
            console.log('✅ Login Successful!');
            console.log('Token received:', data.token.substring(0, 20) + '...');
        } else {
            console.log('❌ Login Failed');
            console.log('Status:', response.status);
            console.log('Response:', data);
        }
    } catch (error) {
        console.error('Core Error:', error.message);
    }
}

testLogin();

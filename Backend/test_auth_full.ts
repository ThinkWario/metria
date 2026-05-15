async function test() {
    try {
        const loginRes = await fetch('http://127.0.0.1:4000/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'admin@metria.com', password: 'metria2025' })
        })
        const loginData = await loginRes.json()
        const token = (loginData as any).token
        console.log('Token Length:', token.length)

        const meRes = await fetch('http://127.0.0.1:4000/api/users/me', {
            headers: { Authorization: `Bearer ${token}` }
        })
        console.log('Me Response Status:', meRes.status)
        const meData = await meRes.json()
        console.log('User Data:', JSON.stringify(meData, null, 2))
    } catch (e: any) {
        console.error('Error:', e.message)
    }
}

test()

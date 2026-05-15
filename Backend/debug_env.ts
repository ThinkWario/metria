import 'dotenv/config'
console.log('CLIENT_ID:', process.env.GOOGLE_ADS_CLIENT_ID)
console.log('CLIENT_SECRET:', process.env.GOOGLE_ADS_CLIENT_SECRET ? 'Present' : 'Missing')

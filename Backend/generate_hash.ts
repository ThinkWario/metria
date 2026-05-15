import bcrypt from 'bcrypt'

async function generate() {
    const password = 'metria2025'
    const hash = await bcrypt.hash(password, 10)
    console.log(`Hash for ${password}: ${hash}`)
}

generate()

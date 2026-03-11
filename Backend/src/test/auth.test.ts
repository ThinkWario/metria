import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import app from '../app'
import { prisma } from './setup'

describe('Auth Integration Tests', () => {
    let testUser: any
    let testWorkspace: any

    beforeAll(async () => {
        // Create a test workspace and user
        testWorkspace = await prisma.workspace.create({
            data: {
                name: 'Test Workspace',
                status: 'ACTIVE'
            }
        })

        testUser = await prisma.user.create({
            data: {
                email: 'test@metria.com',
                passwordHash: 'password123',
                name: 'Test User',
                role: 'USER',
                workspaceId: testWorkspace.id
            }
        })
    })

    describe('POST /api/auth/login', () => {
        it('should login successfully with correct credentials', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'test@metria.com',
                    password: 'password123'
                })

            expect(response.status).toBe(200)
            expect(response.body).toHaveProperty('token')
            expect(response.body.user.email).toBe('test@metria.com')
        })

        it('should return 401 with incorrect password', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'test@metria.com',
                    password: 'wrongpassword'
                })

            expect(response.status).toBe(401)
            expect(response.body.error).toBe('Invalid credentials')
        })

        it('should return 400 if email or password is missing', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'test@metria.com'
                })

            expect(response.status).toBe(400)
        })
    })
})

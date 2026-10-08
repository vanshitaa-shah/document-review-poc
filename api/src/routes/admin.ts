import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth.ts'
import { validate } from '../middleware/validate.ts'
import { createUser, listRoles } from '../controllers/admin/index.ts'
import { createUserSchema } from '../schemas/admin.schema.ts'

export const adminRouter = Router()

// Creates a user (author or reviewer) with an email, password and category memberships.
adminRouter.post('/users', requireAuth, requireRole('ADMIN'), validate({ body: createUserSchema }), createUser)

// Lists the roles an admin can assign when creating a user, straight from the Role table.
adminRouter.get('/roles', requireAuth, requireRole('ADMIN'), listRoles)

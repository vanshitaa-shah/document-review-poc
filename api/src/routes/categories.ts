import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { listMyCategories } from '../controllers/categories/index.js'

export const categoriesRouter = Router()

// Categories the caller is a member of — used to populate the new-document category picker.
categoriesRouter.get('/', requireAuth, listMyCategories)

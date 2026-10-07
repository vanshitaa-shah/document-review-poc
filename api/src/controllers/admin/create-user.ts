import type { Request, Response } from 'express'
import bcrypt from 'bcrypt'
import { Prisma } from '@prisma/client'
import type { z } from 'zod'
import { prisma } from '../../lib/prisma.ts'
import { ConflictError, ValidationError } from '../../lib/errors.ts'
import { transactionOptions } from '../../lib/transactionOptions.ts'
import { createUserSchema } from '../../schemas/admin.schema.ts'

// Admin creates an account with a password they choose, plus its category memberships,
export async function createUser(req: Request, res: Response) {
  const { email, password, role, categoryIds } = req.body as z.infer<typeof createUserSchema>
  const uniqueCategoryIds = [...new Set(categoryIds)]

  const passwordHash = await bcrypt.hash(password, 10)

  try {
    const user = await prisma.$transaction(async (tx) => {
      const found = await tx.category.count({ where: { id: { in: uniqueCategoryIds } } })
      if (found !== uniqueCategoryIds.length) {
        throw new ValidationError('One or more categories do not exist')
      }

      return tx.user.create({
        data: {
          email,
          passwordHash,
          role: { connect: { name: role } },
          memberships: { create: uniqueCategoryIds.map((categoryId) => ({ categoryId })) },
        },
        select: { id: true, email: true, role: { select: { name: true } }, createdAt: true },
      })
    }, transactionOptions)

    res.status(201).json({ ...user, role: user.role.name, categoryIds: uniqueCategoryIds })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ConflictError('A user with this email already exists')
    }
    throw err
  }
}

import type { Request, Response } from 'express'
import bcrypt from 'bcrypt'
import { Prisma } from '@prisma/client'
import type { z } from 'zod'
import { prisma } from '../../lib/prisma.ts'
import { ConflictError, ValidationError } from '../../lib/errors.ts'
import { transactionOptions } from '../../lib/transactionOptions.ts'
import { createUserSchema, NON_ASSIGNABLE_ROLE } from '../../schemas/admin.schema.ts'

// Admin creates an account with a password they choose, plus its category memberships,
export async function createUser(req: Request, res: Response) {
  const { email, password, roleId, categoryIds } = req.body as z.infer<typeof createUserSchema>
  const uniqueCategoryIds = [...new Set(categoryIds)]

  const passwordHash = await bcrypt.hash(password, 10)

  try {
    const user = await prisma.$transaction(async (tx) => {
      const found = await tx.category.count({ where: { id: { in: uniqueCategoryIds } } })
      if (found !== uniqueCategoryIds.length) {
        throw new ValidationError('One or more categories do not exist')
      }

      const role = await tx.role.findFirst({ where: { id: roleId, name: { not: NON_ASSIGNABLE_ROLE } } })
      if (!role) throw new ValidationError('Unknown role')

      // For now a reviewer works in exactly one category; authors can span several.
      if (role.name === 'REVIEWER' && uniqueCategoryIds.length !== 1) {
        throw new ValidationError('A reviewer can belong to only one category')
      }

      return tx.user.create({
        data: {
          email,
          passwordHash,
          role: { connect: { id: role.id } },
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

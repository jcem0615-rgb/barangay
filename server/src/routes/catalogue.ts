import { Router } from 'express'
import { query } from '../db.ts'
import { WORKFLOW_STEPS } from '../workflow.ts'
import { toPesos } from '../serialize.ts'

export const catalogueRouter = Router()

// Public: residents browse offices and services before signing in.
catalogueRouter.get('/', async (_req, res) => {
  const departments = await query(
    `select id, name, office_name as "officeName", description, icon
       from departments order by sort_order, name`
  )
  const serviceRows = await query<{
    id: string; department_id: string; name: string; short_description: string
    processing_time: string; fee_centavos: number; requires_payment: boolean
    requirements: string[]; fields: unknown[]
  }>(
    `select id, department_id, name, short_description, processing_time,
            fee_centavos, requires_payment, requirements, fields
       from services where active = true order by department_id, name`
  )

  res.json({
    departments,
    services: serviceRows.map((s) => ({
      id: s.id,
      categoryId: s.department_id,
      name: s.name,
      shortDescription: s.short_description,
      processingTime: s.processing_time,
      fee: toPesos(s.fee_centavos),
      requiresPayment: s.requires_payment,
      requirements: s.requirements,
      fields: s.fields,
    })),
    workflowSteps: WORKFLOW_STEPS,
  })
})

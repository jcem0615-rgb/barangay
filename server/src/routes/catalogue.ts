import { Router } from 'express'
import { query, one } from '../db.ts'
import { WORKFLOW_STEPS } from '../workflow.ts'
import { toPesos } from '../serialize.ts'
import { servedMunicipality } from '../identity.ts'
import { configuredTier, productName } from '../deployment.ts'

export const catalogueRouter = Router()

// Public: residents browse offices and services before signing in.
catalogueRouter.get('/', async (_req, res) => {
  const departments = await query(
    `select id, name, office_name as "officeName", description, icon,
            address, hours, phone, email
       from departments order by sort_order, name`
  )
  const serviceRows = await query<{
    id: string; department_id: string; name: string; short_description: string
    processing_time: string; processing_days_min: number; processing_days_max: number
    fee_centavos: number; requires_payment: boolean
    requirements: string[]; fields: unknown[]; search_terms: string[]; steps: unknown[]
  }>(
    `select id, department_id, name, short_description, processing_time,
            processing_days_min, processing_days_max,
            fee_centavos, requires_payment, requirements, fields, search_terms, steps
       from services where active = true order by department_id, name`
  )

  const programs = await query(
    `select code, name, short_name as "shortName", kind, description, benefit,
            issuing_office as "issuingOffice", id_label as "idLabel", expires
       from sectoral_programs order by sort_order, name`
  )

  // Public, and deliberately so: a hotline is not something to sign in for.
  const emergencyContacts = await query(
    `select id, label, agency, phone, is_national as "isNational"
       from emergency_contacts order by is_national, sort_order, label`
  )

  // Public, and it has to be: the sign-up screen needs to say which
  // municipality it is registering someone into before they have an account.
  const municipality = await servedMunicipality()

  const tier = configuredTier()
  res.json({
    municipality,
    departments,
    emergencyContacts,
    programs,
    services: serviceRows.map((s) => ({
      id: s.id,
      categoryId: s.department_id,
      name: s.name,
      shortDescription: s.short_description,
      processingTime: s.processing_time,
      processingDaysMin: s.processing_days_min,
      processingDaysMax: s.processing_days_max,
      fee: toPesos(s.fee_centavos),
      requiresPayment: s.requires_payment,
      requirements: s.requirements,
      fields: s.fields,
      searchTerms: s.search_terms,
      steps: s.steps,
    })),
    // Which product this is.
    //
    // The client cannot infer it from an empty service list — that is also
    // what a municipal deployment looks like before anybody seeds it — and
    // guessing wrong means a resident in a barangay deployment is shown a
    // "Municipal services" button that leads to a tab with nothing behind it.
    // Published on the catalogue because it is public, cached on the device,
    // and read before the first render, which is exactly when the shell has to
    // decide what to draw.
    tier,
    // What the app should call itself: the two tiers are two products.
    productName: productName(),
    // In barangay tier, the one barangay this instance serves: the resident
    // app has no tier switch and no barangay picker, so it needs to know whose
    // notices and certificates it is showing before anybody signs in.
    barangay: tier === 'barangay'
      ? await one<{ id: string; name: string }>(`select id, name from barangays limit 1`)
      : null,
    workflowSteps: WORKFLOW_STEPS,
    // Published so the app can say "apply today, ready by …" on the form,
    // without shipping a second copy of the holiday calendar to the client.
    holidays: await query(
      `select observed_on::text as date, name, is_local as "isLocal"
         from holidays where observed_on >= current_date - 7
        order by observed_on`
    ),
  })
})

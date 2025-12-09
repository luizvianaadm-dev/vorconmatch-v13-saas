// File: src/app/api/asaas/webhook/route.ts
// VorconMatch V13 - Asaas Webhook Handler (Next.js App Router)
// Receives and processes payment status updates from Asaas

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { handleAsaasWebhook } from '@/lib/asaas'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Allowed webhook events from Asaas
const ALLOWED_EVENTS = [
  'PAYMENT_CONFIRMED',
  'PAYMENT_RECEIVED',
  'PAYMENT_REFUNDED',
  'PAYMENT_OVERDUE',
  'PAYMENT_FAILED',
  'PAYMENT_DELETED'
]

export async function POST(req: NextRequest) {
  try {
    // Verify webhook signature (optional but recommended)
    const webhookSecret = process.env.ASAAS_WEBHOOK_SECRET
    // In production, verify the signature from Asaas headers
    // This prevents unauthorized requests

    const payload = await req.json()
    const event = payload.event
    const paymentData = payload.payment

    // Validate event type
    if (!ALLOWED_EVENTS.includes(event)) {
      console.warn(`⚠ Unknown webhook event: ${event}`)
      return NextResponse.json({ received: true })
    }

    // Validate payload structure
    if (!paymentData || !paymentData.id) {
      console.error('❌ Invalid webhook payload: missing payment data')
      return NextResponse.json(
        { error: 'Invalid payload' },
        { status: 400 }
      )
    }

    // Process the webhook event
    await handleAsaasWebhook(event, paymentData, supabase)

    // Log webhook processing
    await supabase
      .from('audit_logs')
      .insert({
        action: 'WEBHOOK_ASAAS',
        resource: 'payment',
        details: {
          event,
          payment_id: paymentData.id,
          status: paymentData.status
        },
        status: 'success'
      })
      .catch((err) => console.error('❌ Error logging webhook:', err))

    return NextResponse.json({ received: true })
  } catch (error: any) {
    console.error('❌ Webhook processing error:', error.message)

    // Log error
    try {
      await supabase
        .from('audit_logs')
        .insert({
          action: 'WEBHOOK_ASAAS',
          resource: 'payment',
          details: {
            error: error.message
          },
          status: 'failure'
        })
    } catch (logError) {
      console.error('❌ Error logging webhook error:', logError)
    }

    // Return success to Asaas even on error (to prevent retries)
    // In production, implement retry logic if needed
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    )
  }
}

// Optional: Implement GET for webhook verification
export async function GET(req: NextRequest) {
  return NextResponse.json(
    { message: 'Asaas webhook endpoint' },
    { status: 200 }
  )
}

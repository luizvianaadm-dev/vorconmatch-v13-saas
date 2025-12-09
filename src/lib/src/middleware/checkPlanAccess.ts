// File: src/middleware/checkPlanAccess.ts
// VorconMatch V13 - Plan Access Control Middleware
// Validates user subscription status and enforces feature limits

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface PlanLimits {
  concurrent_files: number | 'unlimited'
  max_file_size_mb: number | 'unlimited'
  monthly_api_calls: number | 'unlimited'
  has_csv_export: boolean
  has_excel_export: boolean
  has_api_access: boolean
  has_white_label: boolean
}

const PLAN_LIMITS: Record<string, PlanLimits> = {
  trial: {
    concurrent_files: 1,
    max_file_size_mb: 5,
    monthly_api_calls: 50,
    has_csv_export: true,
    has_excel_export: false,
    has_api_access: false,
    has_white_label: false
  },
  starter: {
    concurrent_files: 1,
    max_file_size_mb: 5,
    monthly_api_calls: 100,
    has_csv_export: true,
    has_excel_export: false,
    has_api_access: false,
    has_white_label: false
  },
  pro: {
    concurrent_files: 5,
    max_file_size_mb: 50,
    monthly_api_calls: 1000,
    has_csv_export: true,
    has_excel_export: true,
    has_api_access: true,
    has_white_label: false
  },
  elite: {
    concurrent_files: 50,
    max_file_size_mb: 500,
    monthly_api_calls: 'unlimited',
    has_csv_export: true,
    has_excel_export: true,
    has_api_access: true,
    has_white_label: true
  },
  master: {
    concurrent_files: 'unlimited',
    max_file_size_mb: 'unlimited',
    monthly_api_calls: 'unlimited',
    has_csv_export: true,
    has_excel_export: true,
    has_api_access: true,
    has_white_label: true
  }
}

export async function checkPlanAccess(
  userId: string,
  feature: keyof PlanLimits,
  opts?: { incrementApiCall?: boolean }
): Promise<PlanLimits> {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('plan, status, trial_expires_at, monthly_api_calls_used')
    .eq('id', userId)
    .single()

  if (error || !profile) {
    throw new Error('Usuário não encontrado')
  }

  // Verifica status de suspensão/cancelamento
  if (profile.status === 'suspended' || profile.status === 'cancelled') {
    throw new Error(
      'Sua assinatura está inativa. Regularize o pagamento para continuar.'
    )
  }

  // Valida Trial expirado
  if (profile.plan === 'trial') {
    if (
      profile.trial_expires_at &&
      new Date() > new Date(profile.trial_expires_at)
    ) {
      await supabase
        .from('profiles')
        .update({ status: 'trial_expired' })
        .eq('id', userId)

      throw new Error(
        'Seu período trial expirou. Faça upgrade para continuar usando.'
      )
    }
  }

  const limits = PLAN_LIMITS[profile.plan] ?? PLAN_LIMITS['trial']

  // Valida limites de API calls
  if (feature === 'monthly_api_calls') {
    if (limits.monthly_api_calls !== 'unlimited') {
      if (
        profile.monthly_api_calls_used >=
        (limits.monthly_api_calls as number)
      ) {
        throw new Error('Limite mensal de uso atingido para o seu plano.')
      }

      if (opts?.incrementApiCall) {
        await supabase
          .from('profiles')
          .update({
            monthly_api_calls_used: profile.monthly_api_calls_used + 1
          })
          .eq('id', userId)
      }
    }
  }

  // Valida features booleanas
  if (typeof limits[feature] === 'boolean' && limits[feature] === false) {
    throw new Error(
      'Este recurso não está disponível no seu plano atual.'
    )
  }

  return limits
}

export function isMasterUser(email: string): boolean {
  return email.endsWith('@vorcon.com.br')
}

-- VorconMatch V13: Estrutura de Banco de Dados - Supabase
-- Tabelas: profiles, pricing_plans, payments, audit_logs
-- Triggers: handle_new_user (auto assign Master para @vorcon.com.br)

-- ========== 1. TABELA PROFILES ==========
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  company_name TEXT,
  cnpj TEXT UNIQUE,
  cpf TEXT UNIQUE,
  phone TEXT,
  
  -- Plano e Status
  plan TEXT DEFAULT 'trial' CHECK (plan IN ('trial', 'starter', 'pro', 'elite', 'master')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'cancelled', 'trial_expired')),
  
  -- Limites por Plano
  concurrent_files INTEGER DEFAULT 1,
  max_file_size_mb INTEGER DEFAULT 5,
  monthly_api_calls INTEGER DEFAULT 100,
  monthly_api_calls_used INTEGER DEFAULT 0,
  
  -- Integração Asaas
  asaas_customer_id TEXT UNIQUE,
  asaas_subscription_id TEXT,
  asaas_payment_id TEXT,
  
  -- Datas
  trial_start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  trial_expires_at TIMESTAMP WITH TIME ZONE,
  subscription_started_at TIMESTAMP WITH TIME ZONE,
  subscription_renews_at TIMESTAMP WITH TIME ZONE,
  last_payment_date TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

CREATE INDEX idx_profiles_plan ON public.profiles(plan);
CREATE INDEX idx_profiles_status ON public.profiles(status);
CREATE INDEX idx_profiles_asaas_customer_id ON public.profiles(asaas_customer_id);
CREATE INDEX idx_profiles_trial_expires ON public.profiles(trial_expires_at);

-- ========== 2. TABELA PRICING_PLANS ==========
CREATE TABLE IF NOT EXISTS public.pricing_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price_monthly_brl DECIMAL(10, 2),
  price_annual_brl DECIMAL(10, 2),
  
  -- Limites
  max_concurrent_files INTEGER,
  max_file_size_mb INTEGER,
  max_users INTEGER,
  monthly_api_calls INTEGER,
  
  -- Features
  has_csv_export BOOLEAN DEFAULT TRUE,
  has_excel_export BOOLEAN DEFAULT FALSE,
  has_api_access BOOLEAN DEFAULT FALSE,
  has_white_label BOOLEAN DEFAULT FALSE,
  has_priority_support BOOLEAN DEFAULT FALSE,
  
  features JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO public.pricing_plans VALUES
('trial', 'Trial', 'Período de teste 7 dias', NULL, NULL, 1, 5, 1, 50, TRUE, FALSE, FALSE, FALSE, FALSE, '{"includes": ["CSV Export", "5MB max file"], "support": "community"}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.pricing_plans VALUES
('starter', 'Starter', 'Para auditores independentes', 29.00, 290.00, 1, 5, 1, 100, TRUE, FALSE, FALSE, FALSE, FALSE, '{"includes": ["CSV Export", "5MB max file"], "support": "email"}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.pricing_plans VALUES
('pro', 'Profissional', 'Para pequenas firmas de auditoria', 99.00, 990.00, 5, 50, 5, 1000, TRUE, TRUE, TRUE, FALSE, TRUE, '{"includes": ["CSV + Excel Export", "50MB max file", "Email support"], "support": "email"}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.pricing_plans VALUES
('elite', 'Elite', 'Para grandes firmas e consultores', 299.00, 2990.00, 50, 500, 50, 10000, TRUE, TRUE, TRUE, FALSE, TRUE, '{"includes": ["Full API Access", "500MB max file", "Email + Phone support"], "support": "phone"}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.pricing_plans VALUES
('master', 'Master (Vorcon)', 'Acesso total sem limites', NULL, NULL, NULL, NULL, NULL, NULL, TRUE, TRUE, TRUE, TRUE, TRUE, '{"includes": ["White Label", "Unlimited Everything", "Dedicated Support"], "support": "dedicated"}')
ON CONFLICT (id) DO NOTHING;

-- ========== 3. TABELA PAYMENTS ==========
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  asaas_payment_id TEXT UNIQUE,
  status TEXT CHECK (status IN ('pending', 'paid', 'failed', 'cancelled', 'refunded')),
  
  plan TEXT,
  amount_brl DECIMAL(10, 2),
  due_date DATE,
  paid_date DATE,
  payment_method TEXT CHECK (payment_method IN ('pix', 'boleto', 'credit_card')),
  
  pix_qr_code TEXT,
  pix_copy_paste TEXT,
  boleto_barcode TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own payments" ON public.payments FOR SELECT USING (user_id = auth.uid());

CREATE INDEX idx_payments_user_id ON public.payments(user_id);
CREATE INDEX idx_payments_status ON public.payments(status);
CREATE INDEX idx_payments_asaas_payment_id ON public.payments(asaas_payment_id);

-- ========== 4. TABELA AUDIT_LOGS ==========
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  
  action TEXT,
  resource TEXT,
  details JSONB,
  status TEXT CHECK (status IN ('success', 'failure')),
  
  ip_address INET,
  user_agent TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at);

-- ========== 5. TRIGGER: HANDLE_NEW_USER ==========
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    plan,
    status,
    trial_expires_at,
    created_at,
    updated_at
  ) VALUES (
    new.id,
    new.email,
    CASE 
      WHEN new.email ILIKE '%@vorcon.com.br' THEN 'master'
      ELSE 'trial'
    END,
    'active',
    CASE 
      WHEN new.email ILIKE '%@vorcon.com.br' THEN NULL
      ELSE NOW() + INTERVAL '7 days'
    END,
    NOW(),
    NOW()
  );
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_user();

-- ========== 6. FUNÇÃO: ACTIVATE_USER_SUBSCRIPTION ==========
CREATE OR REPLACE FUNCTION public.activate_user_subscription(payment_id TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_plan text;
  v_next_due_date date;
BEGIN
  SELECT user_id, plan, due_date
  INTO v_user_id, v_plan, v_next_due_date
  FROM public.payments
  WHERE asaas_payment_id = payment_id
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'Pagamento não encontrado para payment_id %', payment_id;
    RETURN;
  END IF;

  UPDATE public.profiles
  SET
    status = 'active',
    plan = v_plan,
    subscription_started_at = NOW(),
    subscription_renews_at = v_next_due_date,
    last_payment_date = NOW(),
    updated_at = NOW()
  WHERE id = v_user_id;

  RAISE NOTICE 'Assinatura ativada para usuário: %', v_user_id;
END;
$$;

-- ========== 7. FUNÇÃO: RESET_MONTHLY_API_CALLS ==========
CREATE OR REPLACE FUNCTION public.reset_monthly_api_calls()
RETURNS TABLE(user_id uuid, plan text, calls_reset integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.profiles
  SET monthly_api_calls_used = 0,
      updated_at = NOW()
  WHERE plan != 'master' AND status = 'active'
  RETURNING id, plan, monthly_api_calls_used;
END;
$$;

-- ========== 8. GRANT PERMISSIONS ==========
GRANT ALL ON public.profiles TO authenticated;
GRANT ALL ON public.pricing_plans TO authenticated;
GRANT ALL ON public.payments TO authenticated;
GRANT ALL ON public.audit_logs TO authenticated;
GRANT EXECUTE ON FUNCTION public.activate_user_subscription TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_monthly_api_calls TO authenticated;

-- ========== FIM DO SCRIPT ==========

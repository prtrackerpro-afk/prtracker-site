/// <reference path="../.astro/types.d.ts" />

interface ImportMetaEnv {
  readonly MP_ACCESS_TOKEN?: string;
  readonly MP_PUBLIC_KEY?: string;
  readonly PUBLIC_SITE_URL?: string;
  readonly SUPABASE_URL?: string;
  readonly SUPABASE_ANON_KEY?: string;
  readonly SUPABASE_SERVICE_ROLE_KEY?: string;
  readonly ADMIN_EMAILS?: string;
  readonly META_ACCESS_TOKEN?: string;
  readonly META_AD_ACCOUNT_ID?: string;
  readonly META_API_VERSION?: string;
  readonly WINDSOR_API_KEY?: string;
  readonly RESEND_API_KEY?: string;
  readonly ALERT_EMAIL_FROM?: string;
  readonly ALERT_EMAIL_TO?: string;
  readonly CRON_SECRET?: string;
  // Bling ERP (OAuth2 Authorization Code flow + sales order sync)
  readonly BLING_CLIENT_ID?: string;
  readonly BLING_CLIENT_SECRET?: string;
  readonly BLING_REDIRECT_URI?: string;
  readonly BLING_LOJA_ID?: string;
  readonly BLING_DEPOSITO_ID?: string;
  readonly BLING_NATUREZA_OPERACAO_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare namespace App {
  interface Locals {
    admin?: { email: string; userId: string };
  }
}

interface Window {
  PRConfigurator?: {
    build: (container: HTMLElement, opts: unknown) => void;
  };
  PRCart?: {
    add: (item: unknown) => void;
    open: () => void;
    close: () => void;
    count: () => number;
  };
}

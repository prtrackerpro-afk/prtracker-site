/// <reference path="../.astro/types.d.ts" />

interface ImportMetaEnv {
  readonly MP_ACCESS_TOKEN?: string;
  readonly MP_PUBLIC_KEY?: string;
  readonly PUBLIC_SITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
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

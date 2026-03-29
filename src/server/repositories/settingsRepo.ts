import type { Pool, PoolClient } from 'pg';

type DbClient = Pool | PoolClient;

export interface AppSettingsRow {
  aiSummaryEnabled: boolean;
  aiTranslateEnabled: boolean;
  aiAutoSummarize: boolean;
  aiModel: string;
  aiApiBaseUrl: string;
  rssUserAgent: string;
  rssTimeoutMs: number;
}

export interface AuthSettingsRow {
  authPasswordHash: string;
  authSessionSecret: string;
}

export async function getUiSettings(pool: DbClient): Promise<unknown> {
  const { rows } = await pool.query<{ uiSettings: unknown }>(`
    select ui_settings as "uiSettings"
    from app_settings
    where id = 1
  `);
  return rows[0]?.uiSettings ?? {};
}

export async function updateUiSettings(pool: DbClient, uiSettings: unknown): Promise<unknown> {
  const { rows } = await pool.query<{ uiSettings: unknown }>(
    `
      update app_settings
      set
        ui_settings = $1,
        updated_at = now()
      where id = 1
      returning ui_settings as "uiSettings"
    `,
    [uiSettings],
  );
  return rows[0]?.uiSettings ?? uiSettings;
}

export async function getAiApiKey(pool: Pool): Promise<string> {
  const { rows } = await pool.query<{ aiApiKey: string }>(`
    select ai_api_key as "aiApiKey"
    from app_settings
    where id = 1
  `);
  return rows[0]?.aiApiKey ?? '';
}

export async function setAiApiKey(pool: Pool, apiKey: string): Promise<string> {
  const { rows } = await pool.query<{ aiApiKey: string }>(
    `
      update app_settings
      set
        ai_api_key = $1,
        updated_at = now()
      where id = 1
      returning ai_api_key as "aiApiKey"
    `,
    [apiKey],
  );
  return rows[0]?.aiApiKey ?? apiKey;
}

export async function clearAiApiKey(pool: Pool): Promise<string> {
  return setAiApiKey(pool, '');
}

export async function getTranslationApiKey(pool: Pool): Promise<string> {
  const { rows } = await pool.query<{ translationApiKey: string }>(`
    select translation_api_key as "translationApiKey"
    from app_settings
    where id = 1
  `);
  return rows[0]?.translationApiKey ?? '';
}

export async function setTranslationApiKey(pool: Pool, apiKey: string): Promise<string> {
  const { rows } = await pool.query<{ translationApiKey: string }>(
    `
      update app_settings
      set
        translation_api_key = $1,
        updated_at = now()
      where id = 1
      returning translation_api_key as "translationApiKey"
    `,
    [apiKey],
  );
  return rows[0]?.translationApiKey ?? apiKey;
}

export async function clearTranslationApiKey(pool: Pool): Promise<string> {
  return setTranslationApiKey(pool, '');
}

export async function getAuthSettings(pool: DbClient): Promise<AuthSettingsRow> {
  const { rows } = await pool.query<AuthSettingsRow>(`
    select
      auth_password_hash as "authPasswordHash",
      auth_session_secret as "authSessionSecret"
    from app_settings
    where id = 1
  `);

  return rows[0] ?? {
    authPasswordHash: '',
    authSessionSecret: '',
  };
}

export async function updateAuthPassword(
  pool: DbClient,
  authPasswordHash: string,
): Promise<AuthSettingsRow> {
  const { rows } = await pool.query<AuthSettingsRow>(
    `
      update app_settings
      set
        auth_password_hash = $1,
        auth_session_secret = encode(gen_random_bytes(32), 'hex'),
        updated_at = now()
      where id = 1
      returning
        auth_password_hash as "authPasswordHash",
        auth_session_secret as "authSessionSecret"
    `,
    [authPasswordHash],
  );

  return rows[0] ?? {
    authPasswordHash,
    authSessionSecret: '',
  };
}

export async function getAppSettings(pool: Pool): Promise<AppSettingsRow> {
  const { rows } = await pool.query<AppSettingsRow>(`
    select
      ai_summary_enabled as "aiSummaryEnabled",
      ai_translate_enabled as "aiTranslateEnabled",
      ai_auto_summarize as "aiAutoSummarize",
      ai_model as "aiModel",
      ai_api_base_url as "aiApiBaseUrl",
      rss_user_agent as "rssUserAgent",
      rss_timeout_ms as "rssTimeoutMs"
    from app_settings
    where id = 1
  `);
  return rows[0];
}

export async function updateAppSettings(
  pool: Pool,
  input: Partial<AppSettingsRow>,
): Promise<AppSettingsRow> {
  const fields: string[] = [];
  const values: Array<string | boolean | number> = [];
  let paramIndex = 1;

  if (typeof input.aiSummaryEnabled !== 'undefined') {
    fields.push(`ai_summary_enabled = $${paramIndex++}`);
    values.push(input.aiSummaryEnabled);
  }
  if (typeof input.aiTranslateEnabled !== 'undefined') {
    fields.push(`ai_translate_enabled = $${paramIndex++}`);
    values.push(input.aiTranslateEnabled);
  }
  if (typeof input.aiAutoSummarize !== 'undefined') {
    fields.push(`ai_auto_summarize = $${paramIndex++}`);
    values.push(input.aiAutoSummarize);
  }
  if (typeof input.aiModel !== 'undefined') {
    fields.push(`ai_model = $${paramIndex++}`);
    values.push(input.aiModel);
  }
  if (typeof input.aiApiBaseUrl !== 'undefined') {
    fields.push(`ai_api_base_url = $${paramIndex++}`);
    values.push(input.aiApiBaseUrl);
  }
  if (typeof input.rssUserAgent !== 'undefined') {
    fields.push(`rss_user_agent = $${paramIndex++}`);
    values.push(input.rssUserAgent);
  }
  if (typeof input.rssTimeoutMs !== 'undefined') {
    fields.push(`rss_timeout_ms = $${paramIndex++}`);
    values.push(input.rssTimeoutMs);
  }

  if (fields.length === 0) {
    return getAppSettings(pool);
  }

  const { rows } = await pool.query<AppSettingsRow>(
    `
      update app_settings
      set
        ${fields.join(', ')},
        updated_at = now()
      where id = 1
      returning
        ai_summary_enabled as "aiSummaryEnabled",
        ai_translate_enabled as "aiTranslateEnabled",
        ai_auto_summarize as "aiAutoSummarize",
        ai_model as "aiModel",
        ai_api_base_url as "aiApiBaseUrl",
        rss_user_agent as "rssUserAgent",
        rss_timeout_ms as "rssTimeoutMs"
    `,
    values,
  );
  return rows[0];
}

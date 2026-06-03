import { readNumber, readString, type RawEnvironment } from '@promotor/config';

export const validateEnv = (environment: RawEnvironment) => ({
  NODE_ENV: readString(environment, 'NODE_ENV', 'development'),
  PORT: readNumber(environment, 'PORT', 3333),
  DATABASE_URL: readString(
    environment,
    'DATABASE_URL',
    'postgresql://postgres:postgres@localhost:5432/promotor_dev?schema=public',
  ),
  JWT_ACCESS_SECRET: readString(
    environment,
    'JWT_ACCESS_SECRET',
    'dev-access-secret',
  ),
  JWT_REFRESH_SECRET: readString(
    environment,
    'JWT_REFRESH_SECRET',
    'dev-refresh-secret',
  ),
  JWT_ACCESS_EXPIRES_IN_SECONDS: readNumber(
    environment,
    'JWT_ACCESS_EXPIRES_IN_SECONDS',
    900,
  ),
  JWT_REFRESH_EXPIRES_IN_SECONDS: readNumber(
    environment,
    'JWT_REFRESH_EXPIRES_IN_SECONDS',
    2_592_000,
  ),
  AUTH_RATE_LIMIT_WINDOW_MS: readNumber(
    environment,
    'AUTH_RATE_LIMIT_WINDOW_MS',
    60_000,
  ),
  AUTH_RATE_LIMIT_MAX_ATTEMPTS: readNumber(
    environment,
    'AUTH_RATE_LIMIT_MAX_ATTEMPTS',
    5,
  ),
  CUSTOMER_IMPORT_JOB_POLL_INTERVAL_MS: readNumber(
    environment,
    'CUSTOMER_IMPORT_JOB_POLL_INTERVAL_MS',
    2_000,
  ),
  CUSTOMER_IMPORT_JOB_MAX_ATTEMPTS: readNumber(
    environment,
    'CUSTOMER_IMPORT_JOB_MAX_ATTEMPTS',
    3,
  ),
  CUSTOMER_IMPORT_JOB_RETRY_DELAY_MS: readNumber(
    environment,
    'CUSTOMER_IMPORT_JOB_RETRY_DELAY_MS',
    10_000,
  ),
  WINTHOR_ORACLE_ENABLED: readString(
    environment,
    'WINTHOR_ORACLE_ENABLED',
    'false',
  ),
  WINTHOR_ORACLE_MODE: readString(environment, 'WINTHOR_ORACLE_MODE', 'thin'),
  WINTHOR_ORACLE_CLIENT_LIB_DIR: readString(
    environment,
    'WINTHOR_ORACLE_CLIENT_LIB_DIR',
    '',
  ),
  WINTHOR_ORACLE_CONNECT_STRING: readString(
    environment,
    'WINTHOR_ORACLE_CONNECT_STRING',
    '',
  ),
  WINTHOR_ORACLE_USER: readString(environment, 'WINTHOR_ORACLE_USER', ''),
  WINTHOR_ORACLE_PASSWORD: readString(
    environment,
    'WINTHOR_ORACLE_PASSWORD',
    '',
  ),
  WINTHOR_ORACLE_POOL_MIN: readNumber(
    environment,
    'WINTHOR_ORACLE_POOL_MIN',
    0,
  ),
  WINTHOR_ORACLE_POOL_MAX: readNumber(
    environment,
    'WINTHOR_ORACLE_POOL_MAX',
    4,
  ),
  WINTHOR_ORACLE_POOL_INCREMENT: readNumber(
    environment,
    'WINTHOR_ORACLE_POOL_INCREMENT',
    1,
  ),
  WINTHOR_ORACLE_POOL_TIMEOUT_SECONDS: readNumber(
    environment,
    'WINTHOR_ORACLE_POOL_TIMEOUT_SECONDS',
    60,
  ),
  WINTHOR_ORACLE_QUEUE_TIMEOUT_MS: readNumber(
    environment,
    'WINTHOR_ORACLE_QUEUE_TIMEOUT_MS',
    5_000,
  ),
  WINTHOR_ORACLE_STATEMENT_TIMEOUT_MS: readNumber(
    environment,
    'WINTHOR_ORACLE_STATEMENT_TIMEOUT_MS',
    15_000,
  ),
  WINTHOR_ORACLE_STATEMENT_CACHE_SIZE: readNumber(
    environment,
    'WINTHOR_ORACLE_STATEMENT_CACHE_SIZE',
    30,
  ),
  WINTHOR_ORACLE_FETCH_ARRAY_SIZE: readNumber(
    environment,
    'WINTHOR_ORACLE_FETCH_ARRAY_SIZE',
    200,
  ),
  WINTHOR_ORACLE_CUSTOMERS_QUERY: readString(
    environment,
    'WINTHOR_ORACLE_CUSTOMERS_QUERY',
    '',
  ),
  STORAGE_DRIVER: readString(environment, 'STORAGE_DRIVER', 'local'),
  STORAGE_BUCKET: readString(environment, 'STORAGE_BUCKET', 'promotor-dev'),
  STORAGE_REGION: readString(environment, 'STORAGE_REGION', 'us-east-1'),
  STORAGE_ENDPOINT: readString(environment, 'STORAGE_ENDPOINT', ''),
  STORAGE_ACCESS_KEY: readString(environment, 'STORAGE_ACCESS_KEY', ''),
  STORAGE_SECRET_KEY: readString(environment, 'STORAGE_SECRET_KEY', ''),
  STORAGE_PUBLIC_BASE_URL: readString(
    environment,
    'STORAGE_PUBLIC_BASE_URL',
    '',
  ),
});

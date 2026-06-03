import { createRequire } from 'node:module';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

interface OracleConnectionLike {
  callTimeout?: number;
  execute<T extends Record<string, unknown>>(
    sql: string,
    binds?: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<{ rows?: T[] | null }>;
  close(): Promise<void>;
}

interface OraclePoolLike {
  getConnection(): Promise<OracleConnectionLike>;
  close(force?: number): Promise<void>;
}

interface OracleModuleLike {
  OUT_FORMAT_OBJECT: number;
  initOracleClient?(options?: { libDir?: string }): void;
  createPool(options: Record<string, unknown>): Promise<OraclePoolLike>;
}

export interface OracleReadonlyQueryResult<T extends Record<string, unknown>> {
  rows: T[];
  unavailableReason?: string;
  retryable?: boolean;
}

@Injectable()
export class OracleReadonlyService implements OnModuleDestroy {
  private readonly logger = new Logger(OracleReadonlyService.name);
  private readonly runtimeRequire = createRequire(__filename);
  private poolPromise: Promise<OraclePoolLike> | null = null;
  private clientInitialized = false;
  private driverUnavailableReason: string | null = null;

  async onModuleDestroy() {
    if (!this.poolPromise) {
      return;
    }

    try {
      const pool = await this.poolPromise;
      await pool.close(0);
    } catch (error) {
      this.logger.warn(
        `Falha ao encerrar pool Oracle somente leitura: ${
          error instanceof Error ? error.message : 'erro desconhecido'
        }`,
      );
    } finally {
      this.poolPromise = null;
    }
  }

  isEnabled() {
    return this.readFlag('WINTHOR_ORACLE_ENABLED');
  }

  hasConnectionConfig() {
    return Boolean(
      process.env.WINTHOR_ORACLE_CONNECT_STRING &&
      process.env.WINTHOR_ORACLE_USER &&
      process.env.WINTHOR_ORACLE_PASSWORD,
    );
  }

  async executeReadOnlyQuery<T extends Record<string, unknown>>(
    sql: string,
    binds: Record<string, unknown> = {},
  ): Promise<OracleReadonlyQueryResult<T>> {
    if (!this.isEnabled()) {
      return {
        rows: [],
        unavailableReason:
          'Integracao Oracle/Winthor desabilitada por ambiente. A base local continua operacional.',
        retryable: false,
      };
    }

    if (!this.hasConnectionConfig()) {
      return {
        rows: [],
        unavailableReason:
          'Credenciais ou connect string do Oracle somente leitura ainda nao foram configurados.',
        retryable: false,
      };
    }

    if (!/^\s*select\b/i.test(sql)) {
      return {
        rows: [],
        unavailableReason:
          'Consulta Oracle rejeitada: apenas comandos SELECT sao permitidos no adaptador somente leitura.',
        retryable: false,
      };
    }

    const oracle = this.loadDriver();

    if (!oracle) {
      return {
        rows: [],
        unavailableReason:
          this.driverUnavailableReason ??
          'Driver oracledb indisponivel no ambiente atual.',
        retryable: false,
      };
    }

    let connection: OracleConnectionLike | null = null;

    try {
      const pool = await this.getPool(oracle);
      connection = await pool.getConnection();

      if (typeof connection.callTimeout === 'number') {
        connection.callTimeout = this.readNumber(
          'WINTHOR_ORACLE_STATEMENT_TIMEOUT_MS',
          15_000,
        );
      }

      const result = await connection.execute<T>(sql, binds, {
        outFormat: oracle.OUT_FORMAT_OBJECT,
        fetchArraySize: this.readNumber('WINTHOR_ORACLE_FETCH_ARRAY_SIZE', 200),
      });

      return {
        rows: Array.isArray(result.rows) ? result.rows : [],
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Falha desconhecida na leitura Oracle';

      this.logger.error(
        `Falha em consulta Oracle somente leitura: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );

      return {
        rows: [],
        unavailableReason: `Falha na leitura Oracle somente leitura: ${message}`,
        retryable: true,
      };
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (closeError) {
          this.logger.warn(
            `Falha ao devolver conexao Oracle ao pool: ${
              closeError instanceof Error
                ? closeError.message
                : 'erro desconhecido'
            }`,
          );
        }
      }
    }
  }

  private loadDriver() {
    if (this.driverUnavailableReason) {
      return null;
    }

    try {
      return this.runtimeRequire('oracledb') as OracleModuleLike;
    } catch (error) {
      this.driverUnavailableReason =
        error instanceof Error
          ? `Pacote oracledb nao encontrado: ${error.message}`
          : 'Pacote oracledb nao encontrado.';
      return null;
    }
  }

  private async getPool(oracle: OracleModuleLike) {
    if (!this.poolPromise) {
      this.poolPromise = this.createPool(oracle);
    }

    return this.poolPromise;
  }

  private async createPool(oracle: OracleModuleLike) {
    this.initClientIfNeeded(oracle);

    return oracle.createPool({
      connectString: process.env.WINTHOR_ORACLE_CONNECT_STRING,
      user: process.env.WINTHOR_ORACLE_USER,
      password: process.env.WINTHOR_ORACLE_PASSWORD,
      poolMin: this.readNumber('WINTHOR_ORACLE_POOL_MIN', 0),
      poolMax: this.readNumber('WINTHOR_ORACLE_POOL_MAX', 4),
      poolIncrement: this.readNumber('WINTHOR_ORACLE_POOL_INCREMENT', 1),
      poolTimeout: this.readNumber('WINTHOR_ORACLE_POOL_TIMEOUT_SECONDS', 60),
      queueTimeout: this.readNumber('WINTHOR_ORACLE_QUEUE_TIMEOUT_MS', 5_000),
      stmtCacheSize: this.readNumber('WINTHOR_ORACLE_STATEMENT_CACHE_SIZE', 30),
    });
  }

  private initClientIfNeeded(oracle: OracleModuleLike) {
    if (this.clientInitialized || !oracle.initOracleClient) {
      return;
    }

    if (process.env.WINTHOR_ORACLE_MODE?.toLowerCase() !== 'thick') {
      this.clientInitialized = true;
      return;
    }

    oracle.initOracleClient({
      libDir: process.env.WINTHOR_ORACLE_CLIENT_LIB_DIR || undefined,
    });
    this.clientInitialized = true;
  }

  private readFlag(key: string) {
    return process.env[key]?.trim().toLowerCase() === 'true';
  }

  private readNumber(key: string, fallback: number) {
    const value = process.env[key];

    if (!value) {
      return fallback;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
}

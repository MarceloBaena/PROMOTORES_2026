import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { CustomersService } from './customers.service';

@Injectable()
export class CustomersImportProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CustomersImportProcessor.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly customersService: CustomersService) {}

  onModuleInit() {
    const intervalMs = this.readNumber(
      'CUSTOMER_IMPORT_JOB_POLL_INTERVAL_MS',
      2_000,
    );

    this.timer = setInterval(() => {
      void this.drainQueue();
    }, intervalMs);

    void this.drainQueue();
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async drainQueue() {
    if (this.running) {
      return;
    }

    this.running = true;

    try {
      while (await this.customersService.processNextPendingImportBatch()) {
        this.logger.debug(
          'Lote de importacao de clientes processado pelo worker',
        );
      }
    } catch (error) {
      this.logger.error(
        'Falha inesperada ao drenar fila de importacao de clientes',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.running = false;
    }
  }

  private readNumber(key: string, fallback: number) {
    const raw = process.env[key];
    const parsed = raw ? Number(raw) : Number.NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}

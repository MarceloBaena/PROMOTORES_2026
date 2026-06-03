import { Module } from '@nestjs/common';
import { CustomersController } from './customers.controller';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CustomersImportProcessor } from './customers-import.processor';
import { OracleReadonlyService } from './oracle-readonly.service';
import { CustomersService } from './customers.service';
import {
  OracleWinthorAdapter,
  WINTHOR_CUSTOMER_GATEWAY,
} from './winthor-customer.gateway';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [CustomersController],
  providers: [
    CustomersService,
    CustomersImportProcessor,
    OracleReadonlyService,
    {
      provide: WINTHOR_CUSTOMER_GATEWAY,
      useClass: OracleWinthorAdapter,
    },
  ],
  exports: [CustomersService],
})
export class CustomersModule {}

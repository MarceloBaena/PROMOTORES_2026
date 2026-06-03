import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CustomerStatus, UserRole } from '@prisma/client';
import type { Express } from 'express';
import { extname } from 'node:path';
import type { AuthenticatedUser } from '../common/authenticated-user';
import { CurrentUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import {
  ImportCustomersCsvDto,
  ImportCustomersWinthorDto,
  ListCustomerImportBatchesQueryDto,
  ListCustomerImportBatchItemsQueryDto,
  ListCustomersQueryDto,
  UpdateCustomerStatusDto,
  UpsertCustomerDto,
} from './customers.dto';
import { CustomersService } from './customers.service';

const MAX_CUSTOMER_IMPORT_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const allowedCustomerImportExtensions = new Set(['.csv', '.txt']);

@Controller('customers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @Roles(UserRole.SUPERVISOR, UserRole.ADMIN)
  listCustomers(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListCustomersQueryDto,
  ) {
    return this.customersService.listCustomers(user.userId, query);
  }

  @Get('import/batches')
  @Roles(UserRole.SUPERVISOR, UserRole.ADMIN)
  listImportBatches(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListCustomerImportBatchesQueryDto,
  ) {
    return this.customersService.listImportBatches(user.userId, query);
  }

  @Get('import/batches/:id')
  @Roles(UserRole.SUPERVISOR, UserRole.ADMIN)
  getImportBatch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.customersService.getImportBatch(user.userId, id);
  }

  @Get('import/batches/:id/items')
  @Roles(UserRole.SUPERVISOR, UserRole.ADMIN)
  listImportBatchItems(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: ListCustomerImportBatchItemsQueryDto,
  ) {
    return this.customersService.listImportBatchItems(user.userId, id, query);
  }

  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: MAX_CUSTOMER_IMPORT_FILE_SIZE_BYTES,
      },
    }),
  )
  @Post('import/csv')
  @Roles(UserRole.SUPERVISOR, UserRole.ADMIN)
  importCsv(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: ImportCustomersCsvDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Arquivo CSV obrigatorio');
    }

    const extension = extname(file.originalname ?? '').toLowerCase();

    if (!allowedCustomerImportExtensions.has(extension)) {
      throw new BadRequestException(
        'Arquivo invalido. Envie um CSV com extensao .csv ou .txt.',
      );
    }

    if (!file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('Arquivo CSV vazio');
    }

    return this.customersService.importCustomersFromCsv(
      user.userId,
      body,
      file,
    );
  }

  @Post('import/winthor')
  @Roles(UserRole.SUPERVISOR, UserRole.ADMIN)
  importWinthor(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: ImportCustomersWinthorDto,
  ) {
    return this.customersService.importCustomersFromWinthor(user.userId, body);
  }

  @Post('sync/winthor')
  @Roles(UserRole.SUPERVISOR, UserRole.ADMIN)
  syncWinthor(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: ImportCustomersWinthorDto,
  ) {
    return this.customersService.syncCustomersFromWinthor(user.userId, body);
  }

  @Get(':id')
  @Roles(UserRole.SUPERVISOR, UserRole.ADMIN)
  getCustomer(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.customersService.getCustomerDetails(user.userId, id);
  }

  @Post()
  @Roles(UserRole.SUPERVISOR, UserRole.ADMIN)
  createCustomer(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: UpsertCustomerDto,
  ) {
    return this.customersService.createCustomer(user.userId, body);
  }

  @Put(':id')
  @Roles(UserRole.SUPERVISOR, UserRole.ADMIN)
  updateCustomer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: UpsertCustomerDto,
  ) {
    return this.customersService.updateCustomer(user.userId, id, body);
  }

  @Patch(':id/status')
  @Roles(UserRole.SUPERVISOR, UserRole.ADMIN)
  updateCustomerStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: UpdateCustomerStatusDto,
  ) {
    return this.customersService.updateCustomerStatus(
      user.userId,
      id,
      body.status,
    );
  }

  @Patch('activate-all-inactive')
  @Roles(UserRole.SUPERVISOR, UserRole.ADMIN)
  activateAllInactiveCustomers(@CurrentUser() user: AuthenticatedUser) {
    return this.customersService.activateAllInactiveCustomers(user.userId);
  }

  @Delete(':id')
  @Roles(UserRole.SUPERVISOR, UserRole.ADMIN)
  archiveCustomer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.customersService.updateCustomerStatus(
      user.userId,
      id,
      CustomerStatus.INACTIVE,
    );
  }
}

import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { extname, join, posix } from 'node:path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { extension as mimeExtension } from 'mime-types';

interface SaveFileInput {
  buffer: Buffer;
  mimeType: string;
  originalName: string;
  folder: string;
}

export interface StoredFile {
  key: string;
  publicUrl: string;
  sizeInBytes: number;
}

@Injectable()
export class StorageService {
  private readonly uploadsRoot = join(process.cwd(), 'uploads');

  constructor(private readonly configService: ConfigService) {}

  async saveFile(input: SaveFileInput): Promise<StoredFile> {
    const driver = this.configService.get<string>('STORAGE_DRIVER', 'local');

    if (driver === 's3') {
      return this.saveToS3(input);
    }

    return this.saveToLocal(input);
  }

  async deleteFile(key: string) {
    const driver = this.configService.get<string>('STORAGE_DRIVER', 'local');

    if (driver === 's3') {
      await this.deleteFromS3(key);
      return;
    }

    await this.deleteFromLocal(key);
  }

  private buildFileName(mimeType: string, originalName: string) {
    const detectedExtension =
      mimeExtension(mimeType) ?? extname(originalName).replace('.', '');
    const extension = detectedExtension || 'bin';
    return `${Date.now()}-${randomUUID()}.${extension}`;
  }

  private async saveToLocal(input: SaveFileInput): Promise<StoredFile> {
    const fileName = this.buildFileName(input.mimeType, input.originalName);
    const directory = join(this.uploadsRoot, input.folder);
    const key = posix.join(input.folder, fileName);
    const target = join(directory, fileName);

    await mkdir(directory, { recursive: true });
    await writeFile(target, input.buffer);

    return {
      key,
      publicUrl: `/uploads/${key}`,
      sizeInBytes: input.buffer.byteLength,
    };
  }

  private async saveToS3(input: SaveFileInput): Promise<StoredFile> {
    const bucket = this.configService.get<string>(
      'STORAGE_BUCKET',
      'promotor-dev',
    );
    const endpoint = this.configService.get<string>('STORAGE_ENDPOINT', '');
    const publicBaseUrl = this.configService.get<string>(
      'STORAGE_PUBLIC_BASE_URL',
      endpoint,
    );
    const region = this.configService.get<string>(
      'STORAGE_REGION',
      'us-east-1',
    );
    const accessKeyId = this.configService.get<string>(
      'STORAGE_ACCESS_KEY',
      '',
    );
    const secretAccessKey = this.configService.get<string>(
      'STORAGE_SECRET_KEY',
      '',
    );
    const fileName = this.buildFileName(input.mimeType, input.originalName);
    const key = posix.join(input.folder, fileName);
    const client = this.createS3Client(
      region,
      endpoint,
      accessKeyId,
      secretAccessKey,
    );

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: input.buffer,
        ContentType: input.mimeType,
      }),
    );

    return {
      key,
      publicUrl: publicBaseUrl
        ? `${publicBaseUrl.replace(/\/$/, '')}/${bucket}/${key}`
        : key,
      sizeInBytes: input.buffer.byteLength,
    };
  }

  private async deleteFromLocal(key: string) {
    const target = join(this.uploadsRoot, ...key.split('/'));

    try {
      await unlink(target);
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !('code' in error) ||
        error.code !== 'ENOENT'
      ) {
        throw error;
      }
    }
  }

  private async deleteFromS3(key: string) {
    const bucket = this.configService.get<string>(
      'STORAGE_BUCKET',
      'promotor-dev',
    );
    const endpoint = this.configService.get<string>('STORAGE_ENDPOINT', '');
    const region = this.configService.get<string>(
      'STORAGE_REGION',
      'us-east-1',
    );
    const accessKeyId = this.configService.get<string>(
      'STORAGE_ACCESS_KEY',
      '',
    );
    const secretAccessKey = this.configService.get<string>(
      'STORAGE_SECRET_KEY',
      '',
    );
    const client = this.createS3Client(
      region,
      endpoint,
      accessKeyId,
      secretAccessKey,
    );

    await client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );
  }

  private createS3Client(
    region: string,
    endpoint: string,
    accessKeyId: string,
    secretAccessKey: string,
  ) {
    return new S3Client({
      region,
      endpoint: endpoint || undefined,
      forcePathStyle: true,
      credentials:
        accessKeyId && secretAccessKey
          ? {
              accessKeyId,
              secretAccessKey,
            }
          : undefined,
    });
  }
}

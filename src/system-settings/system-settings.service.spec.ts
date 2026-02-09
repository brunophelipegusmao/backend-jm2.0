import { Test, TestingModule } from '@nestjs/testing';
import { SystemSettingsService } from './system-settings.service';
import { DatabaseService } from '../db/database.service';
import { ConfigService } from '@nestjs/config';
import { CloudinaryService } from '../common/services/cloudinary.service';

const databaseMock = {
  select: jest.fn(() => databaseMock),
  from: jest.fn(() => databaseMock),
  limit: jest.fn(() => databaseMock),
  insert: jest.fn(() => databaseMock),
  values: jest.fn(() => databaseMock),
  returning: jest.fn(async () => [
    {
      id: '1',
      maintenanceMode: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]),
  update: jest.fn(() => databaseMock),
  set: jest.fn(() => databaseMock),
  where: jest.fn(() => databaseMock),
};

describe('SystemSettingsService', () => {
  let service: SystemSettingsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SystemSettingsService,
        { provide: DatabaseService, useValue: { database: databaseMock } },
        { provide: ConfigService, useValue: { get: () => 'test-cloud-name' } },
        {
          provide: CloudinaryService,
          useValue: { uploadImage: jest.fn(), deleteImage: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<SystemSettingsService>(SystemSettingsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

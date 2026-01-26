import { Test, TestingModule } from '@nestjs/testing';
import { SystemSettingsController } from './system-settings.controller';
import { SystemSettingsService } from './system-settings.service';
import { DatabaseService } from '../db/database.service';
import { ConfigService } from '@nestjs/config';

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

describe('SystemSettingsController', () => {
  let controller: SystemSettingsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SystemSettingsController],
      providers: [
        SystemSettingsService,
        { provide: DatabaseService, useValue: { database: databaseMock } },
        { provide: ConfigService, useValue: { get: () => 'test-cloud-name' } },
      ],
    }).compile();

    controller = module.get<SystemSettingsController>(SystemSettingsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../db/database.service';
import { HealthAdminController } from './health-admin.controller';
import { HealthService } from './health.service';

describe('HealthAdminController', () => {
  let controller: HealthAdminController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthAdminController],
      providers: [
        HealthService,
        {
          provide: DatabaseService,
          useValue: { database: {} },
        },
        {
          provide: AuditService,
          useValue: { log: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get<HealthAdminController>(HealthAdminController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

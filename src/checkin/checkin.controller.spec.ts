import { Test, TestingModule } from '@nestjs/testing';
import { CheckinController } from './checkin.controller';
import { CheckinService } from './checkin.service';
import { DatabaseService } from '../db/database.service';
import { AuditService } from '../audit/audit.service';
import { AnonymousCheckinRateLimiter } from './anonymous-checkin-rate-limiter';

describe('CheckinController', () => {
  let controller: CheckinController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CheckinController],
      providers: [
        CheckinService,
        { provide: DatabaseService, useValue: { database: {} } },
        { provide: AuditService, useValue: { log: jest.fn() } },
        { provide: AnonymousCheckinRateLimiter, useValue: { assertWithinLimit: jest.fn() } },
      ],
    }).compile();

    controller = module.get<CheckinController>(CheckinController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

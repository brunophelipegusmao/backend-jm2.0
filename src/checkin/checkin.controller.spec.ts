import { Test, TestingModule } from '@nestjs/testing';
import { CheckinController } from './checkin.controller';
import { CheckinService } from './checkin.service';
import { DatabaseService } from '../db/database.service';
import { AuditService } from '../audit/audit.service';
import { AnonymousCheckinRateLimiter } from './anonymous-checkin-rate-limiter';
import { BillingGuard } from '../financial/guards/billing.guard';

describe('CheckinController', () => {
  let controller: CheckinController;

  beforeEach(async () => {
    const billingGuardMock = { canActivate: jest.fn().mockResolvedValue(true) };
    const moduleBuilder = Test.createTestingModule({
      controllers: [CheckinController],
      providers: [
        CheckinService,
        { provide: DatabaseService, useValue: { database: {} } },
        { provide: AuditService, useValue: { log: jest.fn() } },
        {
          provide: AnonymousCheckinRateLimiter,
          useValue: { assertWithinLimit: jest.fn() },
        },
      ],
    });

    const module: TestingModule = await moduleBuilder
      .overrideGuard(BillingGuard)
      .useValue(billingGuardMock)
      .compile();

    controller = module.get<CheckinController>(CheckinController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { FinancialController } from './financial.controller';
import { FinancialService } from './financial.service';
import { DatabaseService } from '../db/database.service';
import { AuditService } from '../audit/audit.service';

describe('FinancialController', () => {
  let controller: FinancialController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FinancialController],
      providers: [
        FinancialService,
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

    controller = module.get<FinancialController>(FinancialController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

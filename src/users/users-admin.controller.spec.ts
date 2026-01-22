import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from '../audit/audit.service';
import { CloudinaryService } from '../common/services/cloudinary.service';
import { DatabaseService } from '../db/database.service';
import { UsersAdminController } from './users-admin.controller';
import { UsersService } from './users.service';

describe('UsersAdminController', () => {
  let controller: UsersAdminController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersAdminController],
      providers: [
        UsersService,
        {
          provide: DatabaseService,
          useValue: { database: {} },
        },
        {
          provide: AuditService,
          useValue: { log: jest.fn() },
        },
        {
          provide: CloudinaryService,
          useValue: { uploadImage: jest.fn(), deleteImage: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get<UsersAdminController>(UsersAdminController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

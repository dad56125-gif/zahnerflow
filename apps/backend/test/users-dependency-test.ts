import { Test } from '@nestjs/testing';
import { UsersService } from '../src/modules/users/users.service';
import { UsersController } from '../src/modules/users/users.controller';
import { DbService } from '../src/db/db.service';

describe('Users Module Dependency Injection Test', () => {
  let usersService: UsersService;
  let usersController: UsersController;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [UsersService, DbService],
    }).compile();

    usersService = module.get<UsersService>(UsersService);
    usersController = module.get<UsersController>(UsersController);
  });

  test('UsersService should be defined', () => {
    expect(usersService).toBeDefined();
  });

  test('UsersController should be defined', () => {
    expect(usersController).toBeDefined();
  });

  test('UsersController should have UsersService injected', () => {
    expect((usersController as any).usersService).toBeDefined();
  });
});
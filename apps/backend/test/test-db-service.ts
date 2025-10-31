import { Injectable } from '@nestjs/common';

@Injectable()
export class TestDbService {
  test() {
    return 'test-db-service-working';
  }
}

@Injectable()
export class TestUsersService {
  constructor(private readonly testDbService: TestDbService) {}

  test() {
    return this.testDbService.test();
  }
}

import 'reflect-metadata';
console.log('TestDbService decorators:', Reflect.getMetadata('design:paramtypes', TestDbService));
console.log('TestUsersService decorators:', Reflect.getMetadata('design:paramtypes', TestUsersService));
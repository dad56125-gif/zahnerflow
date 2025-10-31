import { UsersController } from '../src/modules/users/users.controller';
import { UsersService } from '../src/modules/users/users.service';
import { DbService } from '../src/db/db.service';

console.log('Testing UsersController instantiation...');
try {
  const dbService = new DbService();
  const usersService = new UsersService(dbService);
  const usersController = new UsersController(usersService);
  console.log('✓ UsersController created successfully');
  console.log('UsersController methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(usersController)));
  console.log('UsersController has usersService:', !!(usersController as any).usersService);
} catch (error) {
  console.error('✗ Failed to create UsersController:', error.message);
}

console.log('\nChecking decorators...');
console.log('UsersController constructor metadata:', Reflect.getMetadataKeys(UsersController.prototype));
console.log('UsersService constructor metadata:', Reflect.getMetadataKeys(UsersService.prototype));
console.log('DbService constructor metadata:', Reflect.getMetadataKeys(DbService.prototype));
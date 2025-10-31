import { DbService } from '../src/db/db.service';
import { UsersService } from '../src/modules/users/users.service';

console.log('Testing DbService instantiation...');
try {
  const dbService = new DbService();
  console.log('✓ DbService created successfully');
  console.log('DbService methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(dbService)));
} catch (error) {
  console.error('✗ Failed to create DbService:', error.message);
}

console.log('\nTesting UsersService instantiation...');
try {
  const dbService = new DbService();
  const usersService = new UsersService(dbService);
  console.log('✓ UsersService created successfully');
  console.log('UsersService methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(usersService)));
} catch (error) {
  console.error('✗ Failed to create UsersService:', error.message);
}
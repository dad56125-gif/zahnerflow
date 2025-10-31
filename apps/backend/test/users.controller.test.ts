// test/users.controller.test.ts
import { test, run } from './run-tests';
import { UsersController } from '../src/modules/users/users.controller';
import { UsersService } from '../src/modules/users/users.service';
import { DbService } from '../src/db/db.service';

test('POST /api/users should create new user', async () => {
  // This will fail because UsersController doesn't exist yet
  try {
    const dbService = new DbService();
    const usersService = new UsersService(dbService);
    const usersController = new UsersController(usersService);

    const result = await usersController.createUser({ user: 'test_user', email: 'test@example.com' });

    if (!result.success) {
      throw new Error(`Expected success to be true, got: ${result.success}`);
    }
    if (!result.message.includes('created')) {
      throw new Error(`Expected message to contain 'created', got: ${result.message}`);
    }
  } catch (error: any) {
    if (error.message.includes("Cannot find module")) {
      throw new Error("Users module not implemented yet");
    }
    throw error;
  }
});

test('GET /api/users should return user list', async () => {
  try {
    const dbService = new DbService();
    const usersService = new UsersService(dbService);
    const usersController = new UsersController(usersService);

    // First create a user
    await usersController.createUser({ user: 'test_user' });

    const result = usersController.getUsers();

    if (!Array.isArray(result.users)) {
      throw new Error(`Expected users to be an array, got: ${typeof result.users}`);
    }
    if (!result.users.includes('test_user')) {
      throw new Error(`Expected users to include 'test_user', got: ${JSON.stringify(result.users)}`);
    }
  } catch (error: any) {
    if (error.message.includes("Cannot find module")) {
      throw new Error("Users module not implemented yet");
    }
    throw error;
  }
});

test('DELETE /api/users/:user should delete user', async () => {
  try {
    const dbService = new DbService();
    const usersService = new UsersService(dbService);
    const usersController = new UsersController(usersService);

    // First create a user
    await usersController.createUser({ user: 'test_user' });

    const result = await usersController.deleteUser('test_user');

    if (!result.success) {
      throw new Error(`Expected success to be true, got: ${result.success}`);
    }
    if (!result.message.includes('deleted')) {
      throw new Error(`Expected message to contain 'deleted', got: ${result.message}`);
    }
  } catch (error: any) {
    if (error.message.includes("Cannot find module")) {
      throw new Error("Users module not implemented yet");
    }
    throw error;
  }
});

if (import.meta.url === `file://${process.argv[1]}`) run();
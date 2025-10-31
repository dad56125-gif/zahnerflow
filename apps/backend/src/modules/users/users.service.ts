import { Injectable } from '@nestjs/common';
import { DbService, User } from '../../db/db.service';

@Injectable()
export class UsersService {
  constructor(private readonly dbService: DbService) {}

  createUser(userData: { user: string; email?: string }): User {
    try {
      return this.dbService.createUser(userData);
    } catch (error) {
      throw new Error(`Failed to create user: ${(error as Error).message}`);
    }
  }

  getUsers(): User[] {
    return this.dbService.getUsers();
  }

  deleteUser(user: string): boolean {
    return this.dbService.deleteUser(user);
  }
}
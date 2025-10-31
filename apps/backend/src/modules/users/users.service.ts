import { Injectable, BadRequestException } from '@nestjs/common';
import { DbService, User } from '../../db/db.service';
import { validate } from 'class-validator';
import { CreateUserDto } from './users.controller';

@Injectable()
export class UsersService {
  constructor(private readonly dbService: DbService) {}

  async createUser(userData: { user: string; email?: string }): Promise<User> {
    try {
      // Manual validation to ensure data integrity
      const createUserDto = new CreateUserDto();
      createUserDto.user = userData.user;
      createUserDto.email = userData.email;

      const validationErrors = await validate(createUserDto);
      if (validationErrors.length > 0) {
        const errorMessages = validationErrors.map(err =>
          Object.values(err.constraints || {}).join(', ')
        ).join('; ');
        throw new BadRequestException(`Validation failed: ${errorMessages}`);
      }

      return this.dbService.createUser(userData);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
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
import { Injectable, BadRequestException } from '@nestjs/common';
import { DbService, User } from '../../db/db.service';
import { validate } from 'class-validator';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly dbService: DbService) {}

  async createUser(userData: { user: string; email?: string }): Promise<User> {
    // Manual validation to ensure data integrity
    const createUserDto = new CreateUserDto();
    createUserDto.user = userData.user;
    createUserDto.email = userData.email;

    const validationErrors = await validate(createUserDto);
    if (validationErrors.length > 0) {
      const errorMessages = validationErrors.map(err =>
        Object.values(err.constraints || {}).join(', ')
      ).join('; ');
      throw new Error(`Validation failed: ${errorMessages}`);
    }

    return await this.dbService.createUser(userData);
  }

  getUsers(): User[] {
    return this.dbService.getUsers();
  }

  async deleteUser(user: string): Promise<boolean> {
    return await this.dbService.deleteUser(user);
  }
}
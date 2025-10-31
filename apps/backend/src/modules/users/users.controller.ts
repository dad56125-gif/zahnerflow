import { Controller, Get, Post, Delete, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { UsersService } from './users.service';

export interface CreateUserDto {
  user: string;
  email?: string;
}

@Controller('api/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createUser(@Body() createUserDto: CreateUserDto) {
    try {
      this.usersService.createUser(createUserDto);
      return {
        success: true,
        message: `User ${createUserDto.user} created successfully`
      };
    } catch (error) {
      return {
        success: false,
        message: (error as Error).message
      };
    }
  }

  @Get()
  getUsers() {
    const users = this.usersService.getUsers();
    return {
      users: users.map(u => u.user)
    };
  }

  @Delete(':user')
  @HttpCode(HttpStatus.OK)
  async deleteUser(@Param('user') user: string) {
    const success = this.usersService.deleteUser(user);
    return {
      success,
      message: success ? `User ${user} deleted` : `User ${user} not found`
    };
  }
}
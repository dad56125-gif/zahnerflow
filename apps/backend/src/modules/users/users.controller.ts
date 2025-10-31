import { Controller, Get, Post, Delete, Body, Param, HttpCode, HttpStatus, UsePipes, ValidationPipe } from '@nestjs/common';
import { UsersService } from './users.service';
import { IsString, IsNotEmpty, IsOptional, IsEmail } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  user: string;

  @IsString()
  @IsOptional()
  @IsEmail()
  email?: string;
}

@Controller('api/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ValidationPipe({ transform: true }))
  async createUser(@Body() createUserDto: CreateUserDto) {
    try {
      await this.usersService.createUser(createUserDto);
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
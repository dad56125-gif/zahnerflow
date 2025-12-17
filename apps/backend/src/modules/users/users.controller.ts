import { Controller, Get, Post, Put, Delete, Body, Param, HttpCode, HttpStatus, UsePipes, ValidationPipe } from '@nestjs/common';
import { UsersService } from './users.service';
import { UserSettingsService, UserSettings } from './user-settings.service';
// 👇 引入校验装饰器
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
  constructor(
    private readonly usersService: UsersService,
    private readonly userSettingsService: UserSettingsService
  ) { }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  // 这里直接用上面的 CreateUserDto
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async createUser(@Body() createUserDto: CreateUserDto) {
    try {
      await this.usersService.createUser(createUserDto);
      return {
        success: true,
        message: `User ${createUserDto.user} created successfully`
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Failed to create user'
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
    const success = await this.usersService.deleteUser(user);
    // 同时删除用户配置
    if (success) {
      this.userSettingsService.deleteUserSettings(user);
    }
    return {
      success,
      message: success ? `User ${user} deleted` : `User ${user} not found`
    };
  }

  // ==========================================
  // 用户配置 API
  // ==========================================

  /**
   * 获取用户的完整配置
   */
  @Get(':user/settings')
  getUserSettings(@Param('user') user: string) {
    const settings = this.userSettingsService.getUserSettings(user);
    return {
      success: true,
      settings
    };
  }

  /**
   * 保存用户的完整配置
   */
  @Put(':user/settings')
  @HttpCode(HttpStatus.OK)
  saveUserSettings(
    @Param('user') user: string,
    @Body() settings: Partial<UserSettings>
  ) {
    try {
      this.userSettingsService.saveUserSettings(user, settings);
      return {
        success: true,
        message: 'Settings saved successfully'
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Failed to save settings'
      };
    }
  }

  /**
   * 更新用户配置的单个分类（如 file_path, notification, cloud）
   */
  @Put(':user/settings/:section')
  @HttpCode(HttpStatus.OK)
  updateSettingsSection(
    @Param('user') user: string,
    @Param('section') section: keyof UserSettings,
    @Body() value: any
  ) {
    try {
      this.userSettingsService.updateSettingsSection(user, section, value);
      return {
        success: true,
        message: `${section} settings saved`
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Failed to save settings'
      };
    }
  }
}

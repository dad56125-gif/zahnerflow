import 'reflect-metadata';
import { ModuleRef } from '@nestjs/core';
import { UsersController } from '../src/modules/users/users.controller';
import { UsersService } from '../src/modules/users/users.service';
import { DbService } from '../src/db/db.service';

console.log('=== Dependency Analysis ===');

// Check decorators
console.log('\n1. Checking decorators:');
console.log('UsersController decorators:', Reflect.getMetadata('design:paramtypes', UsersController));
console.log('UsersService decorators:', Reflect.getMetadata('design:paramtypes', UsersService));
console.log('DbService decorators:', Reflect.getMetadata('design:paramtypes', DbService));

// Check constructor parameters
console.log('\n2. Checking constructor parameters:');
const userControllerParams = Reflect.getMetadata('design:paramtypes', UsersController);
const userServiceParams = Reflect.getMetadata('design:paramtypes', UsersService);

console.log('UsersController expects:', userControllerParams?.map(p => p?.name) || []);
console.log('UsersService expects:', userServiceParams?.map(p => p?.name) || []);

// Check if classes are properly defined
console.log('\n3. Class definitions:');
console.log('UsersController is defined:', typeof UsersController === 'function');
console.log('UsersService is defined:', typeof UsersService === 'function');
console.log('DbService is defined:', typeof DbService === 'function');

// Check prototype chain
console.log('\n4. Prototype chain:');
console.log('UsersController prototype:', UsersController.prototype.constructor.name);
console.log('UsersService prototype:', UsersService.prototype.constructor.name);
console.log('DbService prototype:', DbService.prototype.constructor.name);
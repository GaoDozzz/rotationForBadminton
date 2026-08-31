import { Module } from '@nestjs/common';
import { EventQueryService } from './event-query.service';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { IdentityService } from './identity.service';
import { LocalDevelopmentGuard } from './local-development.guard';

@Module({ controllers: [EventsController], providers: [EventsService, IdentityService, EventQueryService, LocalDevelopmentGuard] })
export class EventsModule {}

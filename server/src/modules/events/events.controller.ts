import { Body, Controller, Delete, Get, Inject, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CreateEventDto, ImportEventDto, JoinEventDto, UpdateMatchPlayersDto, UpdateMatchScoreDto, WithdrawParticipantDto } from './event.dto';
import { EventQueryService } from './event-query.service';
import { EventsService } from './events.service';
import { LocalDevelopmentGuard } from './local-development.guard';

const LOCAL_IDENTITY = 'local-development-organizer';

@UseGuards(LocalDevelopmentGuard)
@Controller('events')
export class EventsController {
  constructor(@Inject(EventsService) private readonly events: EventsService, @Inject(EventQueryService) private readonly queries: EventQueryService) {}

  @Get() listMine() { return this.events.listMine(LOCAL_IDENTITY); }
  @Post() create(@Body() dto: CreateEventDto) { return this.events.create(LOCAL_IDENTITY, dto); }
  @Post('import') importEvent(@Body() dto: ImportEventDto) { return this.events.importEvent(LOCAL_IDENTITY, dto.text); }
  @Get('share/:shareCode') getShared(@Param('shareCode') shareCode: string) { return this.events.getByShareCode(shareCode); }
  @Post('share/:shareCode/join') join(@Param('shareCode') shareCode: string, @Body() dto: JoinEventDto) { return this.events.join(shareCode, LOCAL_IDENTITY, dto); }
  @Get(':eventId') get(@Param('eventId') eventId: string) { return this.queries.get(eventId); }
  @Post(':eventId/start') start(@Param('eventId') eventId: string) { return this.events.start(eventId, LOCAL_IDENTITY); }
  @Delete(':eventId') remove(@Param('eventId') eventId: string) { return this.events.softDelete(eventId, LOCAL_IDENTITY); }
  @Get(':eventId/matches') matches(@Param('eventId') eventId: string, @Query('filter') filter: 'ALL' | 'PENDING' | 'LIVE' | 'FINISHED' = 'ALL') { return this.events.listMatches(eventId, filter); }
  @Post(':eventId/matches/regenerate') regenerateMatches(@Param('eventId') eventId: string) { return this.events.regenerateMatches(eventId, LOCAL_IDENTITY); }
  @Put(':eventId/matches/:matchId/score') updateScore(@Param('eventId') eventId: string, @Param('matchId') matchId: string, @Body() dto: UpdateMatchScoreDto) { return this.events.updateMatchScore(eventId, matchId, LOCAL_IDENTITY, dto); }
  @Put(':eventId/matches/:matchId/players') updatePlayers(@Param('eventId') eventId: string, @Param('matchId') matchId: string, @Body() dto: UpdateMatchPlayersDto) { return this.events.updateMatchPlayers(eventId, matchId, LOCAL_IDENTITY, dto); }
  @Get(':eventId/rankings') rankings(@Param('eventId') eventId: string) { return this.events.getRankings(eventId); }
  @Post(':eventId/withdraw/preview') previewWithdraw(@Param('eventId') eventId: string, @Body() dto: WithdrawParticipantDto) { return this.events.previewWithdraw(eventId, dto.participantId, LOCAL_IDENTITY); }
  @Post(':eventId/withdraw/confirm') confirmWithdraw(@Param('eventId') eventId: string, @Body() dto: WithdrawParticipantDto) { return this.events.confirmWithdraw(eventId, dto.participantId, LOCAL_IDENTITY); }
}


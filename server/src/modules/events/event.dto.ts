import { Gender, MatchFormat, RegistrationMode } from '@zzjl/contracts';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

export class ParticipantInputDto {
  @IsString() @MinLength(1) @MaxLength(20) participantNumber!: string;
  @IsString() @MinLength(1) @MaxLength(20) nickname!: string;
  @IsEnum(Gender) gender!: Gender;
  @IsOptional() @IsString() @MaxLength(30) level?: string;
}

export class CreateEventDto {
  @IsString() @MinLength(1) @MaxLength(40) title!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsEnum(MatchFormat) matchFormat!: MatchFormat;
  @IsEnum(RegistrationMode) registrationMode!: RegistrationMode;
  @IsOptional() @IsInt() @Min(2) @Max(64) capacity?: number;
  @IsInt() @Min(1) @Max(16) courtCount!: number;
  @IsIn([11, 15, 21, 31]) scoreTo!: 11 | 15 | 21 | 31;
  @IsInt() @Min(1) @Max(20) rounds!: number;
  @IsArray() @ArrayMaxSize(64) @ValidateNested({ each: true }) @Type(() => ParticipantInputDto) participants: ParticipantInputDto[] = [];
}

export class JoinEventDto {
  @IsString() @MinLength(1) @MaxLength(20) nickname!: string;
  @IsEnum(Gender) gender!: Gender;
  @IsOptional() @IsString() @MaxLength(30) level?: string;
}

export class WithdrawParticipantDto {
  @IsString() @MinLength(1) participantId!: string;
}

export class UpdateMatchScoreDto {
  @IsInt() @Min(0) @Max(31) teamAScore!: number;
  @IsInt() @Min(0) @Max(31) teamBScore!: number;
}

export class UpdateMatchPlayersDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(2) @IsString({ each: true }) teamAPlayerIds!: string[];
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(2) @IsString({ each: true }) teamBPlayerIds!: string[];
}

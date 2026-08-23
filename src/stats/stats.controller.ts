import { Controller, Get, Query } from '@nestjs/common';
import { StatsService } from './stats.service';

@Controller('stats')
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get('popular-posts')
  popularPosts(@Query('limit') limit?: string) {
    return this.statsService.popularPosts(limit ? Number(limit) : undefined);
  }

  @Get('visits')
  visits(@Query('days') days?: string) {
    return this.statsService.visits(days ? Number(days) : undefined);
  }
}

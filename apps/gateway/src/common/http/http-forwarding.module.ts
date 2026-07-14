import { Module } from '@nestjs/common';
import { DownstreamHttpClient } from './downstream-http.client';

@Module({
  providers: [DownstreamHttpClient],
  exports: [DownstreamHttpClient],
})
export class HttpForwardingModule {}


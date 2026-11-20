import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PRICE_MARKDOWN_QUEUE } from '../../infrastructure/queue/queue-names';
import { PRICE_MARKDOWN_TICK_JOB } from './markdown-scheduler.service';
import { MarkdownService } from './markdown.service';

@Processor(PRICE_MARKDOWN_QUEUE)
export class MarkdownProcessor extends WorkerHost {
  private readonly logger = new Logger(MarkdownProcessor.name);

  constructor(private readonly markdown: MarkdownService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== PRICE_MARKDOWN_TICK_JOB) return;
    await this.markdown.runDue(new Date());
    this.logger.log('Preissenkung geprüft');
  }
}

import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ActorContext } from '../../domain/actor-context';

/** Liest den von `ActorContextGuard` gesetzten Actor aus dem Request. */
export const CurrentActor = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ActorContext => {
    const request = ctx.switchToHttp().getRequest();
    return request.actor;
  },
);

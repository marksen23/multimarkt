import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ActorContext } from '../../domain/actor-context';

/**
 * Actor Authority Model (Doc 03 §2, Doc 04 §2/§4) an der HTTP-Grenze.
 *
 * Bewusst EIN generischer Guard statt drei separater Auth-Strategien: er
 * ermittelt NUR, welcher Actor-Typ einen Request gestellt hat (USER via
 * Bearer-Token, WEBHOOK via Signatur-Header, SYSTEM via internes
 * Service-Token). Ob dieser Actor-Typ die konkrete Aktion ausführen DARF
 * (Human-Gate), entscheidet ausschließlich der StateGuardService bzw. die
 * jeweiligen Application-Services — nie dieser Guard. Das ist bewusst so
 * geschnitten, damit z.B. ein Webhook-Actor technisch jede Route erreichen
 * kann (er wird korrekt authentifiziert), aber an jedem Human-Gate von der
 * immer gleichen, in Schritt 3 bewiesenen Logik mit HTTP 403 abgewiesen
 * wird (Doc 05 T04-1) — statt an einer route-spezifischen Guard-Liste, die
 * bei jeder neuen Route separat gepflegt werden müsste.
 *
 * "Single User"-Vereinfachung (kein Login-Flow, kein in Doc 04 nicht
 * spezifizierter `/auth`-Endpoint): der USER-Bearer-Token ist ein
 * statisches, über Render/`.env` konfiguriertes Secret.
 */
@Injectable()
export class ActorContextGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers['authorization'];
    const webhookSignature: string | undefined = request.headers['x-webhook-signature'];

    if (webhookSignature) {
      // Echte kryptographische Prüfung findet ausschließlich im dedizierten
      // Webhook-Controller statt (WebhookSignatureService, Doc 03 §12). Für
      // alle anderen Routen ist die bloße Anwesenheit dieses Headers bereits
      // anomal genug, um als WEBHOOK-Actor markiert zu werden — legitime
      // Webhook-Traffic zielt ohnehin ausschließlich auf `/webhooks/*`.
      request.actor = { type: 'WEBHOOK' } satisfies ActorContext;
      return true;
    }

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice('Bearer '.length);
      const internalPrefix = 'internal:';

      if (token.startsWith(internalPrefix)) {
        const internalToken = token.slice(internalPrefix.length);
        if (internalToken === this.config.get<string>('INTERNAL_SERVICE_TOKEN')) {
          request.actor = { type: 'SYSTEM' } satisfies ActorContext;
          return true;
        }
        throw new UnauthorizedException('Invalid internal service token');
      }

      if (token === this.config.get<string>('APP_ACCESS_TOKEN')) {
        request.actor = { type: 'USER', userId: this.config.get<string>('APP_USER_ID') } satisfies ActorContext;
        return true;
      }
      throw new UnauthorizedException('Invalid bearer token');
    }

    throw new UnauthorizedException('Missing Authorization or webhook signature header');
  }
}

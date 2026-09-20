import { Injectable, Logger } from '@nestjs/common';
import { createMachine, interpret, assign } from 'xstate';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductTruthEntity } from './product-truth.entity'; // Unser SQL Schema
import { MarketAnalysisService } from './market-analysis.service'; // Gemini Integration

// ==============================================================================
// 1. TYPISIERUNG: State Machine Context & Events
// ==============================================================================

// Der "Speicher" der State Machine während sie läuft
interface ProductContext {
  productId: string;
  userId: string;
  attributes: Record<string, any>;
  condition: { value: string | null; status: 'MISSING' | 'INFERRED' | 'USER_CONFIRMED' };
  strategy: string | null;
  errors: string[];
}

// Die Events, die einen Zustandswechsel auslösen können
type ProductEvent = 
  | { type: 'IMAGE_UPLOADED'; payload: { imageUrl: string } }
  | { type: 'AI_ANALYSIS_COMPLETED'; payload: { attributes: any, condition: any } }
  | { type: 'USER_CONFIRMED_DATA'; payload: { attributes: any, condition: any } }
  | { type: 'STRATEGY_SET'; payload: { strategy: string, minPrice: number } }
  | { type: 'PUBLISH_REQUESTED' }
  | { type: 'LISTING_SUCCESS'; payload: { platform: string, externalId: string } }
  | { type: 'BUYER_INTEREST' }
  | { type: 'MARKED_AS_SOLD' }
  | { type: 'ERROR'; payload: { message: string } };

// ==============================================================================
// 2. DIE STATE MACHINE: Das Herzstück der Logik
// Definiert exakt, was in welchem Zustand passieren darf.
// ==============================================================================

export const createProductLifecycleMachine = (
  dbRepository: Repository<ProductTruthEntity>,
  marketAnalysis: MarketAnalysisService
) => {
  return createMachine<ProductContext, ProductEvent>(
    {
      id: 'product-lifecycle',
      initial: 'CAPTURED', // Startpunkt nach Foto-Upload
      context: {
        productId: '',
        userId: '',
        attributes: {},
        condition: { value: null, status: 'MISSING' },
        strategy: null,
        errors: []
      },
      states: {
        // Phase 0: Foto da, warte auf KI
        CAPTURED: {
          on: {
            IMAGE_UPLOADED: {
              target: 'ANALYZING'
            }
          }
        },
        
        // Phase 1: KI arbeitet (Gemini + Web Grounding)
        ANALYZING: {
          invoke: {
            id: 'run-ai-pipeline',
            src: 'invokeAiAnalysis', // Ruft den Service unten auf
            onDone: {
              target: 'REVIEW_REQUIRED',
              actions: ['saveAiResultsToDb', 'updateContextWithAiData']
            },
            onError: {
              target: 'ERROR_STATE',
              actions: 'logError'
            }
          }
        },

        // Phase 2: "Never silently invent" - Warten auf den Menschen (Confidence Center)
        REVIEW_REQUIRED: {
          on: {
            USER_CONFIRMED_DATA: [
              {
                // Guard: Geht nur weiter nach READY, wenn Condition 'USER_CONFIRMED' ist
                // Dies spiegelt exakt den Postgres-Constraint in schema.sql wider!
                target: 'READY',
                cond: 'isConditionConfirmedByHuman',
                actions: ['saveUserConfirmationToDb', 'updateContextWithUserData']
              },
              {
                // Wenn der User speichert, aber Pflichtfelder fehlen, bleibe hier
                target: 'REVIEW_REQUIRED',
                actions: ['saveDraftToDb', 'updateContextWithUserData']
              }
            ]
          }
        },

        // Phase 3: Fakten stehen fest, warte auf Strategie (Verkaufen vs. Spenden)
        READY: {
          on: {
            STRATEGY_SET: {
              target: 'DISPOSITION_DECIDED',
              actions: 'saveStrategyToDb'
            }
          }
        },

        // Phase 4: Disposition steht (z.B. "Maximaler Erlös auf eBay & Kleinanzeigen")
        DISPOSITION_DECIDED: {
          on: {
            PUBLISH_REQUESTED: {
              target: 'PUBLISHING'
            }
          }
        },

        // Phase 5: Async Queue für die API-Adapter (BullMQ Anbindung)
        PUBLISHING: {
          on: {
            LISTING_SUCCESS: {
              target: 'PUBLISHED',
              actions: 'saveListingProjection'
            },
            ERROR: {
              target: 'ERROR_STATE',
              actions: 'logError'
            }
          }
        },

        // Phase 6: Live im Netz
        PUBLISHED: {
          on: {
            BUYER_INTEREST: 'NEGOTIATING',
            MARKED_AS_SOLD: 'SOLD'
          }
        },

        NEGOTIATING: {
          on: {
            MARKED_AS_SOLD: 'SOLD'
          }
        },

        SOLD: {
          type: 'final', // Endzustand
          entry: 'triggerCrossPlatformDelisting' // Löscht das Item auf anderen Plattformen
        },

        ERROR_STATE: {
          on: {
            // Manueller Retry durch User
            IMAGE_UPLOADED: 'ANALYZING',
            PUBLISH_REQUESTED: 'PUBLISHING'
          }
        }
      }
    },
    {
      // ==============================================================================
      // 3. IMPLEMENTIERUNG DER SERVICES, ACTIONS & GUARDS
      // ==============================================================================
      services: {
        invokeAiAnalysis: async (context, event) => {
          if (event.type !== 'IMAGE_UPLOADED') throw new Error('Invalid event');
          // Hier wird die echte Gemini Pipeline (9a) mit Google Search aufgerufen
          return await marketAnalysis.analyzeProductImage(event.payload.imageUrl);
        }
      },
      actions: {
        updateContextWithAiData: assign({
          attributes: (context, event: any) => event.data.attributes,
          condition: (context, event: any) => event.data.condition
        }),
        updateContextWithUserData: assign({
          attributes: (context, event: any) => event.payload.attributes,
          condition: (context, event: any) => event.payload.condition
        }),
        saveUserConfirmationToDb: async (context, event: any) => {
           // DB Update durchführen. Postgres wird dies akzeptieren, da condition validiert ist.
           await dbRepository.update(context.productId, {
             attributes: event.payload.attributes,
             condition_value: event.payload.condition.value,
             condition_status: 'USER_CONFIRMED', // Hardcoded Provenance!
             state: 'READY'
           });
        },
        triggerCrossPlatformDelisting: async (context) => {
           Logger.log(`Item ${context.productId} sold. Triggering BullMQ Job to delist on all other platforms.`);
           // Push to Queue...
        }
      },
      guards: {
        // Der Wichtigste Guard: Erzwingt das "Never silently invent" Prinzip auf Server-Ebene
        isConditionConfirmedByHuman: (context, event: any) => {
          return event.payload.condition && 
                 event.payload.condition.value !== null && 
                 event.payload.condition.status === 'USER_CONFIRMED';
        }
      }
    }
  );
};

// ==============================================================================
// 4. NESTJS SERVICE (Der Wrapper für Controller)
// ==============================================================================

@Injectable()
export class ProductLifecycleService {
  constructor(
    @InjectRepository(ProductTruthEntity)
    private readonly productRepo: Repository<ProductTruthEntity>,
    private readonly marketAnalysis: MarketAnalysisService
  ) {}

  // Wird aufgerufen, wenn der Nutzer im Frontend im "Confidence Center" auf Speichern drückt
  async handleUserReviewSubmission(productId: string, userData: any) {
    const product = await this.productRepo.findOne({ where: { id: productId } });
    if (!product) throw new Error('Product not found');

    // 1. Initialisiere die Machine mit dem aktuellen DB-Zustand
    const machine = createProductLifecycleMachine(this.productRepo, this.marketAnalysis)
      .withContext({
        productId: product.id,
        userId: product.user_id,
        attributes: product.attributes,
        condition: { value: product.condition_value, status: product.condition_status },
        strategy: product.target_strategy,
        errors: []
      });

    // 2. Starte die Machine am gespeicherten Zustand (z.B. 'REVIEW_REQUIRED')
    const service = interpret(machine).start(product.state);

    // 3. Feuere das Event vom Frontend ab
    service.send({ 
      type: 'USER_CONFIRMED_DATA', 
      payload: { 
        attributes: userData.attributes, 
        condition: userData.condition 
      } 
    });

    // Der XState-Interpreter prüft nun automatisch den Guard (isConditionConfirmedByHuman).
    // Wenn er fehlschlägt, bleiben wir in REVIEW_REQUIRED. 
    // Wenn er durchgeht, wandert der Status auf READY und das DB-Update wird getriggert.
    
    const newState = service.state.value;
    service.stop();
    
    return { currentState: newState };
  }
}
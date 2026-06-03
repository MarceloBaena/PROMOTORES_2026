import { z } from 'zod';

const coordinatesSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const loginSchema = z.object({
  email: z.email({ message: 'Informe um email valido' }),
  password: z.string().min(8, 'A senha deve ter pelo menos 8 caracteres'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(20),
});

export const checklistValueSchema = z.union([z.boolean(), z.string().trim().min(1)]);

export const checklistItemSchema = z.object({
  code: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['BOOLEAN', 'TEXT']),
  required: z.boolean(),
  value: checklistValueSchema,
});

export const startJourneySchema = z.object({
  startedAt: z.iso.datetime(),
  location: coordinatesSchema,
  eventId: z.string().trim().min(1).max(120).optional(),
});

export const endJourneySchema = z.object({
  endedAt: z.iso.datetime(),
  location: coordinatesSchema,
  eventId: z.string().trim().min(1).max(120).optional(),
});

export const checkInSchema = z.object({
  routeStopId: z.string().min(1),
  checkedInAt: z.iso.datetime(),
  location: coordinatesSchema,
  justification: z.string().trim().max(300).optional(),
  eventId: z.string().trim().min(1).max(120).optional(),
});

export const startVisitServiceSchema = z.object({
  startedAt: z.iso.datetime(),
  eventId: z.string().trim().min(1).max(120).optional(),
});

export const checklistSubmissionSchema = z.object({
  items: z.array(checklistItemSchema).min(1),
  notes: z.string().trim().max(1000).optional(),
  eventId: z.string().trim().min(1).max(120).optional(),
});

export const checkOutSchema = z.object({
  checkedOutAt: z.iso.datetime(),
  location: coordinatesSchema,
  completionStatus: z.enum(['COMPLETED', 'PARTIAL', 'NOT_DONE']),
  notes: z.string().trim().max(1000).optional(),
  eventId: z.string().trim().min(1).max(120).optional(),
});

export const updateVisitNotesSchema = z.object({
  visitId: z.string().min(1),
  notes: z.string().trim().min(1).max(1000),
});

export const trackPointSchema = z.object({
  capturedAt: z.iso.datetime(),
  location: coordinatesSchema,
  accuracyM: z.number().nonnegative().optional(),
  source: z.enum(['TRACKING', 'SYNC', 'CUSTOMER_ARRIVAL']).default('TRACKING'),
  eventId: z.string().trim().min(1).max(120).optional(),
});

const syncActionMetadataSchema = z.object({
  id: z.string().min(1),
  clientGeneratedId: z.string().trim().min(1).max(120),
});

export const syncActionSchema = z.discriminatedUnion('type', [
  syncActionMetadataSchema.extend({
    type: z.literal('START_JOURNEY'),
    payload: startJourneySchema,
  }),
  syncActionMetadataSchema.extend({
    type: z.literal('TRACK_POINT'),
    payload: trackPointSchema,
  }),
  syncActionMetadataSchema.extend({
    type: z.literal('CHECK_IN'),
    payload: checkInSchema,
  }),
  syncActionMetadataSchema.extend({
    type: z.literal('START_SERVICE'),
    payload: z.object({
      visitId: z.string().min(1),
      body: startVisitServiceSchema,
    }),
  }),
  syncActionMetadataSchema.extend({
    type: z.literal('SUBMIT_CHECKLIST'),
    payload: z.object({
      visitId: z.string().min(1),
      body: checklistSubmissionSchema,
    }),
  }),
  syncActionMetadataSchema.extend({
    type: z.literal('CHECK_OUT'),
    payload: z.object({
      visitId: z.string().min(1),
      body: checkOutSchema,
    }),
  }),
  syncActionMetadataSchema.extend({
    type: z.literal('UPDATE_NOTES'),
    payload: updateVisitNotesSchema,
  }),
  syncActionMetadataSchema.extend({
    type: z.literal('END_JOURNEY'),
    payload: endJourneySchema,
  }),
]);

export const syncBatchSchema = z.object({
  deviceId: z.string().trim().min(1).max(120).optional(),
  actions: z.array(syncActionSchema),
});

export const syncPullQuerySchema = z.object({
  deviceId: z.string().trim().min(1).max(120).optional(),
  routeDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  lastPulledAt: z.iso.datetime().optional(),
  lastKnownRouteVersion: z.number().int().nonnegative().optional(),
});

export const syncPushSchema = z.object({
  deviceId: z.string().trim().min(1).max(120).optional(),
  pushedAt: z.iso.datetime().optional(),
  routeDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  lastPulledAt: z.iso.datetime().optional(),
  actions: z.array(syncActionSchema),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type StartJourneyInput = z.infer<typeof startJourneySchema>;
export type EndJourneyInput = z.infer<typeof endJourneySchema>;
export type CheckInInput = z.infer<typeof checkInSchema>;
export type StartVisitServiceInput = z.infer<typeof startVisitServiceSchema>;
export type ChecklistSubmissionInput = z.infer<typeof checklistSubmissionSchema>;
export type CheckOutInput = z.infer<typeof checkOutSchema>;
export type UpdateVisitNotesInput = z.infer<typeof updateVisitNotesSchema>;
export type TrackPointInput = z.infer<typeof trackPointSchema>;
export type SyncBatchInput = z.infer<typeof syncBatchSchema>;
export type SyncPullQueryInput = z.infer<typeof syncPullQuerySchema>;
export type SyncPushInput = z.infer<typeof syncPushSchema>;

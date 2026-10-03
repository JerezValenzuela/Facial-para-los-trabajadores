import { z } from "zod";
import { LIVENESS } from "@/lib/face/liveness";
import { EVENT_ORDER } from "@/lib/attendance/events";

export const deviceSchema = z
  .object({
    maxTouchPoints: z.number().int().min(0).max(64).optional(),
    screenWidth: z.number().int().min(0).max(20000).optional(),
    screenHeight: z.number().int().min(0).max(20000).optional(),
    coarsePointer: z.boolean().optional(),
    canHover: z.boolean().optional(),
  })
  .optional();

export const challengeBodySchema = z.object({
  device: deviceSchema,
  branchCode: z.string().regex(/^[a-z0-9-]{2,32}$/).optional(),
});

const frameSchema = z.object({
  t: z.number().finite().min(0).max(120_000),
  ear: z.number().finite(),
  yaw: z.number().finite(),
  size: z.number().finite(),
});

const descriptorSchema = z.array(z.number().finite().min(-2).max(2)).length(128);

export const identifyBodySchema = z.object({
  challengeId: z.uuid(),
  frames: z.array(frameSchema).min(1).max(LIVENESS.maxFrames),
  descriptors: z.array(descriptorSchema).min(2).max(3),
  thumbnail: z.string().max(90_000).optional(),
  device: deviceSchema,
  branchCode: z.string().regex(/^[a-z0-9-]{2,32}$/).optional(),
});

export const abortBodySchema = z.object({
  challengeId: z.uuid(),
  reason: z.enum(["tiempo_agotado", "sin_mirar_al_centro"]),
  stepIndex: z.number().int().min(0).max(5),
  frames: z.array(frameSchema).max(LIVENESS.maxFrames),
  device: deviceSchema,
  branchCode: z.string().regex(/^[a-z0-9-]{2,32}$/).optional(),
});

export const markBodySchema = z.object({
  ticket: z.uuid(),
  eventType: z.enum(EVENT_ORDER as unknown as [string, ...string[]]),
  device: deviceSchema,
  branchCode: z.string().regex(/^[a-z0-9-]{2,32}$/).optional(),
});

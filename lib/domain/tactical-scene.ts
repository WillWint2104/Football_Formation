import { z } from "zod";
import {
  duplicateIds,
  idSchema,
  recordShape,
  revisionSchema,
  textSchema,
} from "./common";

export const pointSchema = z.strictObject({
  x: z.number().finite(),
  y: z.number().finite(),
});
export const areaSchema = z.strictObject({
  origin: pointSchema,
  length: z.number().positive().finite(),
  width: z.number().positive().finite(),
});
/** Optional additive context leaves historical schema-1.0 payloads untouched. */
export const fieldContextSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("neutral"), boundary: z.boolean() }),
  z.strictObject({
    kind: z.literal("pitch"),
    region: z.enum(["full", "attacking-third", "defensive-third", "midfield", "attacking-half", "defensive-half", "set-piece", "custom"]),
    attack: z.enum(["positive-x", "negative-x"]),
    area: areaSchema.optional(),
    setPiece: z.strictObject({
      type: z.enum(["corner", "wide-free-kick", "edge-free-kick", "direct-free-kick", "indirect-free-kick", "penalty"]),
      phase: z.enum(["attacking", "defending"]), side: z.enum(["left", "right"]), location: pointSchema.optional(),
    }).optional(),
  }),
]);
const entityBase = {
  id: idSchema,
  position: pointSchema,
  headingDegrees: z.number().min(0).lt(360),
};
export const entitySchema = z.discriminatedUnion("kind", [
  z.strictObject({
    ...entityBase,
    kind: z.literal("player"),
    team: z.enum(["a", "b", "neutral"]),
    number: z.number().int().min(1).max(99),
    positionLabel: textSchema.nullable(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  }),
  z.strictObject({ ...entityBase, kind: z.literal("ball") }),
  z.strictObject({
    ...entityBase,
    kind: z.literal("equipment"),
    equipment: z.enum([
      "cone",
      "pole",
      "goal",
      "mannequin",
      "marker",
      "ladder",
    ]),
  }),
]);
const keyframeSchema = z.strictObject({
  seconds: z.number().nonnegative().finite(),
  position: pointSchema,
});
const pathShape = {
  id: idSchema,
  entityId: idSchema,
  keyframes: z.array(keyframeSchema).min(2),
};
export const trackSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    ...pathShape,
    kind: z.literal("player"),
    movement: z.enum(["run", "press", "rotation"]),
  }),
  z.strictObject({
    ...pathShape,
    kind: z.literal("ball"),
    movement: z.enum(["pass", "dribble"]),
  }),
  z.strictObject({
    id: idSchema,
    kind: z.literal("annotation"),
    visibleFrom: z.number().nonnegative().finite(),
    visibleUntil: z.number().positive().finite(),
    annotation: z.discriminatedUnion("kind", [
      z.strictObject({
        kind: z.literal("arrow"),
        from: pointSchema,
        to: pointSchema,
        movement: z.enum(["pass", "run", "press", "rotation"]),
      }),
      z.strictObject({
        kind: z.literal("area"),
        area: areaSchema,
        label: textSchema,
      }),
      z.strictObject({
        kind: z.literal("note"),
        position: pointSchema,
        text: textSchema,
      }),
    ]),
  }),
]);
export const stageSchema = z
  .strictObject({
    id: idSchema,
    title: textSchema,
    durationSeconds: z.number().positive().finite(),
    tracks: z.array(trackSchema),
    // Additive, stage-local visibility; absent means every entity is visible.
    hiddenEntityIds: z.array(idSchema).max(512).optional(),
  })
  .superRefine((stage, ctx) => {
    if (duplicateIds(stage.tracks))
      ctx.addIssue({
        code: "custom",
        path: ["tracks"],
        message: "Duplicate track ID",
      });
    stage.tracks.forEach((track, index) => {
      if (track.kind === "annotation") {
        if (
          track.visibleFrom >= track.visibleUntil ||
          track.visibleUntil > stage.durationSeconds
        )
          ctx.addIssue({
            code: "custom",
            path: ["tracks", index],
            message: "Visibility must be within its stage",
          });
      } else if (
        track.keyframes.some(
          (frame, i, frames) =>
            frame.seconds > stage.durationSeconds ||
            (i > 0 && frame.seconds <= frames[i - 1].seconds),
        )
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["tracks", index, "keyframes"],
          message: "Keyframes must increase strictly within the stage",
        });
      }
    });
  });

export const tacticalSceneSchema = z
  .strictObject({
    ...recordShape,
    revision: revisionSchema,
    units: z.literal("metres"),
    context: fieldContextSchema.optional(),
    field: z.strictObject({
      length: z.number().positive().finite(),
      width: z.number().positive().finite(),
    }),
    entities: z.array(entitySchema),
    stages: z.array(stageSchema),
  })
  .superRefine((scene, ctx) => {
    const context = scene.context;
    if (context?.kind === "pitch") {
      if (scene.field.length < 70 || scene.field.width < 45) ctx.addIssue({ code: "custom", path: ["field"], message: "Physical football context needs at least 70 × 45 m; use a neutral area for smaller independent drills" });
      if (context.region === "custom" && !context.area) ctx.addIssue({ code: "custom", path: ["context", "area"], message: "Custom context requires a physical area" });
      if (context.region === "set-piece" && !context.setPiece) ctx.addIssue({ code: "custom", path: ["context", "setPiece"], message: "Set-piece context requires delivery details" });
      const a = context.area;
      if (a && (a.origin.x < 0 || a.origin.y < 0 || a.origin.x + a.length > scene.field.length || a.origin.y + a.width > scene.field.width)) ctx.addIssue({ code: "custom", path: ["context", "area"], message: "Physical context area must be within its parent pitch" });
      const p = context.setPiece?.location;
      if (p && (p.x < 0 || p.y < 0 || p.x > scene.field.length || p.y > scene.field.width)) ctx.addIssue({ code: "custom", path: ["context", "setPiece", "location"], message: "Delivery location must be on the pitch" });
    }
    if (
      !Number.isFinite(
        scene.stages.reduce((sum, stage) => sum + stage.durationSeconds, 0),
      )
    )
      ctx.addIssue({
        code: "custom",
        path: ["stages"],
        message: "Total scene duration must be finite",
      });
    if (duplicateIds(scene.entities))
      ctx.addIssue({
        code: "custom",
        path: ["entities"],
        message: "Duplicate entity ID",
      });
    if (duplicateIds(scene.stages))
      ctx.addIssue({
        code: "custom",
        path: ["stages"],
        message: "Duplicate stage ID",
      });
    const entities = new Map(
      scene.entities.map((entity) => [entity.id, entity]),
    );
    scene.stages.forEach((stage, si) => {
      if (stage.hiddenEntityIds && (new Set(stage.hiddenEntityIds).size !== stage.hiddenEntityIds.length || stage.hiddenEntityIds.some((id) => !entities.has(id))))
        ctx.addIssue({ code: "custom", path: ["stages", si, "hiddenEntityIds"], message: "Stage visibility requires unique existing entities" });
      const movingEntities = new Set<string>();
      stage.tracks.forEach((track, ti) => {
        if (track.kind === "annotation") return;
        const entity = entities.get(track.entityId);
        if (entity?.kind !== track.kind)
          ctx.addIssue({
            code: "custom",
            path: ["stages", si, "tracks", ti, "entityId"],
            message: "Track requires an existing entity of matching kind",
          });
        if (movingEntities.has(track.entityId))
          ctx.addIssue({
            code: "custom",
            path: ["stages", si, "tracks", ti],
            message: "One movement track per entity per stage",
          });
        movingEntities.add(track.entityId);
      });
    });
  });

/** View state is intentionally excluded from saved world geometry and scene revisions. */
export const viewportSchema = z.strictObject({
  center: pointSchema,
  zoom: z.number().positive().finite(),
  guides: z.strictObject({
    gridMetres: z.number().positive().finite(),
    editing: z.boolean(),
    presenting: z.boolean(),
    snapToGrid: z.boolean(),
    snapToObjects: z.boolean(),
  }),
});

export type TacticalScene = z.infer<typeof tacticalSceneSchema>;
export type Viewport = z.infer<typeof viewportSchema>;
export type TacticalEntity = z.infer<typeof entitySchema>;
export type MovementTrack = z.infer<typeof trackSchema>;
export type AnimationStage = z.infer<typeof stageSchema>;
export type TrainingArea = z.infer<typeof areaSchema>;
export type FieldContext = z.infer<typeof fieldContextSchema>;

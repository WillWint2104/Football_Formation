import { z } from "zod";
import {
  idSchema,
  recordShape,
  revisionRefSchema,
  revisionSchema,
  textSchema,
} from "./common";

export const timeZoneSchema = z.string().refine((zone) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return zone === "UTC" || zone.includes("/");
  } catch {
    return false;
  }
}, "Expected an IANA time zone");
const instantSchema = z.iso.datetime({ precision: 0 });
const eventShape = {
  ...recordShape,
  revision: revisionSchema,
  teamId: idSchema,
  title: textSchema,
  status: z.enum(["draft", "confirmed", "cancelled"]),
  localDate: z.iso.date(),
  // UTC instants avoid ambiguous wall-clock strings; local-time resolution is a later UI concern.
  startsAt: instantSchema.nullable(),
  endsAt: instantSchema.nullable(),
  timeZone: timeZoneSchema,
  venue: textSchema.nullable(),
  areaLabel: textSchema.nullable(),
};
export const calendarEventSchema = z
  .discriminatedUnion("kind", [
    z.strictObject({
      ...eventShape,
      kind: z.literal("training"),
      session: revisionRefSchema,
    }),
    z.strictObject({
      ...eventShape,
      kind: z.literal("testing"),
      session: revisionRefSchema.nullable(),
    }),
    z.strictObject({
      ...eventShape,
      kind: z.enum(["fixture", "meeting", "task", "other"]),
      session: z.null(),
    }),
  ])
  .superRefine((event, ctx) => {
    if (
      event.kind === "testing" &&
      event.status === "confirmed" &&
      !event.session
    )
      ctx.addIssue({
        code: "custom",
        path: ["session"],
        message: "Confirmed testing events require a testing session revision",
      });
    if (event.status === "confirmed" && (!event.startsAt || !event.endsAt))
      ctx.addIssue({
        code: "custom",
        path: ["startsAt"],
        message: "Confirmed events require both instants",
      });
    if (
      event.startsAt &&
      event.endsAt &&
      Date.parse(event.endsAt) <= Date.parse(event.startsAt)
    )
      ctx.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "End must follow start",
      });
    if (event.endsAt && !event.startsAt)
      ctx.addIssue({
        code: "custom",
        path: ["startsAt"],
        message: "An end requires a start",
      });
    if (
      event.startsAt &&
      instantSchema.safeParse(event.startsAt).success &&
      timeZoneSchema.safeParse(event.timeZone).success
    ) {
      const parts = new Intl.DateTimeFormat("en", {
        timeZone: event.timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(new Date(event.startsAt));
      const part = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((value) => value.type === type)?.value;
      if (`${part("year")}-${part("month")}-${part("day")}` !== event.localDate)
        ctx.addIssue({
          code: "custom",
          path: ["localDate"],
          message:
            "Date must match the start instant in the selected time zone",
        });
    }
  });
export type CalendarEvent = z.infer<typeof calendarEventSchema>;

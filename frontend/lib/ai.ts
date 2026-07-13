import OpenAI from "openai";
import type { EventInput } from "./types";

const MODEL = "gpt-4o-mini";

const eventJsonSchema = {
  type: "object",
  properties: {
    events: {
      type: "array",
      description: "All calendar events found in the text. May be empty.",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short event title" },
          note: {
            type: ["string", "null"],
            description: "Optional extra detail, else null",
          },
          date: {
            type: "string",
            description: "First occurrence, local date YYYY-MM-DD",
          },
          time: {
            type: ["string", "null"],
            description: "24h HH:MM, or null for an all-day event",
          },
          location: { type: ["string", "null"] },
          early_value: {
            type: ["integer", "null"],
            description:
              "How many early_unit before the event to send an advance reminder, or null. E.g. '提前3小时' → 3",
          },
          early_unit: {
            type: ["string", "null"],
            enum: ["minute", "hour", "day", "week", "month", null],
            description:
              "Unit for early_value: minute/hour/day/week/month. E.g. '提前3小时' → \"hour\"",
          },
          rrule: {
            type: ["string", "null"],
            description:
              'iCalendar RRULE for repeats, e.g. "FREQ=WEEKLY;BYDAY=MO", or null',
          },
          repeat_end_date: {
            type: ["string", "null"],
            description: "Local date YYYY-MM-DD the repeat ends, or null",
          },
          color: {
            type: "string",
            description: "Hex color that suits the event, e.g. #4CAF50",
          },
        },
        required: [
          "title",
          "note",
          "date",
          "time",
          "location",
          "early_value",
          "early_unit",
          "rrule",
          "repeat_end_date",
          "color",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["events"],
  additionalProperties: false,
} as const;

const DAY_NAMES_EN = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];
const DAY_NAMES_CN = ["日", "一", "二", "三", "四", "五", "六"];

function buildDateAnchors(today: string): string {
  const [y, m, d] = today.split("-").map(Number);
  const todayDate = new Date(Date.UTC(y, m - 1, d));
  const dow = todayDate.getUTCDay(); // 0=Sun … 6=Sat
  const todayName = DAY_NAMES_EN[dow];

  // Monday of this ISO week (week starts Monday).
  const daysFromMon = dow === 0 ? 6 : dow - 1;
  const thisMon = new Date(Date.UTC(y, m - 1, d - daysFromMon));
  const nextMon = new Date(thisMon.getTime() + 7 * 24 * 3600 * 1000);

  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (dt: Date) =>
    `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;

  const anchors = DAY_NAMES_EN.map((name, i) => {
    const dt = new Date(nextMon.getTime() + i * 24 * 3600 * 1000);
    return `  下周${DAY_NAMES_CN[i]}/Next ${name}: ${fmt(dt)}`;
  });

  return [
    `Today is ${today} (${todayName}).`,
    `Next-week (下周) anchors — copy these exact dates, do NOT compute "+7 days":`,
    ...anchors,
  ].join("\n");
}

function systemPrompt(today: string, timezone: string): string {
  const dateSection = buildDateAnchors(today);
  return [
    "You extract calendar events from natural language.",
    dateSection,
    `User timezone: ${timezone}.`,
    'Resolve relative dates using the anchors above. "下周X" = next calendar week\'s weekday X (use the table, not +7 days).',
    "Return every distinct event. If none, return an empty events array.",
    "Use 24h HH:MM time; null for all-day events.",
    "For advance reminders use early_value + early_unit: '提前3小时' → early_value:3, early_unit:\"hour\"; '提前2天' → early_value:2, early_unit:\"day\".",
    "Only set rrule for genuinely recurring events, using iCalendar RRULE syntax.",
    "Pick a pleasant, distinct hex color per event.",
  ].join("\n");
}

// Vendor-decoupled entry point. Swap the body to change providers.
export async function parseWithAI(
  text: string,
  timezone: string,
  today: string
): Promise<EventInput[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY env var");
  }
  const client = new OpenAI({ apiKey });

  const completion = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt(today, timezone) },
      { role: "user", content: text },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "save_events",
          description: "Save the events extracted from the user's text",
          parameters: eventJsonSchema as unknown as Record<string, unknown>,
        },
      },
    ],
    tool_choice: {
      type: "function",
      function: { name: "save_events" },
    },
  });

  const call = completion.choices[0]?.message?.tool_calls?.[0];
  if (!call || call.type !== "function") {
    return [];
  }

  const parsed = JSON.parse(call.function.arguments) as { events: EventInput[] };
  return parsed.events ?? [];
}

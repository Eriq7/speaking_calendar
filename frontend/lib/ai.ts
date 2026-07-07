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
          early_reminder: {
            type: ["integer", "null"],
            description: "Remind this many days early, or null",
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
          "early_reminder",
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

function systemPrompt(today: string, timezone: string): string {
  return [
    "You extract calendar events from natural language.",
    `Today is ${today} in timezone ${timezone}.`,
    "Resolve all relative dates (tomorrow, next Monday, in 3 days) against today.",
    "Return every distinct event you find. If none, return an empty events array.",
    "Use a 24h HH:MM time; set time to null for all-day events.",
    "Only set rrule for genuinely recurring events, using iCalendar RRULE syntax.",
    "Pick a pleasant, distinct hex color per event.",
  ].join(" ");
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

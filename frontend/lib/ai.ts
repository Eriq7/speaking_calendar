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
          title: {
            type: "string",
            description:
              "Self-contained event title: capture WHO is involved and WHAT will happen (and the purpose), so the user understands the reminder from the list alone without opening it. Include the people/context that make it meaningful — do NOT reduce it to a bare keyword. Front-load the most identifying info (who + what) at the start. Keep it to one concise line; match the user's input language.",
          },
          note: {
            type: ["string", "null"],
            description:
              "Only truly secondary details NOT already in the title — e.g. things to bring, sub-tasks, side notes. Null when the title already conveys everything essential; never restate the title here.",
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

function systemPrompt(today: string, timezone: string, now: string): string {
  const dateSection = buildDateAnchors(today);
  // now is "YYYY-MM-DDTHH:mm" — extract just HH:mm for display
  const currentTime = now.split("T")[1] ?? "00:00";
  return [
    "You extract calendar events from natural language.",
    "Title & note division (important):",
    "  • The title must be self-contained: include WHO is involved and WHAT will happen (and its purpose), so the user understands it from the list without opening details. Match the user's input language.",
    "  • Front-load the most identifying info (who + what) at the START of the title — the list may clamp long titles to 2 lines.",
    "  • Do NOT shrink the title to a bare keyword, but do NOT dump the entire raw sentence either — keep it to one concise line.",
    "  • Put ONLY secondary details (things to bring, sub-tasks, side notes) into note. If nothing secondary remains, note = null (do not restate the title).",
    "  • Example: '明天和女朋友见面，我要跟她去逛商场' → title:'和女朋友见面一起逛商场', note:null. (WRONG: title:'逛商场', note:'和女朋友见面'.)",
    "  • Example: '周五下午去 Koffler House 找导师聊选课，记得带成绩单' → title:'去Koffler House找导师聊选课', location:'Koffler House', note:'记得带成绩单'.",
    dateSection,
    `The current local time is ${currentTime} (HH:MM, 24h).`,
    `User timezone: ${timezone}.`,
    'Resolve relative dates using the anchors above. "下周X" = next calendar week\'s weekday X (use the table, not +7 days).',
    "For relative-time expressions, compute the target from the current date and time given above:",
    "  • '10分钟后'/'in 10 min' → add 10 minutes to current time; advance the date if crossing midnight.",
    "  • 'X小时后'/'in X hours' → add X hours; advance the date if crossing midnight.",
    "  • 'X天后'/'in X days' / '明天' (with no explicit clock time) → advance the date by X days, keep the current HH:MM as the time.",
    "  • If the user explicitly states a clock time ('下午3点'), use that time instead of the current time.",
    "Return every distinct event. If none, return an empty events array.",
    "Use 24h HH:MM time; null for all-day events.",
    "For advance reminders use early_value + early_unit: '提前3小时' → early_value:3, early_unit:\"hour\"; '提前2天' → early_value:2, early_unit:\"day\".",
    "Recurrence rule — when to set rrule (critical):",
    "  • ONLY set rrule when the user explicitly uses a repeat keyword: 每/every/每周/weekly/每天/daily/每月/monthly/重复/repeat or similar.",
    "  • If NO repeat keyword is present, treat each mentioned date/weekday as a separate one-time event (rrule=null). Example: '下周一到周四提醒我' has no repeat word → emit 4 individual events (Mon, Tue, Wed, Thu of next week), each with rrule=null.",
    "  • When rrule IS appropriate, use iCalendar RRULE syntax.",
    "Weekly recurrence — grouping rules (only when rrule is warranted):",
    "  • One recurring activity is ALWAYS a single event. If it happens on several weekdays, put ALL of them in one BYDAY. Never split the same activity into multiple events (do NOT emit BYDAY=MO,WE in one event and BYDAY=TU in another — that is wrong).",
    "  • Weekday ranges are inclusive: '每周一到周三' / 'Monday to Wednesday every week' means every weekday in the closed range. '每周一到周三' → BYDAY=MO,TU,WE (not MO,WE).",
    "  • Weekday lists map directly: '每周一、周四、周五' → BYDAY=MO,TH,FR (still one single event).",
    "  • Always list BYDAY codes in Monday→Sunday order: MO,TU,WE,TH,FR,SA,SU.",
    "  • Concrete example with repeat: '每周一到周三晚上6点去健身' → ONE event, rrule='FREQ=WEEKLY;BYDAY=MO,TU,WE', time=18:00.",
    "  • Concrete example WITHOUT repeat: '下周一到周四晚上6点健身' → FOUR one-time events (one per day, rrule=null each).",
    "Pick a pleasant, distinct hex color per event.",
  ].join("\n");
}

// Vendor-decoupled entry point. Swap the body to change providers.
export async function parseWithAI(
  text: string,
  timezone: string,
  today: string,
  now: string
): Promise<EventInput[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY env var");
  }
  const client = new OpenAI({ apiKey });

  const completion = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt(today, timezone, now) },
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

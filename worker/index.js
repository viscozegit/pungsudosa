import promptTemplate from "../docs/narration-prompt.md";

const allowedOrigins = new Set([
  "https://viscozegit.github.io",
  "http://localhost:4173"
]);

function corsHeaders(origin) {
  return {
    "access-control-allow-origin": allowedOrigins.has(origin) ? origin : "https://viscozegit.github.io",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "POST, OPTIONS",
    "vary": "Origin"
  };
}

function validate(input) {
  const name = String(input.name || "").trim();
  const birthDate = String(input.birthDate || "").trim();
  const birthTime = input.birthTime == null ? null : String(input.birthTime).trim();
  const address = String(input.address || "").trim();
  if (!name || name.length > 30) throw new Error("name_required");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) throw new Error("birth_date_invalid");
  if (birthTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(birthTime)) throw new Error("birth_time_invalid");
  if (!address || address.length > 200) throw new Error("address_required");
  return { name, birthDate, birthTime, address };
}

function lengthInstruction(length) {
  if (length === "short") return "1~2문장, 약 8~12초 분량";
  if (length === "medium") return "3~4문장, 약 18~22초 분량";
  return "35~45초 분량";
}

async function generateNarration(person, env) {
  const system = promptTemplate.replace("{{LENGTH_INSTRUCTION}}", lengthInstruction(env.NARRATION_LENGTH));
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "content-type": "application/json",
      "http-referer": "https://viscozegit.github.io/pungsudosa/",
      "x-title": "Pungsudosa MVP"
    },
    body: JSON.stringify({
      model: env.LLM_MODEL || "deepseek/deepseek-v4-flash",
      temperature: 0.9,
      messages: [{ role: "system", content: system }, { role: "user", content: JSON.stringify(person) }],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "pungsu_narration",
          strict: true,
          schema: {
            type: "object",
            properties: { narration: { type: "string", minLength: 1 } },
            required: ["narration"],
            additionalProperties: false
          }
        }
      }
    })
  });
  if (!response.ok) throw new Error(`llm_${response.status}`);
  const result = await response.json();
  const narration = JSON.parse(result.choices?.[0]?.message?.content || "{}").narration?.trim();
  if (!narration) throw new Error("narration_empty");
  return narration;
}

function alignmentToCues(alignment) {
  if (!alignment?.characters?.length) return [];
  const chars = alignment.characters;
  const starts = alignment.character_start_times_seconds || [];
  const ends = alignment.character_end_times_seconds || [];
  const words = [...chars.join("").matchAll(/\S+/g)];
  const cues = [];
  const maxCaptionChars = 20;
  let current = [];
  let startIndex = 0;
  const addCue = () => {
    if (!current.length) return;
    const endIndex = current[current.length - 1].end;
    cues.push({ start: starts[startIndex] ?? 0, end: ends[endIndex] ?? starts[endIndex] ?? 0, text: current.map(word => word.text).join(" ") });
    current = [];
  };
  for (const match of words) {
    const word = { text: match[0], start: match.index, end: match.index + match[0].length - 1 };
    const currentLength = current.reduce((length, item) => length + item.text.length, 0);
    if (current.length && currentLength + 1 + word.text.length > maxCaptionChars) addCue();
    if (!current.length) startIndex = word.start;
    current.push(word);
    if (/[.!?。！？…]$/.test(word.text)) addCue();
  }
  addCue();
  return cues.filter(cue => cue.end > cue.start);
}

function splitNarration(narration) {
  const sentences = narration.match(/[^.!?。！？…]+[.!?。！？…]+|[^.!?。！？…]+$/g) || [narration];
  const clean = sentences.map(sentence => sentence.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (clean.length < 2) return clean;
  const targetLength = clean.reduce((sum, sentence) => sum + sentence.length, 0) / 2;
  let firstLength = 0;
  let splitAt = 1;
  for (let index = 0; index < clean.length - 1; index += 1) {
    const nextLength = firstLength + clean[index].length;
    if (index > 0 && Math.abs(targetLength - firstLength) < Math.abs(targetLength - nextLength)) break;
    firstLength = nextLength;
    splitAt = index + 1;
  }
  return [clean.slice(0, splitAt).join(" "), clean.slice(splitAt).join(" ")];
}

async function generateVoice(text, env) {
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(env.ELEVENLABS_VOICE_ID)}/with-timestamps`, {
    method: "POST",
    headers: { "xi-api-key": env.ELEVENLABS_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({
      text,
      model_id: "eleven_flash_v2_5",
      language_code: "ko",
      voice_settings: { stability: 0.48, similarity_boost: 0.78, style: 0.25, use_speaker_boost: true }
    })
  });
  if (!response.ok) throw new Error(`tts_${response.status}`);
  const data = await response.json();
  return { audioBase64: data.audio_base64, audioMimeType: "audio/mpeg", cues: alignmentToCues(data.alignment) };
}

function sseEvent(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function streamReading(person, env, origin) {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  const send = (event, data) => writer.write(encoder.encode(sseEvent(event, data)));
  (async () => {
    try {
      const narration = await generateNarration(person, env);
      await send("meta", { narration, name: person.name, address: person.address });
      const jobs = splitNarration(narration).map(part => generateVoice(part, env));
      for (const job of jobs) {
        const voice = await job;
        await send("chunk", voice);
      }
      await send("done", {});
    } catch (error) {
      await send("error", { message: "나레이션을 준비하지 못했어요. 다시 시도해 주세요." });
    } finally {
      await writer.close();
    }
  })();
  return new Response(readable, { headers: { ...corsHeaders(origin), "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache" } });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("origin") || "";
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/api/reading/stream") return new Response("Not found", { status: 404, headers: corsHeaders(origin) });
    if (!allowedOrigins.has(origin)) return new Response("Forbidden", { status: 403, headers: corsHeaders(origin) });
    try {
      return streamReading(validate(await request.json()), env, origin);
    } catch {
      return new Response(JSON.stringify({ error: "invalid_input" }), { status: 400, headers: { ...corsHeaders(origin), "content-type": "application/json" } });
    }
  }
};

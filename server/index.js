import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const port = Number(process.env.PORT || 4173);
const mockMode = process.env.MOCK_MODE !== "false" || !process.env.OPENROUTER_API_KEY || !process.env.ELEVENLABS_API_KEY || !process.env.ELEVENLABS_VOICE_ID;

const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET,POST,OPTIONS" };
const send = (res, status, body, type = "application/json; charset=utf-8") => { res.writeHead(status, { ...headers, "content-type": type }); res.end(type.startsWith("application/json") ? JSON.stringify(body) : body); };

function readJson(req) {
  return new Promise((resolveBody, reject) => {
    let raw = "";
    req.on("data", chunk => { raw += chunk; if (raw.length > 100_000) reject(new Error("payload_too_large")); });
    req.on("end", () => { try { resolveBody(JSON.parse(raw || "{}")); } catch { reject(new Error("invalid_json")); } });
    req.on("error", reject);
  });
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

async function generateNarration(person) {
  const lengthInstruction = process.env.NARRATION_LENGTH === "short" ? "1~2문장, 약 8~12초 분량" : process.env.NARRATION_LENGTH === "medium" ? "3~4문장, 약 18~22초 분량" : "35~45초 분량";
  const system = `당신은 카메라 앞에서 한 사람에게 직접 말하는 도사다. 입력된 이름, 생년월일, 태어난 시간, 성별, 주소를 바탕으로 ${lengthInstruction}의 자연스러운 한국어 나레이션을 작성한다. 이름은 1회 자연스럽게 부르고, 주소는 실제 지역이나 장소처럼 지칭한다. 첫 문장에서 이 장소가 잘 맞는지 또는 조심해야 하는지 명확히 판정한다. 이어서 이 장소에서 지금 해야 할 행동 하나, 절대 피해야 할 행동 하나, 운을 위해 가지고 다니거나 놓아둘 물건 하나를 구체적으로 말한다. 사용자의 성향을 한 문장으로 단정하고, 그 성향 때문에 이 장소가 왜 좋거나 나쁜지 연결한다. "기운", "흐름", "에너지", "천천히", "좋을 수 있다"처럼 두루뭉술한 말은 쓰지 않는다. 행동과 물건은 실제로 바로 할 수 있게 말한다. 실제 이론이나 근거는 설명하지 말고, 사주와 풍수를 읽은 듯 친근하지만 단호한 구어체로 말한다. 마지막 문장은 반드시 "더 듣고 싶으면 복채 내놔라."로 끝낸다. 반드시 JSON으로만 반환하며 narration 문자열 하나만 포함한다.`;
  const user = JSON.stringify(person);
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST", headers: { authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "content-type": "application/json", "http-referer": "https://viscozegit.github.io/pungsudosa/", "x-title": "Pungsudosa MVP" }, body: JSON.stringify({ model: process.env.LLM_MODEL || "deepseek/deepseek-v4-flash", temperature: 0.9, messages: [{ role: "system", content: system }, { role: "user", content: user }], response_format: { type: "json_schema", json_schema: { name: "pungsu_narration", strict: true, schema: { type: "object", properties: { narration: { type: "string", minLength: 1 } }, required: ["narration"], additionalProperties: false } } } }) });
  if (!response.ok) throw new Error(`llm_${response.status}`);
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  const parsed = JSON.parse(content || "{}");
  if (!parsed.narration) throw new Error("narration_empty");
  return parsed.narration.trim();
}

function alignmentToCues(alignment, narration) {
  if (!alignment?.characters?.length) return [];
  const chars = alignment.characters;
  const starts = alignment.character_start_times_seconds || [];
  const ends = alignment.character_end_times_seconds || [];
  const cues = [];
  let startIndex = 0;
  for (let i = 0; i < chars.length; i += 1) {
    if (/[.!?。！？…]/.test(chars[i]) || i - startIndex > 46) {
      const text = chars.slice(startIndex, i + 1).join("").trim();
      if (text) cues.push({ start: starts[startIndex] ?? 0, end: ends[i] ?? starts[i] ?? 0, text });
      startIndex = i + 1;
    }
  }
  const tail = chars.slice(startIndex).join("").trim();
  if (tail) cues.push({ start: starts[startIndex] ?? 0, end: ends[chars.length - 1] ?? 0, text: tail });
  return cues.filter(cue => cue.end > cue.start);
}

function splitNarration(narration) {
  const parts = narration.match(/[^.!?。！？…]+[.!?。！？…]+|[^.!?。！？…]+$/g) || [narration];
  const clean = parts.map(part => part.trim()).filter(Boolean);
  if (clean.length < 2) return clean;
  const midpoint = Math.ceil(clean.length / 2);
  return [clean.slice(0, midpoint).join(" "), clean.slice(midpoint).join(" ")];
}

async function generateVoice(narration) {
  const voice = process.env.ELEVENLABS_VOICE_ID;
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}/with-timestamps`, { method: "POST", headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY, "content-type": "application/json" }, body: JSON.stringify({ text: narration, model_id: "eleven_flash_v2_5", language_code: "ko", voice_settings: { stability: 0.48, similarity_boost: 0.78, style: 0.25, use_speaker_boost: true } }) });
  if (!response.ok) throw new Error(`tts_${response.status}`);
  const data = await response.json();
  return { audioBase64: data.audio_base64, audioMimeType: "audio/mpeg", cues: alignmentToCues(data.alignment, narration) };
}

async function createReading(person) {
  if (mockMode) return { narration: `${person.name} 씨, ${person.address} 이 자리를 보니까 흥미로운 흐름이 보이네요. 이곳에서는 서두르기보다 본인에게 맞는 기회를 골라 잡는 게 중요해요. 오늘은 이 자리에서 무엇을 시작할지 천천히 살펴보세요.`, audioUrl: "/assets/ipark.mp3", cues: [], mock: true };
  const narration = await generateNarration(person);
  const voice = await generateVoice(narration);
  return { narration, audioBase64: voice.audioBase64, audioMimeType: voice.audioMimeType, cues: voice.cues, mock: false };
}

function sendEvent(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

async function streamReading(res, person) {
  res.writeHead(200, { ...headers, "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache", connection: "keep-alive" });
  if (mockMode) {
    const narration = `${person.name} 씨, ${person.address} 이 자리를 보니까 흥미로운 흐름이 보이네요.`;
    sendEvent(res, "meta", { narration, name: person.name, address: person.address });
    sendEvent(res, "chunk", { audioUrl: "/assets/ipark.mp3", cues: [] });
    sendEvent(res, "done", {}); res.end(); return;
  }
  const narration = await generateNarration(person);
  sendEvent(res, "meta", { narration, name: person.name, address: person.address });
  const parts = splitNarration(narration);
  const voiceJobs = parts.map(part => generateVoice(part));
  for (const voiceJob of voiceJobs) {
    const voice = await voiceJob;
    sendEvent(res, "chunk", { audioBase64: voice.audioBase64, audioMimeType: voice.audioMimeType, cues: voice.cues });
  }
  sendEvent(res, "done", {}); res.end();
}

async function serveStatic(req, res, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const file = normalize(join(root, requested));
  if (!file.startsWith(root)) return send(res, 403, { error: "forbidden" });
  try { const body = await readFile(file); const type = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".jpg": "image/jpeg", ".mp3": "audio/mpeg", ".mp4": "video/mp4" }[extname(file)] || "application/octet-stream"; send(res, 200, body, type); } catch { send(res, 404, { error: "not_found" }); }
}

createServer(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, "", "text/plain");
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/api/health") return send(res, 200, { ok: true, mock: mockMode });
  if (url.pathname === "/api/reading" && req.method === "POST") {
    try { const person = validate(await readJson(req)); return send(res, 200, await createReading(person)); } catch (error) { const code = error.message || "generation_failed"; const inputErrors = new Set(["name_required", "birth_date_invalid", "birth_time_invalid", "address_required"]); return send(res, inputErrors.has(code) ? 400 : 502, { error: code, message: inputErrors.has(code) ? "입력 내용을 확인해 주세요." : "나레이션을 준비하지 못했어요. 다시 시도해 주세요." }); }
  }
  if (url.pathname === "/api/reading/stream" && req.method === "POST") {
    try { const person = validate(await readJson(req)); await streamReading(res, person); } catch (error) { if (!res.headersSent) { const code = error.message || "generation_failed"; send(res, 502, { error: code, message: "나레이션을 준비하지 못했어요. 다시 시도해 주세요." }); } else { res.end(); } }
    return;
  }
  return serveStatic(req, res, url.pathname);
}).listen(port, () => console.log(`Pungsudosa MVP v2 listening on http://localhost:${port}${mockMode ? " (mock mode)" : ""}`));

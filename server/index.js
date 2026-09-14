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
  const system = `당신은 카메라 앞에서 한 사람에게 직접 말하는 젊은 한국 여성 도사다. 입력한 이름과 주소를 바탕으로 35~45초 분량의 자연스러운 한국어 나레이션을 작성한다. 보고서나 목록이 아니라 호기심을 이어가는 구어체로 말한다. 이름은 1~2회 자연스럽게 부르고, 장소는 주소의 지역과 장소로 지칭한다. 하나의 핵심 판정으로 끝낸다. 반드시 JSON으로만 반환하며 narration 문자열 하나만 포함한다.`;
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

async function serveStatic(req, res, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const file = normalize(join(root, requested));
  if (!file.startsWith(root)) return send(res, 403, { error: "forbidden" });
  try { const body = await readFile(file); const type = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".mp3": "audio/mpeg", ".mp4": "video/mp4" }[extname(file)] || "application/octet-stream"; send(res, 200, body, type); } catch { send(res, 404, { error: "not_found" }); }
}

createServer(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, "", "text/plain");
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/api/health") return send(res, 200, { ok: true, mock: mockMode });
  if (url.pathname === "/api/reading" && req.method === "POST") {
    try { const person = validate(await readJson(req)); return send(res, 200, await createReading(person)); } catch (error) { const code = error.message || "generation_failed"; const inputErrors = new Set(["name_required", "birth_date_invalid", "birth_time_invalid", "address_required"]); return send(res, inputErrors.has(code) ? 400 : 502, { error: code, message: inputErrors.has(code) ? "입력 내용을 확인해 주세요." : "나레이션을 준비하지 못했어요. 다시 시도해 주세요." }); }
  }
  return serveStatic(req, res, url.pathname);
}).listen(port, () => console.log(`Pungsudosa MVP v2 listening on http://localhost:${port}${mockMode ? " (mock mode)" : ""}`));

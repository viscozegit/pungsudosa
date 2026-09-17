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

async function loadNarrationPrompt(lengthInstruction) {
  const promptPath = join(root, "docs", "narration-prompt.md");
  const template = await readFile(promptPath, "utf8");
  return template.replace("{{LENGTH_INSTRUCTION}}", lengthInstruction);
}

async function generateNarration(person) {
  const lengthInstruction = process.env.NARRATION_LENGTH === "short" ? "1~2문장, 약 8~12초 분량" : process.env.NARRATION_LENGTH === "medium" ? "3~4문장, 약 18~22초 분량" : "35~45초 분량";
  const system = await loadNarrationPrompt(lengthInstruction);
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
  const maxCaptionChars = 20;
  const cues = [];
  const text = chars.join("");
  const words = [...text.matchAll(/\S+/g)];
  let current = [];
  let startIndex = 0;

  const addCue = () => {
    if (!current.length) return;
    const endIndex = current[current.length - 1].end;
    cues.push({
      start: starts[startIndex] ?? 0,
      end: ends[endIndex] ?? starts[endIndex] ?? 0,
      text: current.map(word => word.text).join(" ")
    });
    current = [];
  };

  for (const match of words) {
    const word = { text: match[0], start: match.index, end: match.index + match[0].length - 1 };
    const currentLength = current.reduce((length, item) => length + item.text.length, 0);
    const spacing = current.length ? 1 : 0;

    // 어절을 넘기기 전에 먼저 자르고, 한 자막은 최대 두 줄(약 20자)로 유지한다.
    if (current.length && currentLength + spacing + word.text.length > maxCaptionChars) addCue();
    if (!current.length) startIndex = word.start;
    current.push(word);

    // 문장부호가 오면 바로 끊는다. 따라서 자막은 단어와 문장 경계에서만 바뀐다.
    if (/[.!?。！？…]$/.test(word.text)) addCue();
  }
  addCue();
  return cues.filter(cue => cue.end > cue.start);
}

function splitNarration(narration) {
  // TTS 요청은 문장의 한가운데를 절대 자르지 않는다. 마침표가 없는 응답은
  // 하나의 요청으로 유지해 부자연스러운 중간 끊김을 막는다.
  const sentences = narration.match(/[^.!?。！？…]+[.!?。！？…]+|[^.!?。！？…]+$/g) || [narration];
  const clean = sentences.map(sentence => sentence.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (clean.length < 2) return clean;

  // 두 덩어리의 길이가 너무 차이 나지 않게 하되, 분할 지점은 언제나 문장 끝이다.
  const totalLength = clean.reduce((sum, sentence) => sum + sentence.length, 0);
  const targetLength = totalLength / 2;
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

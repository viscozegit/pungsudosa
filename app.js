const videos = ["assets/video_01.mp4", "assets/video_02.mp4"];
const home = document.querySelector("#home");
const loading = document.querySelector("#loading");
const form = document.querySelector("#reading-form");
const formError = document.querySelector("#form-error");
const viewer = document.querySelector("#viewer");
const videoLayers = [...document.querySelectorAll(".oracle-video")];
const audio = document.querySelector("#narration");
const caption = document.querySelector("#caption");
const viewerName = document.querySelector("#viewer-name");
const placeName = document.querySelector("#place-name");
const playToggle = document.querySelector("#play-toggle");
let cueTimes = [];
let videoIndex = 0;
let activeVideo = videoLayers[0];
let videoTransitionTimer;
let controlsTimer;
let selectedGender = null;

function parseBirthDateTime(dateValue, timeValue, unknownTime) {
  const dateDigits = dateValue.replace(/\D/g, "");
  if (dateDigits.length < 8) return null;
  const birthDate = `${dateDigits.slice(0, 4)}-${dateDigits.slice(4, 6)}-${dateDigits.slice(6, 8)}`;
  const timeDigits = timeValue.replace(/\D/g, "");
  const birthTime = unknownTime || timeDigits.length < 4 ? null : `${timeDigits.slice(0, 2)}:${timeDigits.slice(2, 4)}`;
  return { birthDate, birthTime };
}

function updateCaption() {
  const cue = cueTimes.find(({ start, end }) => audio.currentTime >= start && audio.currentTime < end);
  caption.textContent = cue?.text ?? "";
}
function showControls() {
  viewer.classList.add("controls-visible");
  clearTimeout(controlsTimer);
  if (!viewer.classList.contains("is-paused")) controlsTimer = setTimeout(() => viewer.classList.remove("controls-visible"), 1600);
}
function setPaused(paused) {
  viewer.classList.toggle("is-paused", paused);
  playToggle.setAttribute("aria-pressed", String(paused));
  playToggle.setAttribute("aria-label", paused ? "재생" : "일시정지");
  if (paused) { audio.pause(); activeVideo.pause(); showControls(); return; }
  audio.play().catch(() => showControls());
  activeVideo.play().catch(() => showControls());
  showControls();
}
function standbyVideo() {
  return videoLayers.find(item => item !== activeVideo);
}
function loadVideo(videoElement, index) {
  if (videoElement.dataset.videoIndex === String(index)) return;
  videoElement.pause();
  videoElement.src = videos[index];
  videoElement.dataset.videoIndex = String(index);
  videoElement.load();
}
function preloadNextVideo() {
  loadVideo(standbyVideo(), (videoIndex + 1) % videos.length);
}
function playNextVideo() {
  if (audio.paused || audio.ended) return;
  const nextIndex = (videoIndex + 1) % videos.length;
  const nextVideo = standbyVideo();
  const beginTransition = () => {
    if (audio.paused || audio.ended) return;
    nextVideo.currentTime = 0;
    nextVideo.play().then(() => {
      activeVideo.classList.remove("is-active");
      nextVideo.classList.add("is-active");
      activeVideo = nextVideo;
      videoIndex = nextIndex;
      clearTimeout(videoTransitionTimer);
      videoTransitionTimer = setTimeout(preloadNextVideo, 380);
    }).catch(() => showControls());
  };
  if (nextVideo.dataset.videoIndex !== String(nextIndex)) loadVideo(nextVideo, nextIndex);
  if (nextVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) beginTransition();
  else nextVideo.addEventListener("canplay", beginTransition, { once: true });
}
function resetViewer() {
  audio.pause(); audio.removeAttribute("src"); audio.load();
  clearTimeout(videoTransitionTimer);
  videoLayers.forEach((item, index) => {
    item.pause(); item.removeAttribute("src"); item.removeAttribute("data-video-index"); item.load();
    item.classList.toggle("is-active", index === 0);
  });
  activeVideo = videoLayers[0];
  caption.textContent = ""; cueTimes = [];
  viewer.classList.remove("is-paused", "controls-visible");
  clearTimeout(controlsTimer);
}
function startViewer(reading, person) {
  viewerName.textContent = person.name;
  placeName.textContent = person.address;
  cueTimes = Array.isArray(reading.cues) ? reading.cues : [];
  videoIndex = 0;
  activeVideo = videoLayers[0];
  activeVideo.classList.add("is-active");
  standbyVideo().classList.remove("is-active");
  loadVideo(activeVideo, videoIndex);
  preloadNextVideo();
  if (reading.audioBase64) audio.src = `data:${reading.audioMimeType || "audio/mpeg"};base64,${reading.audioBase64}`;
  else if (reading.audioUrl) audio.src = reading.audioUrl;
  else throw new Error("audio_missing");
  home.hidden = true;
  viewer.hidden = false;
  loading.hidden = true;
  audio.onloadedmetadata = updateCaption;
  audio.play().catch(() => showControls());
  activeVideo.play().catch(() => showControls());
  showControls();
}
form.addEventListener("submit", async event => {
  event.preventDefault();
  formError.textContent = "";
  const parsedBirth = parseBirthDateTime(form.birthDateInput.value, form.birthTimeInput.value, document.querySelector("#unknown-time").checked);
  const person = { name: form.name.value.trim(), ...parsedBirth, address: form.address.value.trim(), gender: selectedGender };
  if (!person.name || !parsedBirth || !person.address) { formError.textContent = "이름, 생년월일, 주소를 입력해 주세요."; return; }
  form.querySelector("button[type=submit]").disabled = true;
  loading.hidden = false;
  try {
    const response = await fetch("/api/reading", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(person) });
    const reading = await response.json();
    if (!response.ok) throw new Error(reading.message || "generation_failed");
    startViewer(reading, person);
  } catch (error) {
    loading.hidden = true;
    formError.textContent = error.message || "나레이션을 준비하지 못했어요. 다시 시도해 주세요.";
  } finally { form.querySelector("button[type=submit]").disabled = false; }
});
document.querySelectorAll(".gender-button").forEach(button => button.addEventListener("click", () => {
  document.querySelectorAll(".gender-button").forEach(item => item.classList.remove("selected"));
  button.classList.add("selected");
  selectedGender = button.dataset.gender;
}));
document.querySelector("#unknown-time").addEventListener("change", event => {
  const input = document.querySelector("#birth-time-input");
  input.disabled = event.target.checked;
  input.placeholder = event.target.checked ? "시간을 입력하지 않음" : "태어난 시간 입력 (예: 13:20)";
});
document.querySelector("#birth-date-input").addEventListener("input", event => {
  const digits = event.target.value.replace(/\D/g, "").slice(0, 8);
  let formatted = digits;
  if (digits.length > 4) formatted = `${digits.slice(0, 4)}.${digits.slice(4)}`;
  if (digits.length > 6) formatted = `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6)}`;
  event.target.value = formatted;
  if (digits.length === 8) document.querySelector("#birth-time-input").focus();
});
document.querySelector("#birth-time-input").addEventListener("input", event => {
  const digits = event.target.value.replace(/\D/g, "").slice(0, 12);
  let formatted = digits;
  if (digits.length > 2) formatted = `${digits.slice(0, 2)}:${digits.slice(2)}`;
  event.target.value = formatted;
});
audio.addEventListener("timeupdate", updateCaption);
audio.addEventListener("ended", () => { caption.textContent = ""; activeVideo.pause(); });
videoLayers.forEach(item => {
  item.addEventListener("ended", () => { if (item === activeVideo) playNextVideo(); });
  item.addEventListener("click", () => setPaused(!viewer.classList.contains("is-paused")));
});
playToggle.addEventListener("click", event => { event.stopPropagation(); setPaused(!viewer.classList.contains("is-paused")); });
document.querySelector("#close-button").addEventListener("click", () => { resetViewer(); viewer.hidden = true; home.hidden = false; });

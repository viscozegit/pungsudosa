const places = {
  ipark: {
    name: "부천 아이파크2단지",
    audio: "assets/ipark.mp3",
    cues: [
      [0, .55, "어디 보자."], [.55, 1.62, "현경 씨는 참 이상해."], [1.62, 4.54, "겉으로는 웬만한 일에 흔들리지 않는 것 같은데"], [4.54, 6.78, "속에서는 혼자 별 생각을 다 해."], [6.78, 10.58, "특히 사람 일은 끝난 것도 마음에서 다시 꺼내보는 사람이야."], [10.58, 12.7, "그런데 여기 약대동을 보니까…"], [12.7, 15.46, "음… 나는 이 자리, 현경 씨한테 괜찮게 봐."], [15.46, 17.98, "여기가 원래 확 치고 나가는 땅은 아니야."], [17.98, 22.46, "풍수로 보면 기운이 천천히 모이고 사람을 눌러 앉히는 쪽에 가까워."], [22.46, 23.9, "그러니까 재미있는 게,"], [23.9, 27.42, "현경 씨 머리는 자꾸 움직이려고 하는데 이 땅은 자꾸 앉으라고 해."], [27.42, 29.3, "처음엔 그게 답답할 수도 있어."], [29.3, 34.02, "그런데 오래 있을수록 사람도 정리되고, 돈도 덜 새고, 마음도 좀 편해져."], [34.02, 36.82, "내가 현경 씨라면 여기서 뭔가 크게 터뜨리려고 안 해."], [36.82, 39.98, "여기는 올라가는 자리가 아니라 무너지지 않는 자리야."], [39.98, 41.47, "그게 생각보다 큰 복이야."]
    ]
  },
  buillo: {
    name: "상동 부일로",
    audio: "assets/buillo.mp3",
    cues: [
      [0, .8, "현경 씨."], [.8, 1.75, "여기는 좀 이상하다."], [1.75, 3.25, "오래된 인연 하나가 보여."], [3.25, 5.04, "꼭 사람이라는 뜻은 아니야."], [5.04, 9.36, "사람일 수도 있고, 일일 수도 있고, 몇 년째 끌고 있는 고민일 수도 있어."], [9.36, 10.6, "현경 씨가 원래 그래."], [10.6, 13.64, "한번 내 거라고 생각하면 끝난 것도 쉽게 못 버려."], [13.64, 14.7, "그런데 이 자리는 반대야."], [14.7, 21.24, "이쪽 땅은 예전에 논밭이던 곳을 크게 바꿔서 새로운 도시를 만든 곳이거든."], [21.24, 25.52, "풍수로 보면 묵은 기운보다 새 기운이 센 자리야."], [25.52, 28.86, "그러니까 여기 오래 있으면 이상하게 정리가 시작돼."], [28.86, 31.85, "사람이 떨어져 나갈 수도 있고, 하던 일을 갑자기 접을 수도 있어."], [31.85, 32.58, "그때 겁먹지 마."], [32.58, 33.85, "나쁜 게 빠지는 걸 수도 있으니까."], [33.85, 36.2, "나는 현경 씨한테 이 자리를 뭘 얻는 곳이라고 안 봐."], [36.2, 36.8, "하나 버려야 하나 들어오는 자리."], [36.8, 37.34, "그렇게 보여."]
    ]
  },
  sinjungdong: {
    name: "신중동 푸르지오시티",
    audio: "assets/sinjungdong.mp3",
    cues: [
      [0, .65, "어디 보자."], [.65, 2.56, "현경 씨는 돈을 못 버는 사람이 아니야."], [2.56, 5.68, "오히려 기회가 보이면 남들보다 빨리 움직이는 쪽이지."], [5.68, 6.58, "근데 이상하게…"], [6.58, 9.28, "벌 때는 버는데, 돈이 가만히 있지를 않아."], [9.28, 12.12, "자, 그런데 이 자리를 보니까 더 재미있네."], [12.12, 15.48, "신중동 이쪽은 원래 낮은 땅에 물이 모이고 흘러가던 곳이야."], [15.48, 17.18, "풍수에서는 물을 재물로 보거든."], [17.18, 18.05, "그런데 잘 들어."], [18.05, 20.2, "물이 많다고 부자가 되는 게 아니야."], [20.2, 23.92, "흐르는 물은 돈을 데려오기도 하지만 그만큼 빨리 데리고 나가기도 해."], [23.92, 27.08, "그런데 현경 씨도 움직이는 사람이고 이 땅도 움직이는 땅이야."], [27.08, 28.6, "그러니까 둘이 만나면 빨라져."], [28.6, 31.9, "사람이 붙고, 일이 생기고, 돈 될 만한 것도 자꾸 눈에 들어와."], [31.9, 32.58, "좋지."], [32.58, 35.08, "근데 욕심내서 다 잡으려고 하면 안 돼."], [35.08, 38.84, "내가 현경 씨라면 여기서는 버는 것보다 남기는 연습을 할 거야."], [38.84, 40.88, "이 자리는 돈이 없는 자리가 아니야."], [40.88, 43, "돈이 너무 잘 움직이는 자리야."]
    ]
  }
};

const videos = ["assets/video_01.mp4", "assets/video_02.mp4", "assets/video_03.mp4"];
const home = document.querySelector("#home");
const viewer = document.querySelector("#viewer");
const video = document.querySelector("#oracle-video");
const audio = document.querySelector("#narration");
const caption = document.querySelector("#caption");
const placeName = document.querySelector("#place-name");
const playToggle = document.querySelector("#play-toggle");
let activePlace;
let cueTimes = [];
let videoIndex = 0;
let controlsTimer;

function buildTimeline(cues) { return cues.map(([start, end, text]) => ({ start, end, text })); }
function updateCaption() {
  const cue = cueTimes.find(({ start, end }) => audio.currentTime >= start && audio.currentTime < end);
  caption.textContent = cue?.text ?? "";
}
function playNextVideo() {
  videoIndex = (videoIndex + 1) % videos.length;
  video.src = videos[videoIndex];
  video.play().catch(() => {});
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
  if (paused) { audio.pause(); video.pause(); showControls(); return; }
  audio.play().catch(() => {});
  video.play().catch(() => {});
  showControls();
}
function stopSession() {
  audio.pause(); audio.currentTime = 0;
  video.pause(); video.removeAttribute("src"); video.load();
  caption.textContent = "";
  viewer.classList.remove("is-paused", "controls-visible");
  clearTimeout(controlsTimer);
}
function startSession(id) {
  activePlace = places[id];
  cueTimes = [];
  placeName.textContent = activePlace.name;
  home.hidden = true;
  viewer.hidden = false;
  viewer.classList.remove("is-paused");
  videoIndex = 0;
  video.src = videos[videoIndex];
  audio.src = activePlace.audio;
  audio.onloadedmetadata = () => { cueTimes = buildTimeline(activePlace.cues); updateCaption(); };
  audio.play().catch(() => {});
  video.play().catch(() => {});
  showControls();
}
document.querySelectorAll(".place-button").forEach(button => button.addEventListener("click", () => startSession(button.dataset.place)));
audio.addEventListener("timeupdate", updateCaption);
audio.addEventListener("ended", () => { caption.textContent = ""; video.pause(); });
video.addEventListener("ended", () => { if (!audio.paused && !audio.ended) playNextVideo(); });
playToggle.addEventListener("click", event => { event.stopPropagation(); setPaused(!viewer.classList.contains("is-paused")); });
video.addEventListener("click", () => setPaused(!viewer.classList.contains("is-paused")));
document.querySelector("#close-button").addEventListener("click", () => { stopSession(); viewer.hidden = true; home.hidden = false; });

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const counterEl = document.getElementById("removedCount");
const levelEl = document.getElementById("speedLevel");

// Dimensiones de la pantalla actual
let window_width = window.innerWidth;
let window_height = window.innerHeight;
canvas.width = window_width;
canvas.height = window_height;

window.addEventListener("resize", () => {
  window_width = window.innerWidth;
  window_height = window.innerHeight;
  canvas.width = window_width;
  canvas.height = window_height;
});

// ---------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------
const TOTAL_OBJECTS = 25;        // Siempre deben existir exactamente 25 objetos
const MIN_BOUNCE_SPEED = 3;      // Si el rebote es más débil que esto, deja de rebotar
const FADE_FRAMES = 40;          // Cuadros que tarda en desaparecer al dejar de rebotar

// Imagen del cursor (pico) y su tamaño en pantalla
const CURSOR_SRC = "img/pico.png";
const CURSOR_SIZE = 48;
// Punto del pico que "hace clic" (0 a 1 dentro de la imagen). Ajústalo si quieres.
const CURSOR_HOTSPOT = { x: 0.7, y: 0.3 };

// Sonido al picar un mineral (si el archivo no existe, se usa un sonido generado)
const SOUND_SRC = "sonido.mp3";

// Minerales con su imagen y colores para los efectos
const ORES = {
  diamante: {
    src: "https://minecraft.wiki/images/Diamond_JE3_BE3.png?986a9",
    fx: ["#4fe3d6", "#d4fffb", "#1b8f95"], text: "#4fe3d6"
  },
  esmeralda: {
    src: "https://minecraft.wiki/images/Emerald_JE3_BE3.png?4c5f3",
    fx: ["#27d65b", "#8dffae", "#128a35"], text: "#27d65b"
  },
  oro: {
    src: "img/oro.png",
    fx: ["#fcee4b", "#f5c518", "#fff7a8"], text: "#fcee4b"
  },
  hierro: {
    src: "img/hierro.png",
    fx: ["#d8d8d8", "#ffffff", "#9a9a9a"], text: "#e8e8e8"
  },
  carbon: {
    src: "img/carbon.png",
    fx: ["#2e2e2e", "#6b6b6b", "#1c1c1c"], text: "#ffffff"
  }
};
const TYPES = Object.keys(ORES);

// Precarga de las imágenes
TYPES.forEach((type) => {
  const img = new Image();
  ORES[type].failed = false;
  img.onerror = () => { ORES[type].failed = true; };
  img.src = ORES[type].src;
  ORES[type].img = img;
});

// Reglas de velocidad según el contador de objetos eliminados
const SPEED_LEVELS = {
  inicial: { key: "inicial", label: "Velocidad inicial", factor: 1 },
  media:   { key: "media",   label: "Velocidad media",   factor: 1.6 },
  alta:    { key: "alta",    label: "Velocidad alta",    factor: 2.3 }
};

let removedCount = 0;
let currentLevelKey = "inicial";

const random = (min, max) => Math.random() * (max - min) + min;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function getSpeedLevel() {
  if (removedCount > 20) return SPEED_LEVELS.alta;
  if (removedCount > 10) return SPEED_LEVELS.media;
  return SPEED_LEVELS.inicial;
}

// ---------------------------------------------------------------
// Sonido
// ---------------------------------------------------------------
const clickSound = new Audio(SOUND_SRC);
clickSound.preload = "auto";
let soundFileOk = true;
clickSound.addEventListener("error", () => { soundFileOk = false; });

let audioCtx = null;

// Sonido de respaldo: golpe seco sobre piedra, generado con Web Audio
function playSynthSound() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const t = audioCtx.currentTime;

    // Ráfaga de ruido filtrado (el "crujido")
    const length = Math.floor(audioCtx.sampleRate * 0.18);
    const buffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.5);
    }
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    const filter = audioCtx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 900 + Math.random() * 500;
    filter.Q.value = 0.8;
    const noiseGain = audioCtx.createGain();
    noiseGain.gain.value = 0.7;
    noise.connect(filter).connect(noiseGain).connect(audioCtx.destination);
    noise.start(t);

    // Golpe grave corto
    const osc = audioCtx.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.08);
    const oscGain = audioCtx.createGain();
    oscGain.gain.setValueAtTime(0.25, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(oscGain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.1);
  } catch (e) {
    // Si el navegador no permite audio, simplemente no suena
  }
}

function playClickSound() {
  if (soundFileOk) {
    // Se clona para que varios clics seguidos puedan sonar a la vez
    const s = clickSound.cloneNode();
    s.volume = 0.8;
    s.play().catch(() => playSynthSound());
  } else {
    playSynthSound();
  }
}

// ---------------------------------------------------------------
// Cursor personalizado (pico)
// ---------------------------------------------------------------
const cursorEl = document.createElement("img");
cursorEl.id = "pickCursor";
cursorEl.src = CURSOR_SRC;
cursorEl.alt = "";
cursorEl.draggable = false;
cursorEl.style.width = CURSOR_SIZE + "px";
cursorEl.style.height = CURSOR_SIZE + "px";
document.body.appendChild(cursorEl);

let cursorX = 0;
let cursorY = 0;
let swinging = false;

function renderCursor() {
  const tx = cursorX - CURSOR_SIZE * CURSOR_HOTSPOT.x;
  const ty = cursorY - CURSOR_SIZE * CURSOR_HOTSPOT.y;
  cursorEl.style.transform = `translate(${tx}px, ${ty}px) rotate(${swinging ? -35 : 0}deg)`;
}

document.addEventListener("mousemove", (event) => {
  cursorX = event.clientX;
  cursorY = event.clientY;
  cursorEl.style.display = "block";
  renderCursor();
});
document.addEventListener("mousedown", () => { swinging = true; renderCursor(); });
document.addEventListener("mouseup", () => { swinging = false; renderCursor(); });
document.addEventListener("mouseleave", () => { cursorEl.style.display = "none"; });

// ---------------------------------------------------------------
// Efectos visuales
// ---------------------------------------------------------------
let confetti = [];
let dustPuffs = [];
let floatingTexts = [];

// Fragmentos cuadrados al eliminar un mineral
class Confetti {
  constructor(x, y, type) {
    const angle = random(0, Math.PI * 2);
    const force = random(2, 7);
    this.x = x;
    this.y = y;
    this.vx = Math.cos(angle) * force;
    this.vy = Math.sin(angle) * force - 2;
    this.w = Math.round(random(2, 4)) * 3;
    this.h = this.w;
    this.life = 1;
    this.color = pick(ORES[type].fx);
  }

  update() {
    this.vx *= 0.99;
    this.vy += 0.22;
    this.x += this.vx;
    this.y += this.vy;
    this.life -= 0.018;
  }

  draw(context) {
    context.save();
    context.globalAlpha = Math.max(this.life, 0);
    context.fillStyle = this.color;
    context.fillRect(Math.round(this.x), Math.round(this.y), this.w, this.h);
    context.restore();
  }
}

// Polvo cuadrado al impactar con el piso
class Dust {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.vx = random(-2.5, 2.5);
    this.vy = random(-1.8, -0.3);
    this.radius = random(3, 7);
    this.life = 1;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vx *= 0.95;
    this.radius += 0.35;
    this.life -= 0.04;
  }

  draw(context) {
    context.save();
    context.globalAlpha = Math.max(this.life, 0) * 0.55;
    context.fillStyle = "#cfd8e3";
    const s = Math.round(this.radius);
    context.fillRect(Math.round(this.x - s / 2), Math.round(this.y - s / 2), s, s);
    context.restore();
  }
}

// Texto "+1" que sube al eliminar
class FloatingText {
  constructor(x, y, type) {
    this.x = x;
    this.y = y;
    this.type = type;
    this.life = 1;
  }

  update() {
    this.y -= 1.4;
    this.life -= 0.025;
  }

  draw(context) {
    context.save();
    context.globalAlpha = Math.max(this.life, 0);
    context.font = "20px 'Press Start 2P', 'Courier New', monospace";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = "#3f3f3f";
    context.fillText("+1", this.x + 3, this.y + 3);
    context.fillStyle = ORES[this.type].text;
    context.fillText("+1", this.x, this.y);
    context.restore();
  }
}

// ---------------------------------------------------------------
// Objeto que cae: mineral
// ---------------------------------------------------------------
class Gem {
  constructor() {
    this.reset();
  }

  // Coloca el mineral justo después del margen superior con valores nuevos
  reset() {
    this.size = random(22, 38);
    this.x = random(this.size, window_width - this.size);
    this.y = this.size;                    // Inicia justo debajo del margen superior
    this.vx = random(-1.2, 1.2);
    this.vy = random(0, 2);
    this.gravity = random(0.12, 0.4);      // Cada mineral cae a distinta velocidad
    this.restitution = random(0.55, 0.75); // Cuánta fuerza conserva al rebotar
    this.type = pick(TYPES);
    this.angle = random(0, Math.PI * 2);
    this.spin = random(-0.05, 0.05);
    this.squash = 0;
    this.alpha = 1;
    this.appear = 0;                       // Aparece con fade-in
    this.state = "falling";                // "falling" o "fading"
    this.fadeTimer = 0;
    this.sparklePhase = random(0, Math.PI * 2);
  }

  // Detecta si el punto (mouseX, mouseY) está sobre el mineral
  // Fórmula de distancia: d = √((x2-x1)² + (y2-y1)²)
  containsPoint(mouseX, mouseY) {
    const distX = mouseX - this.x;
    const distY = mouseY - this.y;
    const distance = Math.sqrt(distX * distX + distY * distY);
    return distance <= this.size * 1.05;
  }

  update(step) {
    this.appear = Math.min(this.appear + 0.08, 1);
    this.squash *= 0.82;

    if (this.state === "falling") {
      // Caída libre con gravedad
      this.vy += this.gravity * step;
      this.y += this.vy * step;
      this.x += this.vx * step;
      this.angle += this.spin * step;

      // Rebote en las paredes laterales
      if (this.x - this.size < 0) {
        this.x = this.size;
        this.vx = Math.abs(this.vx);
      } else if (this.x + this.size > window_width) {
        this.x = window_width - this.size;
        this.vx = -Math.abs(this.vx);
      }

      // Rebote en el piso (límite inferior del canvas)
      const floor = window_height - this.size;
      if (this.y >= floor) {
        const impact = Math.abs(this.vy);
        this.y = floor;
        this.vy = -this.vy * this.restitution; // Rebota con menos fuerza
        this.vx *= 0.88;
        this.spin *= 0.85;
        this.squash = Math.min(impact / 20, 1);

        // Polvo al impactar
        if (impact > 4) {
          const puffs = 4 + Math.floor(Math.random() * 3);
          for (let i = 0; i < puffs; i++) {
            dustPuffs.push(new Dust(this.x + random(-this.size, this.size), window_height - 8));
          }
        }

        // Cuando ya no tiene fuerza para rebotar, empieza a desaparecer
        if (Math.abs(this.vy) < MIN_BOUNCE_SPEED) {
          this.state = "fading";
          this.vy = 0;
          this.vx = 0;
          this.spin = 0;
        }
      }
    } else {
      // Desaparece y vuelve a aparecer arriba
      this.fadeTimer++;
      this.alpha = 1 - this.fadeTimer / FADE_FRAMES;
      if (this.alpha <= 0) this.reset();
    }
  }

  draw(context, time) {
    const r = this.size;
    const floorY = window_height;

    // Sombra cuadrada en el piso (más pequeña y tenue mientras está más alto)
    const height = Math.max(0, floorY - r - this.y);
    const shadowScale = Math.max(0.3, 1 - height / window_height);
    context.save();
    context.globalAlpha = this.alpha * this.appear * 0.35 * shadowScale;
    context.fillStyle = "#000000";
    const sw = Math.round(r * 1.8 * shadowScale);
    context.fillRect(Math.round(this.x - sw / 2), floorY - 10, sw, 6);
    context.restore();

    // Estiramiento al caer y aplastamiento al rebotar
    const stretch = this.state === "falling" ? Math.min(Math.abs(this.vy) * 0.012, 0.22) : 0;
    const scaleY = 1 + stretch - this.squash * 0.35;
    const scaleX = 1 - stretch * 0.5 + this.squash * 0.3;

    // Cuerpo: imagen del mineral (sin suavizado para conservar los píxeles)
    const ore = ORES[this.type];
    const img = ore.img;
    const imgReady = !ore.failed && img.complete && img.naturalWidth > 0;
    context.save();
    context.globalAlpha = this.alpha * this.appear;
    context.imageSmoothingEnabled = false;
    context.translate(this.x, this.y);
    context.scale(scaleX, scaleY);
    context.rotate(this.angle);
    if (imgReady) {
      context.drawImage(img, -r * 1.15, -r * 1.15, r * 2.3, r * 2.3);
    } else {
      // Si la imagen no carga, se muestra un cuadro del color del mineral
      context.fillStyle = ore.fx[0];
      context.fillRect(-r * 0.7, -r * 0.7, r * 1.4, r * 1.4);
      context.lineWidth = 3;
      context.strokeStyle = "#000000";
      context.strokeRect(-r * 0.7, -r * 0.7, r * 1.4, r * 1.4);
    }
    context.restore();

    // Destello de píxeles (no gira con el mineral, como si la luz fuera fija)
    context.save();
    context.globalAlpha = this.alpha * this.appear;
    context.translate(this.x, this.y);
    const twinkle = 0.5 + 0.5 * Math.sin(time * 4 + this.sparklePhase);
    context.fillStyle = "#ffffff";
    const p = Math.max(2, Math.round(r * 0.28 * twinkle));
    const sx = r * 0.55;
    const sy = -r * 0.6;
    context.fillRect(Math.round(sx - p / 2), Math.round(sy - p * 1.5), p, p * 3);
    context.fillRect(Math.round(sx - p * 1.5), Math.round(sy - p / 2), p * 3, p);
    context.restore();
  }
}

// ---------------------------------------------------------------
// Objetos (siempre 25)
// ---------------------------------------------------------------
let gems = [];

function generateGems(n) {
  for (let i = 0; i < n; i++) {
    gems.push(new Gem());
  }
}

// ---------------------------------------------------------------
// Interacción con el mouse
// ---------------------------------------------------------------

// Obtiene las coordenadas mouseX y mouseY relativas al canvas
function getMousePosition(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    mouseX: event.clientX - rect.left,
    mouseY: event.clientY - rect.top
  };
}

// Actualiza el contador y la etiqueta del nivel de velocidad
function updateHud() {
  counterEl.textContent = removedCount;

  const level = getSpeedLevel();
  levelEl.textContent = level.label;
  levelEl.dataset.level = level.key;

  // Animación cuando cambia de nivel
  if (level.key !== currentLevelKey) {
    currentLevelKey = level.key;
    levelEl.classList.remove("pop");
    void levelEl.offsetWidth; // Reinicia la animación
    levelEl.classList.add("pop");
  }
}

// Elimina el mineral bajo el mouse. Lo reemplaza en seguida arriba
// para mantener siempre 25 objetos.
function removeGemAt(mouseX, mouseY) {
  // Se recorre al revés para tomar el que se dibuja encima
  for (let i = gems.length - 1; i >= 0; i--) {
    const gem = gems[i];
    if (gem.containsPoint(mouseX, mouseY)) {
      // Efectos al eliminar
      for (let k = 0; k < 26; k++) {
        confetti.push(new Confetti(gem.x, gem.y, gem.type));
      }
      floatingTexts.push(new FloatingText(gem.x, gem.y - gem.size, gem.type));

      playClickSound();

      removedCount++;
      updateHud();

      gem.reset(); // Vuelve a aparecer arriba: el total sigue siendo 25
      return true;
    }
  }
  return false;
}

// Clic izquierdo: elimina el mineral bajo el cursor
canvas.addEventListener("click", (event) => {
  const { mouseX, mouseY } = getMousePosition(event);
  removeGemAt(mouseX, mouseY);
});

// ---------------------------------------------------------------
// Animación
// ---------------------------------------------------------------
function updateEffects() {
  dustPuffs = dustPuffs.filter(d => d.life > 0);
  confetti = confetti.filter(c => c.life > 0);
  floatingTexts = floatingTexts.filter(t => t.life > 0);

  dustPuffs.forEach(d => { d.update(); d.draw(ctx); });
  confetti.forEach(c => { c.update(); c.draw(ctx); });
  floatingTexts.forEach(t => { t.update(); t.draw(ctx); });
}

function animate() {
  ctx.clearRect(0, 0, window_width, window_height);

  const time = performance.now() / 1000;
  const step = getSpeedLevel().factor; // Multiplicador de velocidad según el contador

  gems.forEach(gem => {
    gem.update(step);
    gem.draw(ctx, time);
  });

  updateEffects();
  requestAnimationFrame(animate);
}

// Generar los 25 objetos y comenzar la animación
generateGems(TOTAL_OBJECTS);
updateHud();
animate();
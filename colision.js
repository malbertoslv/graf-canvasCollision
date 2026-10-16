const canvas = document.getElementById("canvas");
let ctx = canvas.getContext("2d");
const counterEl = document.getElementById("collisionCount");

//Obtiene las dimensiones de la pantalla actual
const window_height = window.innerHeight;
const window_width = window.innerWidth;

canvas.height = window_height;
canvas.width = window_width;

const COLLISION_COLOR = "#0000FF"; // Color azul del flash
const FLASH_FRAMES = 10;           // Cuadros que dura el flash azul
const TRAIL_LENGTH = 14;           // Largo de la estela

let totalCollisions = 0;
let particles = [];   // Partículas de las colisiones
let shockwaves = [];  // Ondas expansivas de las colisiones

// ---------------------------------------------------------------
// Efecto: partícula de chispa
// ---------------------------------------------------------------
class Particle {
  constructor(x, y, color) {
    const angle = Math.random() * Math.PI * 2;
    const force = Math.random() * 3 + 1;
    this.x = x;
    this.y = y;
    this.vx = Math.cos(angle) * force;
    this.vy = Math.sin(angle) * force;
    this.size = Math.random() * 2.5 + 1;
    this.life = 1;
    this.color = color;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vx *= 0.96; // Fricción
    this.vy *= 0.96;
    this.life -= 0.03;
  }

  draw(context) {
    context.save();
    context.globalAlpha = Math.max(this.life, 0);
    context.fillStyle = this.color;
    context.beginPath();
    context.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }
}

// ---------------------------------------------------------------
// Efecto: onda expansiva
// ---------------------------------------------------------------
class Shockwave {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.radius = 5;
    this.maxRadius = 70;
    this.life = 1;
  }

  update() {
    this.radius += 3;
    this.life = 1 - this.radius / this.maxRadius;
  }

  draw(context) {
    context.save();
    context.globalAlpha = Math.max(this.life, 0);
    context.strokeStyle = "#8fa4ff";
    context.shadowColor = COLLISION_COLOR;
    context.shadowBlur = 20;
    context.lineWidth = 3;
    context.beginPath();
    context.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    context.stroke();
    context.restore();
  }
}

// ---------------------------------------------------------------
// Círculo
// ---------------------------------------------------------------
class Circle {
  constructor(x, y, radius, color, text, speed) {
    this.posX = x;
    this.posY = y;
    this.radius = radius;
    this.originalColor = color; // Color original del círculo
    this.color = color;         // Color con el que se dibuja
    this.text = text;
    this.speed = speed;
    // Dirección aleatoria (izquierda/derecha, arriba/abajo)
    this.dx = (Math.random() < 0.5 ? -1 : 1) * this.speed;
    this.dy = (Math.random() < 0.5 ? -1 : 1) * this.speed;
    this.flashFrames = 0;       // Cuadros restantes del flash azul
    this.trail = [];            // Posiciones anteriores (estela)
  }

  draw(context) {
    // Estela: puntos que se van haciendo más pequeños y transparentes
    context.save();
    context.fillStyle = this.color;
    for (let k = 0; k < this.trail.length; k++) {
      const t = k / this.trail.length;
      context.globalAlpha = t * 0.25;
      context.beginPath();
      context.arc(this.trail[k].x, this.trail[k].y, this.radius * t * 0.8, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();

    // Círculo con brillo neón
    context.save();
    context.shadowColor = this.color;
    context.shadowBlur = this.flashFrames > 0 ? 35 : 18;

    // Relleno translúcido
    context.globalAlpha = this.flashFrames > 0 ? 0.35 : 0.12;
    context.fillStyle = this.color;
    context.beginPath();
    context.arc(this.posX, this.posY, this.radius, 0, Math.PI * 2, false);
    context.fill();

    // Contorno y texto
    context.globalAlpha = 1;
    context.strokeStyle = this.color;
    context.fillStyle = this.color;
    context.lineWidth = this.flashFrames > 0 ? 4 : 2;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = "bold 18px Arial";
    context.beginPath();
    context.arc(this.posX, this.posY, this.radius, 0, Math.PI * 2, false);
    context.stroke();
    context.closePath();
    context.fillText(this.text, this.posX, this.posY);
    context.restore();
  }

  // Fórmula de distancia entre los centros: d = √((x2-x1)² + (y2-y1)²)
  distanceTo(other) {
    const distX = other.posX - this.posX;
    const distY = other.posY - this.posY;
    return Math.sqrt(distX * distX + distY * distY);
  }

  isCollidingWith(other) {
    return this.distanceTo(other) <= this.radius + other.radius;
  }

  // Detecta si el punto (mouseX, mouseY) está dentro del círculo
  // Fórmula de distancia: d = √((x2-x1)² + (y2-y1)²)
  containsPoint(mouseX, mouseY) {
    const distX = mouseX - this.posX;
    const distY = mouseY - this.posY;
    const distance = Math.sqrt(distX * distX + distY * distY);
    return distance <= this.radius;
  }

  // Rebote: ambos círculos regresan en dirección contraria y hacen "flash" azul
  bounceWith(other) {
    const distX = other.posX - this.posX;
    const distY = other.posY - this.posY;
    let distance = this.distanceTo(other);
    if (distance === 0) distance = 0.001; // Evita división entre cero

    // Separa los círculos para que no se queden pegados
    const overlap = this.radius + other.radius - distance;
    const nx = distX / distance;
    const ny = distY / distance;
    this.posX -= (nx * overlap) / 2;
    this.posY -= (ny * overlap) / 2;
    other.posX += (nx * overlap) / 2;
    other.posY += (ny * overlap) / 2;

    // Dirección contraria
    this.dx = -this.dx;
    this.dy = -this.dy;
    other.dx = -other.dx;
    other.dy = -other.dy;

    // Activa el flash azul en ambos
    this.flashFrames = FLASH_FRAMES;
    other.flashFrames = FLASH_FRAMES;

    // Efectos visuales en el punto de contacto
    const contactX = this.posX + nx * this.radius;
    const contactY = this.posY + ny * this.radius;
    shockwaves.push(new Shockwave(contactX, contactY));
    for (let i = 0; i < 12; i++) {
      const color = i % 2 === 0 ? COLLISION_COLOR : this.originalColor;
      particles.push(new Particle(contactX, contactY, color));
    }

    totalCollisions++;
    counterEl.textContent = totalCollisions;
  }

  update(context) {
    // Azul mientras dure el flash, luego regresa al color original
    if (this.flashFrames > 0) {
      this.color = COLLISION_COLOR;
      this.flashFrames--;
    } else {
      this.color = this.originalColor;
    }

    this.draw(context);

    // Guarda la posición para la estela
    this.trail.push({ x: this.posX, y: this.posY });
    if (this.trail.length > TRAIL_LENGTH) this.trail.shift();

    // Actualizar la posición X
    this.posX += this.dx;

    // Cambiar la dirección si el círculo llega al borde del canvas en X
    if (this.posX + this.radius > window_width) {
      this.posX = window_width - this.radius;
      this.dx = -Math.abs(this.dx);
    } else if (this.posX - this.radius < 0) {
      this.posX = this.radius;
      this.dx = Math.abs(this.dx);
    }

    // Actualizar la posición Y
    this.posY += this.dy;

    // Cambiar la dirección si el círculo llega al borde del canvas en Y
    if (this.posY + this.radius > window_height) {
      this.posY = window_height - this.radius;
      this.dy = -Math.abs(this.dy);
    } else if (this.posY - this.radius < 0) {
      this.posY = this.radius;
      this.dy = Math.abs(this.dy);
    }
  }
}

// Crear un array para almacenar N círculos
let circles = [];

// Color neón aleatorio (tono aleatorio, saturación y brillo altos)
function randomNeonColor() {
  const hue = Math.floor(Math.random() * 360);
  return `hsl(${hue}, 100%, 60%)`;
}

// Función para generar círculos aleatorios
function generateCircles(n) {
  for (let i = 0; i < n; i++) {
    let radius = Math.random() * 30 + 20; // Radio entre 20 y 50
    let color = randomNeonColor();
    let speed = Math.random() * 4 + 1;    // Velocidad entre 1 y 5
    let text = `C${i + 1}`;               // Etiqueta del círculo
    let circle;
    let attempts = 0;

    // Intenta que el círculo no nazca encimado en otro
    do {
      let x = Math.random() * (window_width - radius * 2) + radius;
      let y = Math.random() * (window_height - radius * 2) + radius;
      circle = new Circle(x, y, radius, color, text, speed);
      attempts++;
    } while (circles.some(c => c.isCollidingWith(circle)) && attempts < 100);

    circles.push(circle);
  }
}

// Función para detectar colisiones entre todos los círculos
function detectCollisions() {
  for (let i = 0; i < circles.length; i++) {
    for (let j = i + 1; j < circles.length; j++) {
      if (circles[i].isCollidingWith(circles[j])) {
        circles[i].bounceWith(circles[j]);
      }
    }
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

// Elimina el círculo que esté bajo el mouse (regresa true si eliminó alguno)
function removeCircleAt(mouseX, mouseY) {
  // Se recorre al revés para eliminar el que se dibuja encima si hay empalmes
  for (let i = circles.length - 1; i >= 0; i--) {
    if (circles[i].containsPoint(mouseX, mouseY)) {
      const target = circles[i];

      // Efecto visual al desaparecer
      shockwaves.push(new Shockwave(target.posX, target.posY));
      for (let k = 0; k < 20; k++) {
        particles.push(new Particle(target.posX, target.posY, target.originalColor));
      }

      circles.splice(i, 1); // Lo quita del arreglo, por lo tanto del canvas
      return true;
    }
  }
  return false;
}

// Clic izquierdo: elimina el círculo bajo el cursor
canvas.addEventListener("click", (event) => {
  const { mouseX, mouseY } = getMousePosition(event);
  removeCircleAt(mouseX, mouseY);
});

// Cursor de mano cuando el mouse está sobre un círculo
canvas.addEventListener("mousemove", (event) => {
  const { mouseX, mouseY } = getMousePosition(event);
  const overCircle = circles.some(c => c.containsPoint(mouseX, mouseY));
  canvas.style.cursor = overCircle ? "pointer" : "default";
});

// Dibuja y actualiza partículas y ondas, quitando las que ya terminaron
function updateEffects() {
  shockwaves = shockwaves.filter(s => s.life > 0);
  particles = particles.filter(p => p.life > 0);

  shockwaves.forEach(s => {
    s.update();
    s.draw(ctx);
  });
  particles.forEach(p => {
    p.update();
    p.draw(ctx);
  });
}

// Función para animar los círculos
function animate() {
  ctx.clearRect(0, 0, window_width, window_height); // Limpiar el canvas
  detectCollisions(); // Detectar colisiones y rebotar
  circles.forEach(circle => {
    circle.update(ctx); // Actualizar cada círculo
  });
  updateEffects(); // Partículas y ondas expansivas
  requestAnimationFrame(animate); // Repetir la animación
}

// Generar N círculos y comenzar la animación
generateCircles(20); // 20 círculos
animate();
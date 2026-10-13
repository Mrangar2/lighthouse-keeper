// Farero - Proyecto Personal GPC (MIARFID)
// Bucle principal, controles y partida

// Parámetros del juego
const ALTURA_OJOS = 1.65;
const R_ANDAR_MIN = 2.85, R_ANDAR_MAX = 4.25;   // por donde puede andar
const PITCH_MIN = -1.35, PITCH_MAX = 0.9;
const VEL_ANDAR = 3.0, VEL_CORRER = 5.2;
const VEL_GIRO_HAZ = 2.4;                        // el haz va un poco por detrás de la vista
const ENERGIA_MAX = 100, CONSUMO = 2.2, RECARGA = 18;
const MEMORIA_LUZ = 5.5;                         // segundos que un barco se acuerda de la luz
const CORRIENTE = 1.2;
const NAUFRAGIOS_MAX = 3;
const DURACION_NOCHE = 75;
const FOV_NORMAL = 70, FOV_CATALEJO = 24;

// Variables globales que van siempre
var renderer, scene, camera;
var clock = new THREE.Clock();
var raycaster = new THREE.Raycaster();

// Estado de la partida
var estado = 'jugando';      // jugando, pausa o fin
var modelosListos = false;   // los barcos no salen hasta que se cargan
var jugador;                 // se crea al empezar
var hazYaw = 0, hazPitch = -0.2, hazAngulo = HAZ_ANGULO;
var hazDir = new THREE.Vector3(0, 0, 1);
var destinoHaz = { yaw: 0, pitch: -0.2 };
var energia = ENERGIA_MAX, lamparaEncendida = true;
var puntos = 0, guiados = 0, naufragios = 0, noche = 1, tiempo = 0, tAparicion = 0, tFin = -1;
var record = 0;
var catalejo = false, arrastrando = false, sinCaptura = false;
var siempreGuiados = false;  // opción del gui para probar
var teclas = {};
var momentoPausa = 0, tMensaje = null;

// 1-inicializa
init();
// 2-Crea una escena
loadScene();
// Se juega nada más abrir la página
empezar();
// 3-renderiza
render();

function init()
{
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(new THREE.Color(0x05080c));
  renderer.shadowMap.enabled = true;
  document.getElementById('container').appendChild(renderer.domElement);

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(FOV_NORMAL, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.rotation.order = 'YXZ';

  window.addEventListener('resize', updateAspectRatio);
  document.addEventListener('keydown', teclaPulsada);
  document.addEventListener('keyup', function (e) { teclas[e.code] = false; });

  // Ratón: se captura al hacer clic y, si no se puede, se arrastra
  renderer.domElement.addEventListener('mousedown', function (e) {
    if (e.button === 0) {
      arrastrando = true;
      if (estado === 'jugando' && !ratonCapturado() && !sinCaptura) capturarRaton();
    }
    if (e.button === 2 && estado === 'jugando') catalejo = true;
  });
  document.addEventListener('mouseup', function (e) {
    if (e.button === 0) arrastrando = false;
    if (e.button === 2) catalejo = false;
  });
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  document.addEventListener('mousemove', function (e) {
    if (estado !== 'jugando' || !(ratonCapturado() || arrastrando)) return;
    const s = 0.0022 * camera.fov / FOV_NORMAL;
    girarVista(-e.movementX * s, -e.movementY * s);
  });
  document.addEventListener('wheel', function (e) {
    if (estado === 'jugando') hazAngulo = clamp(hazAngulo - Math.sign(e.deltaY) * 0.012, 0.07, 0.22);
  });
  document.addEventListener('pointerlockchange', function () {
    if (estado === 'jugando' && !ratonCapturado()) pausar();
  });
  document.addEventListener('pointerlockerror', function () {
    sinCaptura = true;
    mensaje('Tu navegador no deja capturar el ratón: arrastra con clic izquierdo o usa las flechas');
  });

  document.getElementById('boton-otra').addEventListener('click', function () {
    empezar();
    if (!sinCaptura) capturarRaton();
  });
  document.getElementById('pantalla-pausa').addEventListener('click', reanudar);
}

function loadScene()
{
  crearCielo();
  crearLuces();
  crearMar();
  crearFaro();
  crearHaz();
  crearRutas();
  cargarModelos(function () {
    crearRocas();
    modelosListos = true;
  });
  setupGUI();
}

function setupGUI()
{
  const gui = new lil.GUI({ title: 'Opciones' });
  gui.add(window, 'siempreGuiados').name('barcos siempre guiados');
  gui.close();
}

function updateAspectRatio()
{
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}

// ---------- Controles ----------

function ratonCapturado()
{
  return document.pointerLockElement === renderer.domElement;
}

function capturarRaton()
{
  renderer.domElement.requestPointerLock();
}

function teclaPulsada(e)
{
  teclas[e.code] = true;
  // Esc también pausa, menos el que se pulsa para soltar el ratón
  const escLibre = e.code === 'Escape' && !ratonCapturado() && performance.now() - momentoPausa > 500;
  if (e.code === 'KeyP' || escLibre) {
    if (estado === 'jugando') pausar();
    else if (estado === 'pausa') reanudar();
  }
  // H abre o cierra el desplegable de controles
  if (e.code === 'KeyH') {
    const controles = document.getElementById('controles');
    controles.open = !controles.open;
  }
}

function girarVista(dYaw, dPitch)
{
  jugador.yaw += dYaw;
  jugador.pitch = clamp(jugador.pitch + dPitch, PITCH_MIN, PITCH_MAX);
}

function moverJugador(dt)
{
  // Flechas para mirar
  const g = 1.8 * camera.fov / FOV_NORMAL * dt;
  if (teclas.ArrowLeft) girarVista(g, 0);
  if (teclas.ArrowRight) girarVista(-g, 0);
  if (teclas.ArrowUp) girarVista(0, g * 0.6);
  if (teclas.ArrowDown) girarVista(0, -g * 0.6);

  // WASD para andar hacia donde se mira
  const fx = -Math.sin(jugador.yaw), fz = -Math.cos(jugador.yaw);
  let mx = 0, mz = 0;
  if (teclas.KeyW) { mx += fx; mz += fz; }
  if (teclas.KeyS) { mx -= fx; mz -= fz; }
  if (teclas.KeyD) { mx -= fz; mz += fx; }
  if (teclas.KeyA) { mx += fz; mz -= fx; }
  const l = Math.hypot(mx, mz);
  let balanceo = 0;
  if (l > 0) {
    const vel = (teclas.ShiftLeft || teclas.ShiftRight) ? VEL_CORRER : VEL_ANDAR;
    jugador.x += mx / l * vel * dt;
    jugador.z += mz / l * vel * dt;
    // Que no se salga de la galería
    const r = Math.hypot(jugador.x, jugador.z);
    const k = clamp(r, R_ANDAR_MIN, R_ANDAR_MAX) / r;
    jugador.x *= k;
    jugador.z *= k;
    balanceo = Math.sin(tiempo * 9) * 0.04;
  }

  camera.position.set(jugador.x, G + ALTURA_OJOS + balanceo, jugador.z);
  camera.rotation.set(jugador.pitch, jugador.yaw, 0);
}

// Catalejo: zoom poco a poco cambiando el fov
function actualizarCatalejo(dt)
{
  const fov = catalejo ? FOV_CATALEJO : FOV_NORMAL;
  if (Math.abs(camera.fov - fov) > 0.05) {
    camera.fov += (fov - camera.fov) * Math.min(1, dt * 9);
    camera.updateProjectionMatrix();
  }
  document.getElementById('catalejo').style.opacity = (FOV_NORMAL - camera.fov) / (FOV_NORMAL - FOV_CATALEJO);
}

// Manivela: estar cerca y mantener E
function usarManivela(dt)
{
  const cerca = Math.hypot(jugador.x - posManivela.x, jugador.z - posManivela.z) < 1.7;
  const dando = cerca && teclas.KeyE;
  if (dando) {
    energia = Math.min(ENERGIA_MAX, energia + RECARGA * dt);
    if (!lamparaEncendida && energia > 15) lamparaEncendida = true;
    manivela.rotation.z -= dt * 9;
  }
  aviso(dando ? 'Dando cuerda a la lámpara...' : (cerca ? 'Mantén E para dar cuerda a la lámpara' : ''));
}

// ---------- Haz de luz ----------

// El haz apunta al punto del mar que hay en el centro de la pantalla
function apuntarHaz()
{
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const choque = raycaster.intersectObject(mar);
  let px, pz;
  if (choque.length > 0) {
    px = choque[0].point.x;
    pz = choque[0].point.z;
  } else {
    // Si se mira al cielo, apunta al horizonte
    const d = raycaster.ray.direction;
    const l = Math.hypot(d.x, d.z) || 1;
    px = camera.position.x + d.x / l * 260;
    pz = camera.position.z + d.z / l * 260;
  }
  const dist = clamp(Math.hypot(px, pz), 30, 260);
  destinoHaz.yaw = Math.atan2(px, pz);
  destinoHaz.pitch = Math.atan2(0.5 - posLampara.y, dist);
}

function actualizarHaz(dt, gastar)
{
  // Girar poco a poco hacia donde se mira
  const paso = VEL_GIRO_HAZ * dt;
  hazYaw = angulo(hazYaw + clamp(angulo(destinoHaz.yaw - hazYaw), -paso, paso));
  hazPitch += clamp(destinoHaz.pitch - hazPitch, -paso, paso);
  hazDir.set(Math.sin(hazYaw) * Math.cos(hazPitch), Math.sin(hazPitch), Math.cos(hazYaw) * Math.cos(hazPitch));

  // Energía: con el haz ancho se gasta más
  if (gastar && lamparaEncendida) {
    energia -= CONSUMO * (hazAngulo / HAZ_ANGULO) * dt;
    if (energia <= 0) {
      energia = 0;
      lamparaEncendida = false;
      mensaje('¡La lámpara se ha apagado! Corre a la manivela');
    }
  }

  lampara.rotation.y = hazYaw;
  lente.rotation.x = -hazPitch;
  frenteLente.material.color.setHex(lamparaEncendida ? 0xfff2c0 : 0x333333);

  // Cuanto más estrecho, más fuerte
  foco.angle = hazAngulo;
  foco.intensity = lamparaEncendida ? 10 * HAZ_ANGULO / hazAngulo : 0;
  foco.target.position.copy(posLampara).addScaledVector(hazDir, 100);
  conoHaz.visible = lamparaEncendida;
  // El cono acaba donde el haz toca el mar
  const alcance = Math.min(300, posLampara.y / Math.max(0.05, -Math.sin(hazPitch)));
  conoHaz.scale.set(Math.tan(hazAngulo), Math.tan(hazAngulo), alcance / 200);
  conoHaz.lookAt(foco.target.position);
}

// Mira si un punto del mar está dentro del haz
function hazIlumina(x, z)
{
  if (!lamparaEncendida) return false;
  const v = new THREE.Vector3(x, 1.5, z).sub(posLampara);
  return v.normalize().dot(hazDir) > Math.cos(hazAngulo * 1.15);
}

// ---------- Partida ----------

function empezar()
{
  while (barcos.length) quitarBarco(barcos[0]);
  jugador = { x: 3.6, z: 0, yaw: -Math.PI / 2, pitch: -0.3 };
  energia = ENERGIA_MAX;
  lamparaEncendida = true;
  hazAngulo = HAZ_ANGULO;
  puntos = 0; guiados = 0; naufragios = 0; noche = 1; tiempo = 0; tAparicion = 2; tFin = -1;
  estado = 'jugando';
  mostrarPantalla(null);
  mensaje('Haz clic para mirar con el ratón: el haz de luz sigue tu mirada');
  clock.getDelta();
}

function pausar()
{
  estado = 'pausa';
  momentoPausa = performance.now();
  catalejo = false;
  teclas = {};
  mostrarPantalla('pausa');
  if (ratonCapturado()) document.exitPointerLock();
}

function reanudar()
{
  estado = 'jugando';
  mostrarPantalla(null);
  if (!sinCaptura) capturarRaton();
  clock.getDelta();
}

function terminar()
{
  estado = 'fin';
  catalejo = false;
  if (ratonCapturado()) document.exitPointerLock();
  if (puntos > record) record = puntos;
  document.getElementById('fin-puntos').textContent = puntos;
  document.getElementById('fin-guiados').textContent = guiados;
  document.getElementById('fin-noche').textContent = noche;
  document.getElementById('fin-record').textContent = record;
  mostrarPantalla('fin');
  // El faro sigue girando de fondo
  lamparaEncendida = true;
  energia = ENERGIA_MAX;
}

function actualizarBarcos(dt)
{
  // Sale un barco cada cierto tiempo, más seguido cada noche
  tAparicion -= dt;
  let enMar = 0;
  for (let i = 0; i < barcos.length; i++) {
    if (barcos[i].estado == 'navegando') enMar++;
  }
  if (estado === 'jugando' && modelosListos && tAparicion <= 0 && enMar < 2 + noche) {
    crearBarco(noche);
    tAparicion = Math.max(5, 15 - 1.5 * (noche - 1)) * (0.75 + Math.random() * 0.5);
  }

  // Se recorre al revés porque se pueden borrar barcos
  for (let i = barcos.length - 1; i >= 0; i--) {
    const b = barcos[i];
    const r = actualizarBarco(b, dt, tiempo, noche);
    if (estado !== 'jugando' || !r) continue;
    if (r === 'llegada') {
      const p = b.t.puntos * noche;
      puntos += p;
      guiados++;
      mensaje(b.t.nombre + ' ha cruzado a salvo  +' + p);
    } else if (r === 'naufragio' && naufragios < NAUFRAGIOS_MAX) {
      naufragios++;
      mensaje('¡Naufragio! ' + b.t.nombre + ' se ha estrellado');
      if (naufragios === NAUFRAGIOS_MAX) tFin = 2.5;
    } else if (r === 'perdido') {
      mensaje(b.t.nombre + ' se ha perdido mar adentro');
    }
  }
}

function update()
{
  const dt = Math.min(clock.getDelta(), 0.05);
  if (estado === 'pausa') return;

  texMar.offset.x += dt * 0.01;
  texMar.offset.y += dt * 0.006;
  TWEEN.update();

  if (estado === 'jugando') {
    tiempo += dt;
    const n = 1 + Math.floor(tiempo / DURACION_NOCHE);
    if (n > noche) {
      noche = n;
      mensaje('Noche ' + noche + ': los barcos van más rápido');
    }
    moverJugador(dt);
    actualizarCatalejo(dt);
    apuntarHaz();
    usarManivela(dt);
    actualizarHaz(dt, true);
    actualizarBarcos(dt);
    actualizarMarcadores();

    if (tFin > 0) {
      tFin -= dt;
      if (tFin <= 0) terminar();
    }
  } else {
    // Al terminar la partida la cámara da vueltas al faro
    const a = clock.elapsedTime * 0.06;
    camera.position.set(Math.cos(a) * 42, G + 8, Math.sin(a) * 42);
    camera.lookAt(0, G - 2, 0);
    destinoHaz.yaw = angulo(hazYaw + dt * 1.8);
    destinoHaz.pitch = Math.atan2(0.5 - posLampara.y, 130);
    actualizarHaz(dt, false);
    actualizarBarcos(dt);
  }
}

function render()
{
  requestAnimationFrame(render);
  update();
  renderer.render(scene, camera);
}

// ---------- Interfaz ----------

function mostrarPantalla(nombre)
{
  const pantallas = ['pausa', 'fin'];
  for (let i = 0; i < pantallas.length; i++) {
    document.getElementById('pantalla-' + pantallas[i]).style.display = (pantallas[i] === nombre) ? 'flex' : 'none';
  }
  document.getElementById('marcadores').style.display = (nombre === null) ? 'block' : 'none';
}

function actualizarMarcadores()
{
  document.getElementById('puntos').textContent = puntos;
  document.getElementById('noche').textContent = noche;
  document.getElementById('guiados').textContent = guiados;
  document.getElementById('naufragios').textContent = '⚓'.repeat(NAUFRAGIOS_MAX - naufragios) + '✖'.repeat(naufragios);
  const barra = document.getElementById('energia-barra');
  barra.style.width = energia + '%';
  barra.style.background = energia > 40 ? '#f2d27a' : (energia > 15 ? '#f09a3e' : '#e5483a');
}

function mensaje(texto)
{
  const el = document.getElementById('mensaje');
  el.textContent = texto;
  el.style.opacity = 1;
  clearTimeout(tMensaje);
  tMensaje = setTimeout(function () { el.style.opacity = 0; }, 3000);
}

function aviso(texto)
{
  document.getElementById('aviso').textContent = texto;
}

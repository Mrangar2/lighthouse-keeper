// Farero - Barcos
// Los barcos cruzan por canales entre las rocas. Si se quedan sin luz
// se pierden y la corriente los lleva contra las rocas

const R_APARICION = 215;      // aquí aparecen y desaparecen
const R_PELIGRO = 138;        // aquí dentro necesitan la luz

// Datos de cada tipo de barco
const TIPOS = {
  pesquero: { nombre: 'El pesquero', escala: 1.6, vel: 5.0, giro: 0.8, largo: 6,   puntos: 100, farol: 4.8 },
  velero:   { nombre: 'El velero',   escala: 1.7, vel: 6.5, giro: 0.9, largo: 6.5, puntos: 150, farol: 7.1 },
  carguero: { nombre: 'El carguero', escala: 1.3, vel: 3.8, giro: 0.5, largo: 13,  puntos: 250, farol: 5.0 }
};

var modelosBarco = {};
var modelosRoca = [];
var rutas = [];
var barcos = [];

const matFarol = {
  guiado:  new THREE.MeshBasicMaterial({ color: 0xffd060 }),
  dudando: new THREE.MeshBasicMaterial({ color: 0xff7a20 }),
  perdido: new THREE.MeshBasicMaterial({ color: 0xff1a10 }),
  apagado: new THREE.MeshBasicMaterial({ color: 0x220000 })
};

// Carga los barcos y las rocas y avisa al terminar
function cargarModelos(alTerminar)
{
  const loader = new THREE.GLTFLoader();
  let cargados = 0;

  // Le pone sombras y cuenta uno más
  function listo(modelo) {
    modelo.traverse(function (child) {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    cargados++;
    if (cargados == 6) alTerminar();
  }

  loader.load('models/barcos/boat-fishing-small.glb', function (gltf) { modelosBarco.pesquero = gltf.scene; listo(gltf.scene); });
  loader.load('models/barcos/boat-sail-a.glb',        function (gltf) { modelosBarco.velero = gltf.scene; listo(gltf.scene); });
  loader.load('models/barcos/ship-cargo-a.glb',       function (gltf) { modelosBarco.carguero = gltf.scene; listo(gltf.scene); });
  loader.load('models/rocas/rocks-a.glb', function (gltf) { modelosRoca[0] = gltf.scene; listo(gltf.scene); });
  loader.load('models/rocas/rocks-b.glb', function (gltf) { modelosRoca[1] = gltf.scene; listo(gltf.scene); });
  loader.load('models/rocas/rocks-c.glb', function (gltf) { modelosRoca[2] = gltf.scene; listo(gltf.scene); });
}

// Seis rutas rectas que no pasan por la isla
function crearRutas()
{
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3 + Math.random() * 0.4;
    const b = a + (2.3 + Math.random() * 0.45) * (Math.random() < 0.5 ? 1 : -1);
    rutas.push({
      ax: Math.cos(a) * R_APARICION, az: Math.sin(a) * R_APARICION,
      bx: Math.cos(b) * R_APARICION, bz: Math.sin(b) * R_APARICION
    });
  }
}

function crearBarco(noche)
{
  // Cada noche salen más cargueros
  const r = Math.random();
  let tipo = 'pesquero';
  if (r < Math.min(0.35, 0.1 + 0.05 * noche)) tipo = 'carguero';
  else if (r < 0.55) tipo = 'velero';
  const t = TIPOS[tipo];

  const grupo = new THREE.Object3D();
  const modelo = modelosBarco[tipo].clone();
  modelo.scale.setScalar(t.escala);
  grupo.add(modelo);
  const farol = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), matFarol.guiado);
  farol.position.y = t.farol;
  grupo.add(farol);
  scene.add(grupo);

  // Ruta al azar y en cualquier sentido
  const ru = rutas[Math.floor(Math.random() * rutas.length)];
  const b = {
    t: t, grupo: grupo, farol: farol,
    ax: ru.ax, az: ru.az, bx: ru.bx, bz: ru.bz,
    vel: t.vel * (1 + 0.06 * (noche - 1)),
    visibilidad: 1,         // 1 si ve la luz, 0 si está perdido
    deriva: 0,
    estado: 'navegando',
    entroEnZona: false,
    fase: Math.random() * 10
  };
  if (Math.random() < 0.5) {
    b.ax = ru.bx; b.az = ru.bz;
    b.bx = ru.ax; b.bz = ru.az;
  }
  b.x = b.ax;
  b.z = b.az;
  b.rumbo = Math.atan2(b.bx - b.ax, b.bz - b.az);
  barcos.push(b);
}

function quitarBarco(b)
{
  scene.remove(b.grupo);
  barcos.splice(barcos.indexOf(b), 1);
}

// Se hunde poco a poco con tween
function hundir(b)
{
  b.estado = 'hundiendo';
  b.farol.material = matFarol.apagado;
  new TWEEN.Tween(b.grupo.position).to({ y: -8 }, 4500).easing(TWEEN.Easing.Quadratic.In).start();
  new TWEEN.Tween(b.grupo.rotation).to({ z: 0.9, x: 0.3 }, 4500)
    .onComplete(function () { quitarBarco(b); }).start();
}

// Apunta un poco más adelante en su ruta, así vuelve al canal si se desvía
function rumboRuta(b)
{
  const dx = b.bx - b.ax, dz = b.bz - b.az, l = Math.hypot(dx, dz);
  const ux = dx / l, uz = dz / l;
  const avance = (b.x - b.ax) * ux + (b.z - b.az) * uz + 20;
  return Math.atan2(b.ax + ux * avance - b.x, b.az + uz * avance - b.z);
}

function chocaConRoca(b)
{
  const margen = b.t.largo * 0.3;
  for (let i = 0; i < rocas.length; i++) {
    if (Math.hypot(b.x - rocas[i].x, b.z - rocas[i].z) < rocas[i].r + margen) return true;
  }
  return false;
}

// Devuelve lo que le ha pasado: 'llegada', 'naufragio', 'perdido' o nada
function actualizarBarco(b, dt, t, noche)
{
  if (b.estado != 'navegando') return null;

  const dist = Math.hypot(b.x, b.z);
  const enZona = dist < R_PELIGRO;
  if (enZona) b.entroEnZona = true;

  // Si no le da la luz se le va olvidando
  const memoria = Math.max(3, MEMORIA_LUZ - 0.3 * (noche - 1));
  if (hazIlumina(b.x, b.z) || !enZona || siempreGuiados) b.visibilidad = 1;
  else b.visibilidad = Math.max(0, b.visibilidad - dt / memoria);

  let deseado, vel = b.vel, corrX = 0, corrZ = 0;
  if (b.visibilidad > 0) {
    deseado = rumboRuta(b);
    b.deriva = 0;
  } else {
    // Perdido: va más lento, da bandazos y la corriente lo lleva a la isla
    b.deriva = clamp(b.deriva + (Math.random() - 0.5) * dt * 2, -0.8, 0.8);
    deseado = b.rumbo + b.deriva;
    vel *= 0.5;
    corrX = -b.x / dist * CORRIENTE;
    corrZ = -b.z / dist * CORRIENTE;
  }

  // Girar poco a poco y avanzar
  const giro = b.t.giro * dt;
  b.rumbo = angulo(b.rumbo + clamp(angulo(deseado - b.rumbo), -giro, giro));
  b.x += (Math.sin(b.rumbo) * vel + corrX) * dt;
  b.z += (Math.cos(b.rumbo) * vel + corrZ) * dt;

  // Que se mueva un poco con las olas
  b.grupo.position.set(b.x, 0.25 * Math.sin(t * 1.3 + b.fase), b.z);
  b.grupo.rotation.set(0.04 * Math.sin(t * 0.9 + b.fase), b.rumbo, 0.07 * Math.sin(t * 1.1 + b.fase));

  // Color del farol según cómo va
  if (b.visibilidad > 0.5) b.farol.material = matFarol.guiado;
  else if (b.visibilidad > 0) b.farol.material = matFarol.dudando;
  else if (Math.sin(t * 12) > 0) b.farol.material = matFarol.perdido;   // parpadea
  else b.farol.material = matFarol.apagado;

  if (chocaConRoca(b)) {
    hundir(b);
    return 'naufragio';
  }
  if (b.entroEnZona && dist > R_APARICION - 5 && b.visibilidad > 0) {
    quitarBarco(b);
    return 'llegada';
  }
  if (dist > R_APARICION + 50) {
    quitarBarco(b);
    return 'perdido';
  }
  return null;
}

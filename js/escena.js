// Farero - Escena

// Medidas del faro
const G = 30;                 // altura de la galería
const R_LINTERNA = 2.4;       // radio de la sala de la lámpara
const ALTO_MURO = 1.95;       // tapa la vista al jugador
const R_BARANDILLA = 4.6;
const R_ISLA = 15;
const R_ROCA = 2.3;           // tamaño de una roca para los choques
const NUM_ROCAS = 55;         // rocas sueltas en el mar

// Haz de luz
const HAZ_ANGULO = 0.12;      // apertura del haz al empezar (radianes)
const COLOR_HAZ = 0xfff0c8;
const INTENSIDAD_HAZ = 10;

var mar, texMar;
var lampara, lente, frenteLente;   // la lámpara gira y la lente sube y baja
var foco, conoHaz;                 // la luz del haz y el cono que se ve
var manivela;
var posLampara = new THREE.Vector3(0, G + 3.1, 0);
var posManivela = new THREE.Vector3(0, G, R_LINTERNA + 0.45);
var rocas = [];                    // para los choques de los barcos

const cargadorTexturas = new THREE.TextureLoader();

function clamp(value, min, max)
{
  return Math.max(min, Math.min(max, value));
}

// Deja el ángulo entre -PI y PI
function angulo(a)
{
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

function textura(ruta, repX, repY)
{
  const t = cargadorTexturas.load(ruta);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repX, repY);
  return t;
}

function crearCielo()
{
  // Cielo de fondo, también se refleja en el cristal
  scene.background = new THREE.CubeTextureLoader().setPath('images/cielo/').load([
    'dark-s_px.jpg', 'dark-s_nx.jpg', 'dark-s_py.jpg', 'dark-s_ny.jpg', 'dark-s_pz.jpg', 'dark-s_nz.jpg'
  ]);
}

function crearLuces()
{
  scene.add(new THREE.AmbientLight(0x334466, 0.6));

  const luna = new THREE.DirectionalLight(0x8899cc, 0.35);
  luna.position.set(-60, 90, -40);
  luna.castShadow = true;
  luna.shadow.camera.left = -40;
  luna.shadow.camera.right = 40;
  luna.shadow.camera.top = 40;
  luna.shadow.camera.bottom = -40;
  luna.shadow.mapSize.set(1024, 1024);
  scene.add(luna);
}

function crearMar()
{
  texMar = textura('images/waternormals.jpg', 60, 60);
  mar = new THREE.Mesh(
    new THREE.PlaneGeometry(1000, 1000),
    new THREE.MeshPhongMaterial({ color: 0x14405a, specular: 0x6688aa, shininess: 60, normalMap: texMar })
  );
  mar.rotation.x = -Math.PI / 2;
  mar.receiveShadow = true;
  scene.add(mar);
}

// El faro es un grafo: torre, galería, sala de la lámpara, lámpara y manivela
function crearFaro()
{
  const faro = new THREE.Object3D();

  const mat = {
    blanco: new THREE.MeshLambertMaterial({ color: 0xe8e4da }),
    rojo:   new THREE.MeshLambertMaterial({ color: 0xa82620 }),
    metal:  new THREE.MeshPhongMaterial({ map: textura('images/metal_128.jpg', 2, 1), color: 0x9aa3a8, shininess: 80 }),
    oscuro: new THREE.MeshPhongMaterial({ color: 0x1d2b28, shininess: 30 }),
    suelo:  new THREE.MeshPhongMaterial({ map: textura('images/pisometalico_1024.jpg', 3, 3), shininess: 40 }),
    muro:   new THREE.MeshLambertMaterial({ map: textura('images/metal_128.jpg', 6, 1), color: 0xd8d4c8 }),
    madera: new THREE.MeshLambertMaterial({ map: textura('images/wood512.jpg', 1, 1), color: 0x8a5a30 })
  };

  crearTorre(faro, mat);
  crearGaleria(faro, mat);
  crearSalaLampara(faro, mat);
  crearLampara(faro, mat);
  crearManivela(faro, mat);
  scene.add(faro);
}

// Torre con franjas rojas y blancas y ventanas de la escalera
function crearTorre(faro, mat)
{
  const franjas = 5, alto = (G - 2) / franjas;
  for (let i = 0; i < franjas; i++) {
    const rAbajo = 5.2 - i * 0.36, rArriba = 5.2 - (i + 1) * 0.36;
    const franja = new THREE.Mesh(new THREE.CylinderGeometry(rArriba, rAbajo, alto, 32), i % 2 ? mat.rojo : mat.blanco);
    franja.position.y = 2 + alto * (i + 0.5);
    franja.castShadow = true;
    franja.receiveShadow = true;
    faro.add(franja);
  }

  const matVentana = new THREE.MeshBasicMaterial({ color: 0xffb050 });
  for (let i = 0; i < 4; i++) {
    const y = 6 + i * 5.5, a = i * 1.9, r = 5.25 - (y - 2) / (G - 2) * 1.8;
    const v = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.1, 0.2), matVentana);
    v.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
    v.lookAt(0, y, 0);
    faro.add(v);
  }
}

// Suelo de la galería y barandilla
function crearGaleria(faro, mat)
{
  const cornisa = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 3.4, 1.4, 32), mat.metal);
  cornisa.position.y = G - 1.1;
  faro.add(cornisa);
  const suelo = new THREE.Mesh(new THREE.CylinderGeometry(R_BARANDILLA + 0.15, R_BARANDILLA + 0.15, 0.4, 48), mat.suelo);
  suelo.position.y = G - 0.2;
  suelo.receiveShadow = true;
  faro.add(suelo);

  // Barandilla con MeshBasic para que el haz no la ilumine
  const matBarandilla = new THREE.MeshBasicMaterial({ color: 0x1c2224 });
  for (let i = 0; i < 36; i++) {
    const a = i / 36 * Math.PI * 2;
    const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 6), matBarandilla);
    poste.position.set(Math.cos(a) * R_BARANDILLA, G + 0.55, Math.sin(a) * R_BARANDILLA);
    faro.add(poste);
  }
  for (let i = 1; i <= 2; i++) {
    const aro = new THREE.Mesh(new THREE.TorusGeometry(R_BARANDILLA, 0.045, 6, 96), matBarandilla);
    aro.rotation.x = Math.PI / 2;
    aro.position.y = G + 0.55 * i;
    faro.add(aro);
  }
}

// Muro, puerta, cristal y cúpula de la sala de la lámpara
function crearSalaLampara(faro, mat)
{
  const muro = new THREE.Mesh(new THREE.CylinderGeometry(R_LINTERNA, R_LINTERNA, ALTO_MURO, 32), mat.muro);
  muro.position.y = G + ALTO_MURO / 2;
  faro.add(muro);

  const puerta = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.75, 0.15), mat.madera);
  puerta.position.set(0, G + 0.875, -(R_LINTERNA + 0.02));
  faro.add(puerta);

  // El cristal refleja el cielo
  const altoCristal = 1.6;
  const cristal = new THREE.Mesh(
    new THREE.CylinderGeometry(R_LINTERNA - 0.05, R_LINTERNA - 0.05, altoCristal, 16, 1, true),
    new THREE.MeshPhongMaterial({ color: 0x99bbcc, envMap: scene.background, reflectivity: 0.6,
      transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false })
  );
  cristal.position.y = G + ALTO_MURO + altoCristal / 2;
  faro.add(cristal);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    const junquillo = new THREE.Mesh(new THREE.BoxGeometry(0.08, altoCristal, 0.08), mat.oscuro);
    junquillo.position.set(Math.cos(a) * R_LINTERNA, cristal.position.y, Math.sin(a) * R_LINTERNA);
    faro.add(junquillo);
  }

  const cupula = new THREE.Mesh(new THREE.ConeGeometry(R_LINTERNA + 0.35, 1.5, 16), mat.oscuro);
  cupula.position.y = G + ALTO_MURO + altoCristal + 0.75;
  faro.add(cupula);
  const bola = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), mat.metal);
  bola.position.y = cupula.position.y + 0.85;
  faro.add(bola);
}

// Lámpara: la cabeza gira a los lados y la lente sube y baja
function crearLampara(faro, mat)
{
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 1.5, 12), mat.metal);
  pedestal.position.y = posLampara.y - 1.2;
  faro.add(pedestal);

  lampara = new THREE.Object3D();
  lampara.position.copy(posLampara);
  faro.add(lampara);
  const horquilla = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 0.3), mat.oscuro);
  horquilla.position.y = -0.55;
  lampara.add(horquilla);

  lente = new THREE.Object3D();
  lampara.add(lente);
  const tambor = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.0, 20), mat.metal);
  tambor.rotation.x = Math.PI / 2;
  lente.add(tambor);
  frenteLente = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), new THREE.MeshBasicMaterial({ color: 0xfff2c0 }));
  frenteLente.position.z = 0.51;
  lente.add(frenteLente);

  // Luz de la lámpara sobre la galería
  const resplandor = new THREE.PointLight(0xffc070, 0.8, 9);
  resplandor.position.set(0, G + 2.4, 0);
  faro.add(resplandor);
}

// Manivela con un farolillo, junto al muro
function crearManivela(faro, mat)
{
  const soporte = new THREE.Object3D();
  soporte.position.set(0, G + 1.05, R_LINTERNA + 0.2);
  faro.add(soporte);
  soporte.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.35), mat.oscuro));

  manivela = new THREE.Object3D();
  manivela.position.z = 0.25;
  soporte.add(manivela);
  const matLaton = new THREE.MeshPhongMaterial({ color: 0xc09040, shininess: 90 });
  manivela.add(new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.035, 8, 24), matLaton));
  for (let i = 0; i < 3; i++) {
    const radio = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.04, 0.04), matLaton);
    radio.rotation.z = i * Math.PI / 3;
    manivela.add(radio);
  }
  const mango = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.25, 8), mat.madera);
  mango.rotation.x = Math.PI / 2;
  mango.position.set(0.35, 0, 0.12);
  manivela.add(mango);

  const farolillo = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd080 }));
  farolillo.position.set(0, 0.75, 0.25);
  soporte.add(farolillo);
  const luzFarolillo = new THREE.PointLight(0xffb060, 1.2, 6);
  luzFarolillo.position.set(0, 0.75, 0.5);
  soporte.add(luzFarolillo);
}

function crearHaz()
{
  // Luz focal del haz, con sombras
  foco = new THREE.SpotLight(COLOR_HAZ, INTENSIDAD_HAZ, 360, HAZ_ANGULO, 0.35, 0.5);
  foco.position.copy(posLampara);
  foco.castShadow = true;
  foco.shadow.mapSize.set(1024, 1024);
  foco.shadow.camera.near = 2;
  foco.shadow.camera.far = 360;
  scene.add(foco);
  scene.add(foco.target);

  // Cono para que se vea el haz. Empieza a 25 m para no tapar la vista
  // y luego se escala según lo abierto que esté el haz
  const geo = new THREE.CylinderGeometry(25, 200, 175, 32, 1, true);
  geo.translate(0, -112.5, 0);
  geo.rotateX(-Math.PI / 2);
  conoHaz = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color: COLOR_HAZ, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false
  }));
  conoHaz.position.copy(posLampara);
  scene.add(conoHaz);
}

// Distancia de un punto a un segmento
function distanciaSegmento(x, z, ax, az, bx, bz)
{
  const dx = bx - ax, dz = bz - az;
  const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
  return Math.hypot(x - (ax + t * dx), z - (az + t * dz));
}

// Mira que la roca no tape un canal ni toque otra roca
function sitioLibre(x, z, r)
{
  for (let i = 0; i < rutas.length; i++) {
    const ru = rutas[i];
    if (distanciaSegmento(x, z, ru.ax, ru.az, ru.bx, ru.bz) < r + 9) return false;
  }
  for (let i = 0; i < rocas.length; i++) {
    if (Math.hypot(rocas[i].x - x, rocas[i].z - z) < rocas[i].r + r + 4) return false;
  }
  return true;
}

// Pone una roca y la guarda para los choques
function ponerRoca(modelo, x, z, escala)
{
  const roca = modelo.clone();
  roca.scale.setScalar(escala);
  roca.position.set(x, -0.4 * escala, z);
  roca.rotation.y = Math.random() * Math.PI * 2;
  scene.add(roca);
  rocas.push({ x: x, z: z, r: R_ROCA * escala });
}

// Isla del faro y rocas alrededor
function crearRocas()
{
  const isla = new THREE.Mesh(
    new THREE.CylinderGeometry(R_ISLA - 4, R_ISLA + 1, 5, 28),
    new THREE.MeshLambertMaterial({ map: textura('images/wet_ground_512x512.jpg', 4, 1), color: 0x777770 })
  );
  isla.receiveShadow = true;
  scene.add(isla);
  rocas.push({ x: 0, z: 0, r: R_ISLA + 1.5 });
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2;
    ponerRoca(modelosRoca[i % 3], Math.cos(a) * (R_ISLA + 1), Math.sin(a) * (R_ISLA + 1), 1.2 + Math.random() * 0.6);
  }

  // Rocas sueltas puestas al azar entre 30 m y R_PELIGRO - 10
  let colocadas = 0;
  for (let intentos = 0; intentos < 5000 && colocadas < NUM_ROCAS; intentos++) {
    const a = Math.random() * Math.PI * 2;
    const d = 30 + Math.random() * (R_PELIGRO - 40);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const escala = 1.0 + Math.random() * 1.2;
    if (sitioLibre(x, z, R_ROCA * escala)) {
      ponerRoca(modelosRoca[colocadas % 3], x, z, escala);
      colocadas++;
    }
  }
}

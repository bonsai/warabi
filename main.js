import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { checkAccess } from './area-lock.js';
import { MediaPipeController } from './mediapipe.js';
import { JellyEffect } from './jelly-effect.js';

// Initialize Access Check
// checkAccess(); // Moved to after config

// --------------------------------------------------------
// Configuration & Routing
// --------------------------------------------------------
const path = window.location.pathname;
const hash = window.location.hash;

// Default: Mobile
let config = {
  mode: 'mobile',
  debug: false,
  bypassAccess: false,
  jellyDetail: 10, // Lighter for mobile
  controlsEnabled: false,
  videoWidth: 480,
  videoHeight: 360,
  modelComplexity: 0 // Lite model
};

// Routing Logic
if (path === '/d' || hash === '#/d') {
  // Debug Mobile
  config.mode = 'debug_mobile';
  config.debug = true;
  config.bypassAccess = true;
  config.jellyDetail = 10;
  config.controlsEnabled = true;
  config.videoWidth = 480;
  config.videoHeight = 360;
  config.modelComplexity = 0;
} else if (path === '/d@pc' || hash === '#/d@pc') {
  // Debug PC
  config.mode = 'debug_pc';
  config.debug = true;
  config.bypassAccess = true;
  config.jellyDetail = 20;
  config.controlsEnabled = true;
  config.videoWidth = 1280;
  config.videoHeight = 720;
  config.modelComplexity = 1;
} else if (path === '/@pc' || hash === '#/@pc') {
  // PC Version (Current)
  config.mode = 'pc';
  config.debug = false;
  config.bypassAccess = false; // "Current" has checkAccess
  config.jellyDetail = 20;
  config.controlsEnabled = false; // "Current" has locked controls
  config.videoWidth = 1280;
  config.videoHeight = 720;
  config.modelComplexity = 1;
} else {
  // Root / Mobile
  // Default config applies
}

console.log(`Starting in [${config.mode}] mode`, config);

// Apply Access Check
async function init() {
  const debugInfo = document.getElementById('debug-info');
  function log(msg) {
    console.log(msg);
    if (debugInfo) debugInfo.innerText = msg;
  }
  
  // Override console.error to show on screen
  const originalError = console.error;
  console.error = function(...args) {
    originalError.apply(console, args);
    if (debugInfo) {
      debugInfo.style.color = 'red';
      debugInfo.innerText = "Error: " + args.join(' ');
    }
  };

  log("Requesting Location Access...");
  
  try {
    // 1. Check Location
    const allowed = await checkAccess(config.bypassAccess);
    if (!allowed && !config.bypassAccess) {
       log("Access Denied or Location Error.");
       // Don't hide deniedEl, it shows the detail.
       return; 
    }

    log("Location Verified. Initializing Camera & AI...");

    // 2. Setup Scene (Already done above globally, but we could move it here if needed)
    // For now, we assume scene setup is fast and synchronous enough.

    // 3. Start MediaPipe
    if (config.debug) {
      document.getElementById('input_video').style.display = 'block';
      // ... (style setting omitted for brevity, keeping existing logic below)
    }

    await mediaPipeController.start(videoElement, config);
    
    log("Ready!");
    setTimeout(() => {
        if (debugInfo) debugInfo.style.display = 'none';
    }, 1000);

    // 4. Start Animation Loop
    animate(0);

  } catch (e) {
    console.error(e);
    log("Init Failed: " + e.message);
  }
}

// Initialization started at the end of script

if (config.debug) {
  document.getElementById('input_video').style.display = 'block';
  document.getElementById('input_video').style.width = '160px'; // Small preview
  document.getElementById('input_video').style.position = 'absolute';
  document.getElementById('input_video').style.bottom = '0';
  document.getElementById('input_video').style.left = '0';
  document.getElementById('input_video').style.zIndex = '999';
}

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(45, innerWidth/innerHeight, 0.1, 100);
camera.position.set(0, 0, 8);

// Mobile Optimization: Adjust camera distance for portrait mode
if (innerWidth < innerHeight) {
    camera.position.z = 10;
}

const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(devicePixelRatio);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enableRotate = config.controlsEnabled; 
controls.enableZoom = config.controlsEnabled;
controls.enablePan = config.controlsEnabled;

// --------------------------------------------------------
// 背景（カメラ映像＋グレー＋荒く）
// --------------------------------------------------------
const videoElement = document.getElementById('input_video');
const videoTexture = new THREE.VideoTexture(videoElement);
videoTexture.colorSpace = THREE.SRGBColorSpace;

const bgGeometry = new THREE.PlaneGeometry(2, 2);
const bgMaterial = new THREE.ShaderMaterial({
  uniforms: {
    tDiffuse: { value: videoTexture },
    resolution: { value: new THREE.Vector2(innerWidth, innerHeight) }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4( position, 1.0 );
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    varying vec2 vUv;
    
    void main() {
      // 左右反転 (Mirror)
      vec2 uv = vec2(1.0 - vUv.x, vUv.y);

      // ピクセル化（より細かく）
      float pixelSize = 4.0; // 10.0 -> 4.0
      vec2 dxy = pixelSize / resolution;
      vec2 coord = floor(uv / dxy) * dxy;
      
      vec4 color = texture2D(tDiffuse, coord);
      
      // グレースケール & 暗くする (More Black)
      float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
      gl_FragColor = vec4(vec3(gray * 0.05), 1.0); // 0.15 -> 0.05 (Darker)
    }
  `,
  depthTest: false,
  depthWrite: false
});
const bgMesh = new THREE.Mesh(bgGeometry, bgMaterial);
scene.add(bgMesh);

// --------------------------------------------------------
// 光
// --------------------------------------------------------
const light = new THREE.DirectionalLight(0xffffff, 3);
light.position.set(5, 8, 6);
scene.add(light);
scene.add(new THREE.AmbientLight(0xffffff, 0.5));

// --------------------------------------------------------
// ゼリー本体
// --------------------------------------------------------
const jellyEffect = new JellyEffect(config.jellyDetail);
const jelly = jellyEffect.mesh;
jelly.position.set(0, 0, 0);
scene.add(jelly);

const material = jelly.material; // For compatibility if referenced elsewhere
const interactionUniforms = jellyEffect.uniforms;

// --------------------------------------------------------
// Finger Markers & MediaPipe
// --------------------------------------------------------
const mediaPipeController = new MediaPipeController(scene, camera, renderer, jelly, interactionUniforms);
// Start handled in init()

// --------------------------------------------------------
// Animation Loop
// --------------------------------------------------------
let time = 0;
let lastTime = 0;
const fpsInterval = 1000 / 15; // 15 FPS

function animate(currentTime) {
  requestAnimationFrame(animate);
  
  const delta = currentTime - lastTime;
  if (delta > fpsInterval) {
    lastTime = currentTime - (delta % fpsInterval);
    
    time += 0.016 * (delta / 16.66); // 時間経過補正（概算）

    if (material.userData.shader) {
      // material.userData.shader.uniforms.time.value = time; // Managed by jellyEffect
      jellyEffect.update(time);
    }
    
    controls.update();
    renderer.render(scene, camera);
    
    // GIF Recording & Updates
    mediaPipeController.update(fpsInterval);
  }
}

// リサイズ対応
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  
  // Update camera distance on resize (optional, but good for rotation)
  if (innerWidth < innerHeight) {
      if (camera.position.z < 9) camera.position.z = 10;
  } else {
      // Reset if landscape? Maybe keep it flexible or don't force it back.
      // Let's just ensure it's not too close.
  }

  renderer.setSize(innerWidth, innerHeight);
  bgMaterial.uniforms.resolution.value.set(innerWidth, innerHeight);
});

// Start the application
init();

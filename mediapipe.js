import * as THREE from 'three';
import { GestureRecognizer } from './gesture.js';

export class MediaPipeController {
  constructor(scene, camera, renderer, jelly, interactionUniforms, innerJelly = null) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.jelly = jelly;
    this.innerJelly = innerJelly; // Optional Inner Jelly
    this.interactionUniforms = interactionUniforms;
    
    // Gesture Recognizer
    this.gestureRecognizer = new GestureRecognizer();
    
    // Load config from gesture.json
    fetch('./gesture.json')
        .then(res => res.json())
        .then(config => {
            console.log("Loaded gesture config:", config);
            this.gestureRecognizer.config = config;
        })
        .catch(err => console.warn("Using default gesture config (failed to load json)", err));

    // Constants
    this.MAX_FINGERS = 10;
    this.THUMB_SPAWN_TIME = 600;
    this.AUTO_SPAWN_TIME = 2000;
    this.RECORD_DURATION = 6000;
    this.UNBREAKABLE_SCALE = 1.2;
    this.MAX_BURST_SCALE = 3.0;
    
    // State
    this.markers = [];
    this.prevFingerStates = {};
    this.respawnTimer = 0;
    this.lastUpdateTime = performance.now();
    
    this.isRecording = false;
    this.recordStartTime = 0;
    this.lastFrameTime = 0; 
    this.gif = null;

    this.initMarkers();
  }

  initMarkers() {
    const markerGroup = new THREE.Group();
    this.scene.add(markerGroup);

    // Glow Texture Generation
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255, 255, 0, 0.6)');
    gradient.addColorStop(1, 'rgba(255, 255, 0, 0.0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    const glowTexture = new THREE.CanvasTexture(canvas);

    for (let i = 0; i < this.MAX_FINGERS; i++) {
      const g = new THREE.Group();
      
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xffff00 })
      );
      g.add(dot);

      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ 
          map: glowTexture, 
          transparent: true, 
          blending: THREE.AdditiveBlending 
        })
      );
      sprite.scale.set(0.8, 0.8, 1.0);
      g.add(sprite);
      
      g.visible = false;
      markerGroup.add(g);
      this.markers.push(g);
    }
  }

  start(videoElement) {
    const hands = new window.Hands({locateFile: (file) => {
      return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
    }});
    
    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });
    
    hands.onResults((results) => this.onResults(results));

    const cameraUtils = new window.Camera(videoElement, {
      onFrame: async () => {
        await hands.send({image: videoElement});
      },
      width: 1280,
      height: 720
    });
    
    cameraUtils.start();
  }

  update(fpsInterval) {
    const now = performance.now();
    const dt = now - this.lastUpdateTime;
    this.lastUpdateTime = now;
    
    // Update Gesture State (for time-based resets)
    this.gestureRecognizer.update(dt);

    // Auto Respawn (Standard 2s)
    if (!this.jelly.visible) {
        this.respawnTimer += dt;
        if (this.respawnTimer > this.AUTO_SPAWN_TIME) {
             this.resetJelly();
             this.respawnTimer = 0;
        }
    } else {
        this.respawnTimer = 0;
    }

    if (this.isRecording && this.gif) {
      // Limit GIF frame rate to ~10fps (100ms interval) to avoid crash
      if (now - this.lastFrameTime > 100) {
        // Create a temporary canvas for cropping
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = this.cropParams.dWidth;
        tempCanvas.height = this.cropParams.dHeight;
        const ctx = tempCanvas.getContext('2d');
        
        // Draw cropped image
        // void ctx.drawImage(image, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight);
        ctx.drawImage(
            this.renderer.domElement, 
            this.cropParams.sx, this.cropParams.sy, this.cropParams.sWidth, this.cropParams.sHeight,
            0, 0, this.cropParams.dWidth, this.cropParams.dHeight
        );

        this.gif.addFrame(tempCanvas, {copy: true, delay: 100});
        this.lastFrameTime = now;
      }
      
      if (now - this.recordStartTime > this.RECORD_DURATION) {
        this.burstJelly(); // Burst at the end
        this.stopRecording();
      }
    }
  }

  burstJelly() {
    if (!this.jelly.visible) return;
    this.jelly.visible = false;
    console.log("Jelly Burst!");
    // Auto respawn handled in update()
  }

  resetJelly() {
    this.jelly.scale.set(0.5, 0.5, 0.5);
    this.jelly.visible = true;
    console.log("Jelly Respawned");
  }

  startRecording() {
    if (this.isRecording) return;
    console.log("Start Recording GIF...");
    this.isRecording = true;
    this.recordStartTime = performance.now();
    
    // Crop to center (square-ish)
    // Source dimensions (Physical pixels)
    const srcW = this.renderer.domElement.width;
    const srcH = this.renderer.domElement.height;
    const sourceSize = Math.min(srcW, srcH);
    
    // Output dimensions (GIF size) - Max 480px
    const outSize = Math.min(sourceSize, 480);

    this.gif = new window.GIF({
      workers: 2,
      quality: 10,
      workerScript: 'gif.worker.js',
      width: outSize,
      height: outSize
    });
    
    // Store crop parameters for update()
    this.cropParams = {
        sx: (srcW - sourceSize) / 2,
        sy: (srcH - sourceSize) / 2,
        sWidth: sourceSize,
        sHeight: sourceSize,
        dWidth: outSize,
        dHeight: outSize
    };

    const div = document.createElement('div');
    div.id = 'rec-indicator';
    div.innerText = "REC";
    div.style.position = 'absolute';
    div.style.top = '10px';
    div.style.left = '10px';
    div.style.color = 'red';
    div.style.fontSize = '30px';
    div.style.fontWeight = 'bold';
    document.body.appendChild(div);
  }

  stopRecording() {
    if (!this.isRecording) return;
    console.log("Stop Recording GIF...");
    this.isRecording = false;
    
    const div = document.getElementById('rec-indicator');
    if (div) div.remove();
    
    // Create status indicator
    const statusDiv = document.createElement('div');
    statusDiv.id = 'status-indicator';
    statusDiv.innerText = "Encoding...";
    statusDiv.style.position = 'absolute';
    statusDiv.style.top = '10px';
    statusDiv.style.left = '10px';
    statusDiv.style.color = 'yellow';
    statusDiv.style.fontSize = '24px';
    statusDiv.style.fontWeight = 'bold';
    document.body.appendChild(statusDiv);

    this.gif.on('finished', function(blob) {
      // Auto Download
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `jelly-warabi-${Date.now()}.gif`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      if (statusDiv) statusDiv.remove();
    });

    this.gif.render();
  }

  onResults(results) {
    this.markers.forEach(m => m.visible = false);
    
    let closestDist = 999;
    let closestPos = new THREE.Vector3(999, 999, 999);
    
    const now = performance.now();
    const fingerTipIndices = [4, 8, 12, 16, 20];

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      let markerIndex = 0;

      results.multiHandLandmarks.forEach((landmarks, handIndex) => {
        // Gesture Detection
        const detection = this.gestureRecognizer.detectHands(landmarks);
        
        if (detection.gesture === 'peace_record' && !this.isRecording) {
            this.startRecording();
        }
        
        if (detection.gesture === 'thumb_spawn') {
             if (!this.jelly.visible) {
               this.resetJelly();
            }
        }

        // 3. Prayer (Namaste) -> Burst (Only when HUGE)
        if (results.multiHandLandmarks.length === 2) {
            if (this.gestureRecognizer.detectPrayer(results.multiHandLandmarks[0], results.multiHandLandmarks[1])) {
                if (this.jelly.scale.x >= this.MAX_BURST_SCALE * 0.95) {
                    this.burstJelly();
                }
            }
        }

        // Debug Info
        const debugEl = document.getElementById('debug-info');
        if (debugEl) {
            let status = "None";
            if (detection.progress.peace > 0) status = `Peace (${(detection.progress.peace*100).toFixed(0)}%)`;
            else if (detection.progress.thumb > 0) status = `Thumb (${(detection.progress.thumb*100).toFixed(0)}%)`;
            
            debugEl.innerHTML = `Gesture: ${status}<br>Jelly Scale: ${this.jelly.scale.x.toFixed(2)}`;
        }

        fingerTipIndices.forEach(tipIdx => {
          if (markerIndex >= this.MAX_FINGERS) return;

          const tip = landmarks[tipIdx];
          
          const visibleHeight = 2 * Math.tan((this.camera.fov * Math.PI / 180) / 2) * this.camera.position.z;
          const visibleWidth = visibleHeight * this.camera.aspect;
          
          const x = (0.5 - tip.x) * visibleWidth; 
          const y = (0.5 - tip.y) * visibleHeight;
          const z = 0; 
          
          const handPos = new THREE.Vector3(x, y, z);
          
          const marker = this.markers[markerIndex];
          marker.position.copy(handPos);
          marker.visible = true;
          markerIndex++;

          const dist = handPos.distanceTo(this.jelly.position);
          
          if (dist < closestDist) {
            closestDist = dist;
            closestPos.copy(handPos);
          }

          const key = `${handIndex}_${tipIdx}`;
          this.prevFingerStates[key] = { pos: handPos.clone(), time: now };

          const hitRadius = 1.8 * this.jelly.scale.x; 
          
          if (dist < hitRadius + 0.2) { 
            // Register Hit for Rapid Tap
            if (this.innerJelly && this.gestureRecognizer.registerHit()) {
                // Trigger Rapid Tap Action -> Show Inner Jelly
                console.log("Rapid Tap Detected! Spawning Inner Jelly.");
                this.innerJelly.visible = true;
                // Maybe reset inner jelly scale to small?
                this.innerJelly.scale.set(0.01, 0.01, 0.01);
            }

            // Only grow, never break by impact
            if (this.jelly.visible) {
              this.jelly.scale.addScalar(0.005);
              // Cap size
              if (this.jelly.scale.x > this.MAX_BURST_SCALE) {
                  this.jelly.scale.setScalar(this.MAX_BURST_SCALE);
              }
            }
          }
        });
      });
      
      this.interactionUniforms.uHandPos.value.copy(closestPos);
      
      if (closestDist < 2.5 * this.jelly.scale.x) {
         this.interactionUniforms.uStrength.value += (1.0 - this.interactionUniforms.uStrength.value) * 0.1;
      } else {
         this.interactionUniforms.uStrength.value += (0.0 - this.interactionUniforms.uStrength.value) * 0.1;
      }

    } else {
      this.gestureRecognizer.reset();
      this.interactionUniforms.uStrength.value *= 0.9;
      this.interactionUniforms.uHandPos.value.set(999, 999, 999);
      // No Hand Auto Spawn logic is now in update()
    }
  }
}

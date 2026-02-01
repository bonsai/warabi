import * as THREE from 'three';

export class MediaPipeController {
  constructor(scene, camera, renderer, jelly, interactionUniforms) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.jelly = jelly;
    this.interactionUniforms = interactionUniforms;

    // Constants
    this.MAX_FINGERS = 10;
    this.GESTURE_THRESHOLD = 500;
    this.RECORD_DURATION = 6000;
    this.UNBREAKABLE_SCALE = 1.2;
    this.MAX_BURST_SCALE = 2.5;
    this.NO_HAND_THRESHOLD = 2000;

    // State
    this.markers = [];
    this.prevFingerStates = {};
    this.peaceSignDuration = 0;
    this.thumbUpDuration = 0;
    this.openPalmDuration = 0;
    this.shakeCount = 0;
    this.lastPalmX = null;
    this.lastPalmDir = 0; // 1: right, -1: left
    this.lastShakeTime = 0;
    this.noHandDuration = 0;
    
    this.isRecording = false;
    this.recordStartTime = 0;
    this.lastFrameTime = 0; // For GIF frame rate limiting
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
    if (this.isRecording && this.gif) {
      const now = performance.now();
      // Limit GIF frame rate to ~10fps (100ms interval) to avoid crash
      if (now - this.lastFrameTime > 100) {
        this.gif.addFrame(this.renderer.domElement, {copy: true, delay: 100});
        this.lastFrameTime = now;
      }
      
      if (now - this.recordStartTime > this.RECORD_DURATION) {
        this.stopRecording();
      }
    }
  }

  burstJelly() {
    if (!this.jelly.visible) return;
    this.jelly.visible = false;
    console.log("Jelly Burst!");
    setTimeout(() => {
        this.resetJelly();
    }, 3000);
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
    
    this.gif = new window.GIF({
      workers: 2,
      quality: 10,
      workerScript: 'gif.worker.js',
      width: 640,
      height: 360
    });
    
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
      this.noHandDuration = 0;
      let markerIndex = 0;

      results.multiHandLandmarks.forEach((landmarks, handIndex) => {
        const thumbExtended = landmarks[4].y < landmarks[3].y;
        const indexExtended = landmarks[8].y < landmarks[6].y;
        const middleExtended = landmarks[12].y < landmarks[10].y;
        const ringExtended = landmarks[16].y < landmarks[14].y;
        const pinkyExtended = landmarks[20].y < landmarks[18].y;
        
        // 1. Peace Sign -> Record
        if (indexExtended && middleExtended && !ringExtended && !pinkyExtended) {
           this.peaceSignDuration += 16;
        } else {
           this.peaceSignDuration = 0;
        }

        if (this.peaceSignDuration > 1000 && !this.isRecording) {
           this.startRecording();
           this.peaceSignDuration = 0;
        }
        
        // 2. Thumbs Up -> Manual Respawn
        if (thumbExtended && !indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
            this.thumbUpDuration += 16;
        } else {
            this.thumbUpDuration = 0;
        }
        
        if (this.thumbUpDuration > this.GESTURE_THRESHOLD) {
            if (!this.jelly.visible) {
               this.resetJelly();
            }
            this.thumbUpDuration = 0;
        }

        // 3. Shaking Palm -> End (Hide)
        // Detect horizontal shake
        const palmX = landmarks[0].x; // Wrist/Palm base x
        if (this.lastPalmX !== null) {
            const dx = palmX - this.lastPalmX;
            // Check direction change with sufficient speed
            if (Math.abs(dx) > 0.02) { // Threshold for movement speed
                const dir = dx > 0 ? 1 : -1;
                if (this.lastPalmDir !== 0 && dir !== this.lastPalmDir) {
                    this.shakeCount++;
                    this.lastShakeTime = now;
                }
                this.lastPalmDir = dir;
            }
        }
        this.lastPalmX = palmX;

        // Reset shake count if too slow
        if (now - this.lastShakeTime > 500) {
            this.shakeCount = 0;
        }

        if (this.shakeCount > 4) { // 2 round trips
            if (this.jelly.visible) {
                this.jelly.visible = false;
                console.log("Manual End/Hide (Shake)!");
            }
            this.shakeCount = 0;
        }
        
        // Debug Info
        const debugEl = document.getElementById('debug-info');
        if (debugEl) {
            let status = "None";
            if (this.peaceSignDuration > 0) status = `Peace (${(this.peaceSignDuration/1000*100).toFixed(0)}%)`;
            else if (this.thumbUpDuration > 0) status = `Thumb (${(this.thumbUpDuration/this.GESTURE_THRESHOLD*100).toFixed(0)}%)`;
            else if (this.shakeCount > 0) status = `Shake (${this.shakeCount})`;
            
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
          let speed = 0;
          
          if (this.prevFingerStates[key]) {
            const prev = this.prevFingerStates[key];
            const dt = now - prev.time;
            if (dt > 0) {
              const dPos = handPos.distanceTo(prev.pos);
              speed = dPos / dt * 1000;
            }
          }
          
          this.prevFingerStates[key] = { pos: handPos.clone(), time: now };

          const hitRadius = 1.8 * this.jelly.scale.x; 
          
          if (dist < hitRadius + 0.2) { 
            
            if (speed > 15.0) { 
              if (this.jelly.scale.x < this.UNBREAKABLE_SCALE) {
                 this.burstJelly();
              } else {
                 console.log("Too big to break!");
              }
            } else {
              if (this.jelly.visible) {
                this.jelly.scale.addScalar(0.005);
                if (this.jelly.scale.x > this.MAX_BURST_SCALE) {
                    this.burstJelly();
                }
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
      this.peaceSignDuration = 0;
      this.interactionUniforms.uStrength.value *= 0.9;
      this.interactionUniforms.uHandPos.value.set(999, 999, 999);

      this.noHandDuration += 16;
      if (this.noHandDuration > this.NO_HAND_THRESHOLD) {
          if (this.jelly.visible && this.jelly.scale.x === 0.5) {
          } else {
               this.resetJelly();
          }
          this.noHandDuration = 0;
      }
    }
  }
}

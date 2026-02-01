import * as THREE from 'three';

export class JellyEffect {
  constructor(detail = 20) {
    this.uniforms = {
      time: { value: 0 },
      uHandPos: { value: new THREE.Vector3(999, 999, 999) },
      uStrength: { value: 0.0 }
    };
    this.mesh = this.createMesh(detail);
  }

  createMesh(detail) {
    const geometry = new THREE.IcosahedronGeometry(1.8, detail);

    const material = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0.0,
      roughness: 0.15,
      transmission: 0.99,
      ior: 1.4,
      thickness: 0.5,
      iridescence: 1.0,
      iridescenceIOR: 1.33,
      iridescenceThicknessRange: [100, 800],
      clearcoat: 0.1,
      clearcoatRoughness: 0.1,
      side: THREE.DoubleSide
    });

    material.onBeforeCompile = (shader) => {
      shader.uniforms.time = this.uniforms.time;
      shader.uniforms.uHandPos = this.uniforms.uHandPos;
      shader.uniforms.uStrength = this.uniforms.uStrength;
      
      material.userData.shader = shader;

      shader.vertexShader = `
        uniform float time;
        uniform vec3 uHandPos;
        uniform float uStrength;
        varying vec3 vMyNormal;
        varying vec3 vMyViewDir;
        ${shader.vertexShader}
      `.replace(
        `#include <begin_vertex>`,
        `#include <begin_vertex>

        // 距離ベースの変形（手が近いとへこむ・揺れる）
        float dist = distance(position, uHandPos);
        float effect = smoothstep(1.5, 0.0, dist) * uStrength; // 近いほど影響大
        
        // ぷるぷる（基本）
        float baseWave = sin(position.x * 2.5 + time * 3.0) * 0.1
                       + sin(position.y * 3.0 + time * 2.5) * 0.1
                       + sin(position.z * 3.5 + time * 2.8) * 0.05;

        // 接触時の激しい揺れ
        float touchWave = sin(position.x * 10.0 + time * 20.0) * 0.2
                        + sin(position.y * 12.0 + time * 18.0) * 0.2;
        
        float wave = baseWave + touchWave * effect;
        
        // 手が触れている方向に少し押し込む
        vec3 pushDir = normalize(position - uHandPos);
        transformed += normal * wave + pushDir * effect * 0.5;
        
        // 視線計算用
        vMyNormal = normalize(normalMatrix * normal);
        vec4 mvPos = modelViewMatrix * vec4(transformed, 1.0);
        vMyViewDir = -mvPos.xyz;
        `
      );

      shader.fragmentShader = `
        uniform float time;
        varying vec3 vMyNormal;
        varying vec3 vMyViewDir;
        ${shader.fragmentShader}
      `.replace(
        `#include <color_fragment>`,
        `#include <color_fragment>
        
        vec3 viewDir = normalize(vMyViewDir);
        vec3 myNormal = normalize(vMyNormal);
        float viewAngle = dot(myNormal, viewDir);

        float hue = viewAngle * 0.5 + time * 0.1; 
        vec3 rainbow = 0.5 + 0.5 * cos(6.28 * (hue + vec3(0.0, 0.33, 0.67)));
        rainbow += 0.1;
        diffuseColor.rgb = rainbow;
        `
      );
    };

    const mesh = new THREE.Mesh(geometry, material);
    mesh.scale.set(0.5, 0.5, 0.5);
    return mesh;
  }

  update(deltaTime) {
    // time updates usually rely on absolute time or delta accumulation
    // Here we assume consumer accumulates time or we accumulate it.
    // punyu.html uses explicit `time` variable.
    // Let's make update accept `time` or `deltaTime`.
    // punyu.html logic: `time += 0.016 * (delta / 16.66)`
    // Let's just set the time value directly to be flexible.
    if (typeof deltaTime === 'number') {
        this.uniforms.time.value = deltaTime;
    }
  }

  setInteraction(position, strength) {
    if (position) this.uniforms.uHandPos.value.copy(position);
    if (strength !== undefined) this.uniforms.uStrength.value = strength;
  }
}

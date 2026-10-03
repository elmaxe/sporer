import * as THREE from 'three';

/**
 * Crossfades two levels' pictures on screen. The outgoing level is drawn
 * first, as usual, and copied from the canvas (`capture`); the incoming level
 * is then drawn over the canvas as usual, and the copy is laid over it at the
 * outgoing level's weight (`draw`). Both pictures are final (tone mapped, in
 * the output colour space, with each level's own exposure), which render
 * targets wouldn't give (three skips tone mapping into them), so the mix is a
 * plain video crossfade. Only used while a crossfade runs.
 */
export class Crossfade {
  private texture: THREE.FramebufferTexture | null = null;
  private readonly size = new THREE.Vector2();
  private readonly scene = Object.assign(new THREE.Scene(), { name: 'Crossfade' });
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly material = new THREE.ShaderMaterial({
    uniforms: { map: { value: null }, opacity: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }`,
    // Raw copy: the captured pixels are already final, so no tone mapping or colour space conversion.
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform float opacity;
      varying vec2 vUv;
      void main() {
        gl_FragColor = vec4(texture2D(map, vUv).rgb, opacity);
      }`,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);

  constructor() {
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  /** Copies what the canvas shows now (the outgoing level's picture). */
  capture(renderer: THREE.WebGLRenderer): void {
    const { x, y } = renderer.getDrawingBufferSize(this.size);
    if (!this.texture || this.texture.image.width !== x || this.texture.image.height !== y) {
      this.texture?.dispose();
      this.texture = new THREE.FramebufferTexture(x, y);
    }
    renderer.copyFramebufferToTexture(this.texture);
  }

  /** Lays the captured picture over the canvas at `opacity` (1 = only the captured one shows). */
  draw(renderer: THREE.WebGLRenderer, opacity: number): void {
    if (!this.texture) return;
    this.material.uniforms.map!.value = this.texture;
    this.material.uniforms.opacity!.value = opacity;
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(this.scene, this.camera);
    renderer.autoClear = autoClear;
  }

  dispose(): void {
    this.texture?.dispose();
    this.texture = null;
    this.quad.geometry.dispose();
    this.material.dispose();
  }
}
